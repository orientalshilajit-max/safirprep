"use server"

import { createNotification } from "@/lib/notifications-server"

// ============================================================
// Safir WMS – Files Server Actions
//
// STORAGE SETUP (one-time, via Supabase dashboard):
//   1. Create a storage bucket named "files".
//   2. Set the bucket to PUBLIC (or configure per-object signed-URL
//      policies). Public is simplest; DB RLS is the primary
//      access-control layer since file URLs contain UUIDs.
//   3. No storage RLS policies are required when using the
//      service-role key for uploads (it bypasses storage auth).
// ============================================================

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createServerAdminClient }     from "@/lib/supabase"
import type { FileDoc, FileCategory } from "@/lib/types"

// ── Category mapping ──────────────────────────────────────────

const CATEGORY_FROM_DB: Record<string, FileCategory> = {
  agreements:    "Agreements",
  labels:        "Labels",
  shipment_docs: "Shipment Docs",
  product_docs:  "Product Docs",
  invoices:      "Invoices",
  other:         "Other",
}

const CATEGORY_TO_DB: Record<FileCategory, string> = {
  "Agreements":    "agreements",
  "Labels":        "labels",
  "Shipment Docs": "shipment_docs",
  "Product Docs":  "product_docs",
  "Invoices":      "invoices",
  "Other":         "other",
}

const STORAGE_BUCKET = "files"

// ── Helpers ───────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024)           return `${bytes} B`
  if (bytes < 1024 * 1024)    return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Row type ──────────────────────────────────────────────────

type DbFileRow = {
  id:               string
  client_id:        string
  product_id:       string | null
  shipment_id:      string | null
  request_id:       string | null
  invoice_id:       string | null
  category:         string
  file_name:        string
  file_url:         string
  thumbnail_url:    string | null
  file_type:        string | null
  file_size_bytes:  number | null
  uploaded_by:      string | null  // uuid — auth.users.id
  uploaded_by_name: string | null  // text — human-readable display name
  created_at:       string
  clients:               { company_name: string } | null
  products:              { name: string }         | null
  incoming_shipments:    { shipment_number: string } | null
  service_requests:      { request_number: string }  | null
}

// Extract bucket-relative path from a Supabase public storage URL
function extractStoragePath(fileUrl: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx    = fileUrl.indexOf(marker)
  if (idx !== -1) return decodeURIComponent(fileUrl.slice(idx + marker.length))
  return null
}

function mapRow(row: DbFileRow): FileDoc {
  const ext = row.file_name.split(".").pop()?.toLowerCase() ?? "bin"

  let relatedTo:   string                = "General"
  let relatedType: FileDoc["relatedType"] = "general"
  let relatedId:   string                = ""

  if (row.product_id) {
    relatedTo   = row.products?.name ?? row.product_id
    relatedType = "product"
    relatedId   = row.product_id
  } else if (row.shipment_id) {
    relatedTo   = row.incoming_shipments?.shipment_number ?? row.shipment_id
    relatedType = "shipment"
    relatedId   = row.shipment_id
  } else if (row.request_id) {
    relatedTo   = row.service_requests?.request_number ?? row.request_id
    relatedType = "service-request"
    relatedId   = row.request_id
  }

  return {
    id:          row.id,
    name:        row.file_name,
    ext,
    size:        row.file_size_bytes ? formatBytes(row.file_size_bytes) : "—",
    category:    CATEGORY_FROM_DB[row.category] ?? "Other",
    relatedTo,
    relatedType,
    relatedId,
    clientId:    row.client_id,
    clientName:  row.clients?.company_name ?? "",
    uploadedBy:  row.uploaded_by_name ?? "",
    uploadedAt:  new Date(row.created_at).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    }),
    fileUrl: row.file_url,
  }
}

