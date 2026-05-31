"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createServerAdminClient } from "@/lib/supabase"
import type { Product } from "@/lib/types"

const PRODUCT_IMAGE_BUCKET = "product-images"
const ALLOWED_IMAGE_TYPES  = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_IMAGE_BYTES       = 5 * 1024 * 1024 // 5 MB

export async function uploadProductImage(formData: FormData): Promise<string> {
  const supabase    = await createSupabaseServerClient()
  const adminClient = createServerAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) throw new Error("No file provided.")
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    throw new Error("Only JPG, PNG, and WebP images are allowed.")
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error("Image must be under 5 MB.")

  const isAdmin  = user.app_metadata?.role === "admin"
  const clientId = isAdmin
    ? ((formData.get("clientId") as string | null) ?? "unknown")
    : ((user.app_metadata?.client_id as string | undefined) ?? "unknown")

  const productId = (formData.get("productId") as string | null) ?? crypto.randomUUID()
  const ext       = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
  const path      = `${clientId}/${productId}/${crypto.randomUUID()}.${ext}`

  const { error: upErr } = await adminClient.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
  if (upErr) throw new Error(upErr.message)

  const { data: { publicUrl } } = adminClient.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(path)

  return publicUrl
}

// ── Type helpers ──────────────────────────────────────────────

function toDbStatus(s: "Active" | "Archived"): "active" | "archived" {
  return s === "Active" ? "active" : "archived"
}

function fromDbStatus(s: "active" | "archived"): "Active" | "Archived" {
  return s === "active" ? "Active" : "Archived"
}

// Shared select clause for products with inventory and client name
const PRODUCT_SELECT = `
  id, client_id, name, sku, asin_upc, fnsku, image_url, notes, status,
  inventory (available_units, incoming_units, damaged_units),
  clients (company_name)
` as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Product {
  const inv = Array.isArray(row.inventory) ? row.inventory[0] : null
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.clients?.company_name ?? "",
    name: row.name,
    sku: row.sku ?? "",
    asin: row.asin_upc ?? "",
    fnsku: row.fnsku ?? "",
    notes: row.notes ?? "",
    status: fromDbStatus(row.status),
    image: row.image_url,
    available: inv?.available_units ?? 0,
    incoming: inv?.incoming_units ?? 0,
    damaged: inv?.damaged_units ?? 0,
  }
}

// ── Queries ───────────────────────────────────────────────────

/** List all visible products (RLS filters by role automatically). */
export async function listProducts(): Promise<Product[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRow)
}

/**
 * Minimal client list for the admin product-creation selector.
 * Returns only active (non-deleted) clients.
 */
export async function listProductClients(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("clients")
    .select("id, company_name")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("company_name")
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => ({ id: c.id, name: c.company_name }))
}

// ── Mutations ─────────────────────────────────────────────────

type ProductFields = {
  name: string
  sku: string
  asin: string
  fnsku: string
  notes: string
  status: "Active" | "Archived"
  image: string | null
  available: number
  incoming: number
  damaged: number
  /** Admin-only: which client this product belongs to. */
  clientId?: string
}

/**
 * Create a new product and its corresponding inventory row.
 * For client users, clientId is derived from the JWT (not the caller).
 * For admin users, clientId must be provided in the input.
 */
export async function createProduct(input: ProductFields): Promise<Product> {
  const supabase = await createSupabaseServerClient()

  // Derive role server-side — never trust caller-supplied isAdmin
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const isAdmin = user.app_metadata?.role === "admin"
  const clientId = isAdmin
    ? input.clientId
    : (user.app_metadata?.client_id as string | undefined)

  if (!clientId) {
    throw new Error(
      isAdmin ? "Admin must select a client." : "Client ID not found in session."
    )
  }

  const { data: product, error: pErr } = await supabase
    .from("products")
    .insert({
      client_id: clientId,
      name: input.name.trim(),
      sku: input.sku.trim() || null,
      asin_upc: input.asin.trim() || null,
      fnsku: input.fnsku.trim() || null,
      notes: input.notes.trim() || null,
      status: toDbStatus(input.status),
      image_url: input.image,
    })
    .select("id")
    .single()

  if (pErr) throw new Error(pErr.message)

  // Create the inventory row with initial counts (0 for clients, set by admin)
  const { error: invErr } = await supabase.from("inventory").insert({
    client_id: clientId,
    product_id: product.id,
    available_units: isAdmin ? input.available : 0,
    incoming_units: isAdmin ? input.incoming : 0,
    damaged_units: isAdmin ? input.damaged : 0,
  })
  if (invErr) throw new Error(invErr.message)

  const { data: full, error: fErr } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", product.id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(full)
}

/**
 * Update an existing product.
 * Catalog fields (name, sku, etc.) are editable by both roles.
 * Inventory counts are only updated when the caller is an admin (enforced
 * server-side — the caller cannot self-elevate).
 */
export async function updateProduct(
  id: string,
  input: Omit<ProductFields, "clientId">
): Promise<Product> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const isAdmin = user.app_metadata?.role === "admin"

  // Update catalog fields (RLS ensures the user can only update their own)
  const { error: pErr } = await supabase
    .from("products")
    .update({
      name: input.name.trim(),
      sku: input.sku.trim() || null,
      asin_upc: input.asin.trim() || null,
      fnsku: input.fnsku.trim() || null,
      notes: input.notes.trim() || null,
      status: toDbStatus(input.status),
      image_url: input.image,
    })
    .eq("id", id)
  if (pErr) throw new Error(pErr.message)

  // Only admin can update inventory counts
  if (isAdmin) {
    const { error: invErr } = await supabase
      .from("inventory")
      .update({
        available_units: input.available,
        incoming_units: input.incoming,
        damaged_units: input.damaged,
      })
      .eq("product_id", id)
    if (invErr) throw new Error(invErr.message)
  }

  const { data: full, error: fErr } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(full)
}

/**
 * Toggle a product between active and archived.
 * Returns the new status.
 */
export async function toggleProductArchive(
  id: string
): Promise<"Active" | "Archived"> {
  const supabase = await createSupabaseServerClient()

  const { data: current, error: gErr } = await supabase
    .from("products")
    .select("status")
    .eq("id", id)
    .single()
  if (gErr) throw new Error(gErr.message)

  const next = current.status === "active" ? "archived" : "active"

  const { error: uErr } = await supabase
    .from("products")
    .update({ status: next })
    .eq("id", id)
  if (uErr) throw new Error(uErr.message)

  return fromDbStatus(next)
}
