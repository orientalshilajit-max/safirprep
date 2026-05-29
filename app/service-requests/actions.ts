"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import type { ServiceRequest, ServiceStatus, ServiceType, ServiceDetails } from "@/lib/types"

// ── Status mapping ────────────────────────────────────────────

const TO_DB: Record<ServiceStatus, string> = {
  "New":            "new",
  "In Progress":    "in_progress",
  "Completed":      "completed",
  "Need Attention": "need_attention",
  "Invoiced":       "invoiced",
  "Cancelled":      "cancelled",
}

const FROM_DB: Record<string, ServiceStatus> = {
  new:            "New",
  in_progress:    "In Progress",
  completed:      "Completed",
  need_attention: "Need Attention",
  invoiced:       "Invoiced",
  cancelled:      "Cancelled",
}

// ── Row mapper ────────────────────────────────────────────────

type DbRow = {
  id: string
  client_id: string
  request_number: string
  service_type: string
  status: string
  notes: string | null
  inventory_deducted: boolean
  service_details: Record<string, unknown> | null
  created_at: string
  deleted_at: string | null
  clients: { company_name: string } | null
  service_request_items: {
    id: string
    product_id: string
    quantity: number
    notes: string | null
    products: { name: string; sku: string } | null
  }[]
}

function mapRow(row: DbRow): ServiceRequest {
  const item = row.service_request_items?.[0] ?? null
  const sd   = row.service_details ?? {}

  return {
    id:            row.id,
    requestNumber: row.request_number,
    clientId:      row.client_id,
    clientName:    row.clients?.company_name ?? "",
    productId:     item?.product_id ?? "",
    productName:   item?.products?.name ?? "",
    productSku:    item?.products?.sku  ?? "",
    service:       row.service_type as ServiceType,
    quantity:      item?.quantity ?? 0,
    status:        FROM_DB[row.status] ?? "New",
    files:         [],   // Files not yet connected to Supabase
    notes:         row.notes ?? "",
    serviceDetails: {
      prepNotes:          (sd.prepNotes          as string | undefined) ?? undefined,
      orderNotes:         (sd.orderNotes         as string | undefined) ?? undefined,
      placementNotes:     (sd.placementNotes     as string | undefined) ?? undefined,
      bundleInstructions: (sd.bundleInstructions as string | undefined) ?? undefined,
      unitsPerBundle:     (sd.unitsPerBundle     as number | undefined) ?? undefined,
      serviceDescription: (sd.serviceDescription as string | undefined) ?? undefined,
    } satisfies ServiceDetails,
    createdAt:         new Date(row.created_at).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    }),
    isArchived:        row.deleted_at != null,
    inventoryDeducted: row.inventory_deducted,
  }
}

const REQUEST_SELECT = `
  id, client_id, request_number, service_type, status, notes,
  inventory_deducted, service_details, created_at, deleted_at,
  clients (company_name),
  service_request_items (id, product_id, quantity, notes, products (name, sku))
` as const

// ── Inventory helper ──────────────────────────────────────────

type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>

async function adjustAvailable(supa: Supa, productId: string, delta: number) {
  if (delta === 0 || !productId) return
  const { data: inv } = await supa
    .from("inventory")
    .select("id, available_units")
    .eq("product_id", productId)
    .maybeSingle()
  if (!inv) return
  await supa
    .from("inventory")
    .update({ available_units: Math.max(0, inv.available_units + delta) })
    .eq("id", inv.id)
}

// ── listRequests ──────────────────────────────────────────────

export async function listRequests(): Promise<ServiceRequest[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("service_requests")
    .select(REQUEST_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => mapRow(r as unknown as DbRow))
}

// ── createRequest ─────────────────────────────────────────────

type CreateInput = {
  clientId?: string        // admin only; clients use JWT
  productId: string
  quantity: number
  service: ServiceType | ""
  notes: string
  serviceDetails: ServiceDetails
}

export async function createRequest(input: CreateInput): Promise<ServiceRequest> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const isAdmin = user.app_metadata?.role === "admin"

  const clientId = isAdmin
    ? input.clientId
    : (user.app_metadata?.client_id as string | undefined)

  if (!clientId) {
    throw new Error(isAdmin ? "Admin must select a client." : "Client ID not found in session.")
  }
  if (!input.productId) throw new Error("Select a product.")
  if (!input.service)   throw new Error("Select a service type.")
  if (input.quantity <= 0) throw new Error("Quantity must be greater than 0.")

  // Generate request number
  const { data: recent } = await supabase
    .from("service_requests")
    .select("request_number")
    .order("created_at", { ascending: false })
    .limit(20)

  let maxNum = 2005
  for (const row of recent ?? []) {
    const n = parseInt(row.request_number.replace("REQ-", "")) || 0
    if (n > maxNum) maxNum = n
  }

  // Insert request
  const { data: req, error: rErr } = await supabase
    .from("service_requests")
    .insert({
      client_id:          clientId,
      request_number:     `REQ-${maxNum + 1}`,
      service_type:       input.service,
      status:             "new",
      notes:              input.notes.trim() || null,
      inventory_deducted: true,
      service_details:    input.serviceDetails,
    })
    .select("id")
    .single()
  if (rErr) throw new Error(rErr.message)

  // Insert item
  const { error: iErr } = await supabase.from("service_request_items").insert({
    request_id: req.id,
    product_id: input.productId,
    quantity:   input.quantity,
  })
  if (iErr) throw new Error(iErr.message)

  // Deduct available_units
  await adjustAvailable(supabase, input.productId, -input.quantity)

  // Fetch full record
  const { data: full, error: fErr } = await supabase
    .from("service_requests")
    .select(REQUEST_SELECT)
    .eq("id", req.id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(full as unknown as DbRow)
}