const FILE_SELECT = `
  id, client_id, product_id, shipment_id, request_id, invoice_id,
  category, file_name, file_url, thumbnail_url,
  file_type, file_size_bytes, uploaded_by, uploaded_by_name, created_at,
  clients (company_name),
  products (name),
  incoming_shipments (shipment_number),
  service_requests (request_number)
` as const

// ── listFiles ─────────────────────────────────────────────────

export async function listFiles(): Promise<FileDoc[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("files")
    .select(FILE_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => mapRow(r as unknown as DbFileRow))
}

// ── uploadFile ────────────────────────────────────────────────
// Accepts a FormData payload from the client.
//
// FormData fields:
//   file           – the File object
//   clientId       – target client UUID (admin supplies; clients from JWT)
//   category       – FileCategory label (app string, e.g. "Labels")
//   productId      – optional related product UUID
//   shipmentId     – optional related shipment UUID
//   requestId      – optional related service request UUID
//   uploadedBy     – display name of the uploader
//
// Upload flow:
//   1. Validate auth / derive clientId
//   2. Upload binary to Supabase Storage with service-role key
//      (bypasses storage RLS; DB RLS is the access gate)
//   3. Insert record into files table with user session client
//      (DB RLS enforces client-owns-client_id rule)

export async function uploadFile(formData: FormData): Promise<FileDoc> {
  const supabase      = await createSupabaseServerClient()
  const supabaseAdmin = createServerAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const isAdmin = user.app_metadata?.role === "admin"

  // Resolve clientId: admin picks one; client uses their JWT claim
  const formClientId = (formData.get("clientId") as string | null)?.trim() ?? ""
  const clientId = isAdmin
    ? formClientId
    : (user.app_metadata?.client_id as string | undefined) ?? ""

  if (!clientId) {
    throw new Error(isAdmin ? "Select a client before uploading." : "Client ID not found in session.")
  }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) throw new Error("No file selected.")

  const category       = (formData.get("category")      as FileCategory) ?? "Other"
  const productId      = (formData.get("productId")     as string | null) || null
  const shipmentId     = (formData.get("shipmentId")    as string | null) || null
  const requestId      = (formData.get("requestId")     as string | null) || null
  // uploadedBy is a human-readable display name (e.g. company name) — stored in uploaded_by_name text column.
  // The uuid uploaded_by column receives user.id from the authenticated session.
  const uploadedByName = (formData.get("uploadedBy")    as string | null) ?? ""

  // Sanitize filename: lowercase, replace non-alphanumeric runs with hyphens
  const rawExt  = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : ""
  const rawBase = rawExt ? file.name.slice(0, -(rawExt.length + 1)) : file.name
  const safeBase = rawBase.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "file"
  const safeFileName = rawExt ? `${safeBase}.${rawExt}` : safeBase
  const timestamp    = Date.now()

  // Structured path within the bucket: {clientId}/requests/{requestId}/{ts}-{name}
  const storagePath = requestId
    ? `${clientId}/requests/${requestId}/${timestamp}-${safeFileName}`
    : `${clientId}/${timestamp}-${safeFileName}`

  // Upload to Supabase Storage (service-role bypasses bucket RLS)
  const { error: storageErr } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false })
  if (storageErr) {
    throw new Error(
      `Storage upload failed (bucket: "${STORAGE_BUCKET}", path: "${storagePath}"): ${storageErr.message}`
    )
  }

  // Retrieve the public URL for the uploaded file
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath)

  // Insert file record — user client respects DB RLS.
  // uploaded_by (uuid) = authenticated user's auth.users.id
  // uploaded_by_name (text) = human-readable display name passed from the client
  // file_path is a new column not yet in generated Supabase types — assign via cast
  const insertPayload = {
    client_id:        clientId,
    product_id:       productId,
    shipment_id:      shipmentId,
    request_id:       requestId,
    category:         (CATEGORY_TO_DB[category] ?? "other") as "agreements" | "labels" | "shipment_docs" | "product_docs" | "invoices" | "other",
    file_name:        file.name,
    file_url:         publicUrl,
    file_type:        file.type || null,
    file_size_bytes:  file.size,
    uploaded_by:      user.id,
    uploaded_by_name: uploadedByName || null,
  };
  (insertPayload as Record<string, unknown>).file_path = storagePath

  const { data: record, error: dbErr } = await supabase
    .from("files")
    .insert(insertPayload)
    .select("id")
    .single()
  if (dbErr) {
    // Best-effort cleanup of orphaned storage object
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([storagePath])
    throw new Error(`Database insert failed (files table): ${dbErr.message}`)
  }

  // Fetch the full row to return
  const { data: full, error: fErr } = await supabase
    .from("files")
    .select(FILE_SELECT)
    .eq("id", record.id)
    .single()
  if (fErr) throw new Error(fErr.message)
  const result = mapRow(full as unknown as DbFileRow)

  if (!isAdmin) {
    void createNotification({
      recipientRole: "admin",
      actorUserId:   user.id,
      actorRole:     "client",
      type:          "file_uploaded",
      title:         "File uploaded",
      message:       `${result.clientName} uploaded file "${result.name}".`,
      entityType:    "file",
      entityId:      result.id,
      linkUrl:       "/files",
    })
  } else {
    void createNotification({
      recipientClientId: clientId,
      actorRole:         "admin",
      type:              "file_shared",
      title:             "New file available",
      message:           `A new file "${result.name}" has been shared with you.`,
      entityType:        "file",
      entityId:          result.id,
      linkUrl:           "/files",
    })
  }

  return result
}

// ── deleteFile ────────────────────────────────────────────────
// Deletes the storage object and the DB record.
// Returns success or a typed error so the caller can show the right message.

export type DeleteFileResult =
  | { success: true }
  | { success: false; error: string; partiallyDeleted?: boolean }

export async function deleteFile(id: string): Promise<DeleteFileResult> {
  const supabase = await createSupabaseServerClient()
  const admin    = createServerAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Unauthorized." }
  const isAdmin  = user.app_metadata?.role === "admin"
  const clientId = user.app_metadata?.client_id as string | undefined

  // Fetch via admin client so we can always read the record regardless of RLS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error: fetchErr } = await (admin as any)
    .from("files")
    .select("id, client_id, product_id, file_url, uploaded_by")
    .eq("id", id)
    .maybeSingle()

  if (fetchErr) return { success: false, error: fetchErr.message }
  if (!row)     return { success: false, error: "File not found." }

  // Permission: client can only delete files belonging to their own client account
  if (!isAdmin && row.client_id !== clientId) {
    return { success: false, error: "You can only delete your own files." }
  }

  // Resolve storage path from the public URL (works for all existing files)
  const storagePath: string | null =
    extractStoragePath(row.file_url as string, STORAGE_BUCKET)

  if (!storagePath) {
    return { success: false, error: "Cannot determine storage path for this file." }
  }

  // 1. Delete from storage (service-role bypasses bucket RLS)
  const { error: storageErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .remove([storagePath])

  if (storageErr) {
    console.error("[deleteFile] storage removal failed:", storageErr.message)
    return { success: false, error: `Storage deletion failed: ${storageErr.message}` }
  }

  // 2. If linked to a product and the URL matches its image_url, clear the image
  if (row.product_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: product } = await (admin as any)
      .from("products")
      .select("image_url")
      .eq("id", row.product_id)
      .maybeSingle()
    if (product && (product as { image_url: string }).image_url === row.file_url) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("products")
        .update({ image_url: null })
        .eq("id", row.product_id)
    }
  }

  // 3. Delete the DB record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbErr } = await (admin as any).from("files").delete().eq("id", id)
  if (dbErr) {
    console.error("[deleteFile] DB delete failed after storage deletion:", dbErr.message)
    return {
      success:          false,
      error:            "File removed from storage, but the database record could not be deleted.",
      partiallyDeleted: true,
    }
  }

  return { success: true }
}