// ── updateRequest ─────────────────────────────────────────────

type UpdateInput = {
  productId:      string
  quantity:       number
  service:        ServiceType | ""
  status:         ServiceStatus
  notes:          string
  serviceDetails: ServiceDetails
}

export async function updateRequest(id: string, input: UpdateInput): Promise<ServiceRequest> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const isAdmin = user.app_metadata?.role === "admin"

  // Load current state for diffs
  const { data: current, error: gErr } = await supabase
    .from("service_requests")
    .select("status, inventory_deducted, service_request_items(product_id, quantity)")
    .eq("id", id)
    .single()
  if (gErr) throw new Error(gErr.message)

  const currentStatus     = current.status as string
  const inventoryDeducted = current.inventory_deducted as boolean
  const currentItems      = (current.service_request_items ?? []) as { product_id: string; quantity: number }[]
  const currentItem       = currentItems[0] ?? null
  const oldProductId      = currentItem?.product_id ?? ""
  const oldQuantity       = currentItem?.quantity    ?? 0

  // Clients can only keep "new" or move to "cancelled"
  type DbServiceStatus = "new" | "in_progress" | "completed" | "need_attention" | "invoiced" | "cancelled"
  const newDbStatus: DbServiceStatus = isAdmin
    ? (TO_DB[input.status] as DbServiceStatus)
    : (["new", "cancelled"].includes(TO_DB[input.status])
        ? (TO_DB[input.status] as DbServiceStatus)
        : (currentStatus as DbServiceStatus))

  const becomingCancelled = newDbStatus === "cancelled" && currentStatus !== "cancelled"

  // Update request record
  const { error: uErr } = await supabase
    .from("service_requests")
    .update({
      service_type:    input.service || undefined,
      status:          newDbStatus,
      notes:           input.notes.trim() || null,
      service_details: input.serviceDetails,
      ...(becomingCancelled && inventoryDeducted ? { inventory_deducted: false } : {}),
    })
    .eq("id", id)
  if (uErr) throw new Error(uErr.message)

  // Replace item (delete + re-insert)
  await supabase.from("service_request_items").delete().eq("request_id", id)
  if (input.productId && input.quantity > 0) {
    const { error: insErr } = await supabase.from("service_request_items").insert({
      request_id: id,
      product_id: input.productId,
      quantity:   input.quantity,
    })
    if (insErr) throw new Error(insErr.message)
  }

  // ── Inventory adjustments ─────────────────────────────────
  if (inventoryDeducted) {
    if (becomingCancelled) {
      // Restore the reserved inventory
      await adjustAvailable(supabase, oldProductId, +oldQuantity)
    } else if (newDbStatus !== "cancelled") {
      if (oldProductId && oldProductId !== input.productId) {
        // Product swapped: restore old, deduct new
        await adjustAvailable(supabase, oldProductId,    +oldQuantity)
        await adjustAvailable(supabase, input.productId, -input.quantity)
      } else if (input.productId) {
        // Same product, quantity may have changed
        const delta = oldQuantity - input.quantity  // positive = restore, negative = deduct more
        await adjustAvailable(supabase, input.productId, delta)
      }
    }
  }

  // Fetch and return updated record
  const { data: full, error: fErr } = await supabase
    .from("service_requests")
    .select(REQUEST_SELECT)
    .eq("id", id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(full as unknown as DbRow)
}

// ── archiveRequest ────────────────────────────────────────────
// Soft-deletes the request.
// Restores available_units only when the request is still "New"
// (units were reserved but service not yet started).

export async function archiveRequest(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient()

  const { data: current } = await supabase
    .from("service_requests")
    .select("status, inventory_deducted, service_request_items(product_id, quantity)")
    .eq("id", id)
    .single()

  if (current) {
    const items = (current.service_request_items ?? []) as { product_id: string; quantity: number }[]
    const item  = items[0] ?? null

    if (current.status === "new" && (current.inventory_deducted as boolean) && item) {
      await adjustAvailable(supabase, item.product_id, +item.quantity)
    }
  }

  const { error } = await supabase
    .from("service_requests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}
