"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createServerAdminClient }     from "@/lib/supabase"
import type { ServiceRequest, RequestService, ServiceStatus, ServiceType, ServiceDetails } from "@/lib/types"

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

// ── Available service types ───────────────────────────────────

export type AvailableServiceType = {
  id: string
  name: string
  visibleToCustomers: boolean
  pricingRules: {
    minQty:       number
    maxQty:       number | null
    pricePerUnit: number
    label:        string | null
  }[]
}

export async function listAvailableServiceTypes(): Promise<AvailableServiceType[]> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const isAdmin = user.app_metadata?.role === "admin"

  const { data, error } = await supabase
    .from("service_types")
    .select("id, name, visible_to_customers, service_pricing_rules(min_qty, max_qty, price_per_unit, label, sort_order)")
    .eq("is_active", true)
    .order("sort_order")
    .order("name")

  if (error || !data) return []

  return data
    .filter((s) => isAdmin || s.visible_to_customers)
    .map((s) => ({
      id:                 s.id,
      name:               s.name,
      visibleToCustomers: s.visible_to_customers,
      pricingRules: ((s.service_pricing_rules as {
        min_qty: number; max_qty: number | null; price_per_unit: number; label: string | null; sort_order: number
      }[]) ?? [])
        .sort((a, b) => a.min_qty - b.min_qty)
        .map((r) => ({
          minQty:       r.min_qty,
          maxQty:       r.max_qty,
          pricePerUnit: r.price_per_unit,
          label:        r.label,
        })),
    }))
}

// ── Row mapper ────────────────────────────────────────────────

type DbServiceRow = {
  id: string
  service_type_id: string | null
  service_name_snapshot: string
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
}

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
  service_request_services: DbServiceRow[]
}

function mapRow(row: DbRow): ServiceRequest {
  const item     = row.service_request_items?.[0] ?? null
  const sd       = row.service_details ?? {}
  const dbSvcs   = row.service_request_services ?? []

  const services: RequestService[] = dbSvcs.map((s) => ({
    id:            s.id,
    serviceTypeId: s.service_type_id,
    serviceName:   s.service_name_snapshot,
    quantity:      s.quantity,
    unitPrice:     s.unit_price,
    totalPrice:    s.total_price,
    notes:         s.notes ?? "",
  }))

  const primaryService = (services[0]?.serviceName ?? row.service_type) as ServiceType

  return {
    id:            row.id,
    requestNumber: row.request_number,
    clientId:      row.client_id,
    clientName:    row.clients?.company_name ?? "",
    productId:     item?.product_id ?? "",
    productName:   item?.products?.name ?? "",
    productSku:    item?.products?.sku  ?? "",
    service:       primaryService,
    services,
    quantity:      item?.quantity ?? 0,
    status:        FROM_DB[row.status] ?? "New",
    files:         [],
    notes:         row.notes ?? "",
    serviceDetails: {
      prepNotes:          (sd.prepNotes          as string | undefined) ?? undefined,
      orderNotes:         (sd.orderNotes         as string | undefined) ?? undefined,
      placementNotes:     (sd.placementNotes     as string | undefined) ?? undefined,
      bundleInstructions: (sd.bundleInstructions as string | undefined) ?? undefined,
      unitsPerBundle:     (sd.unitsPerBundle     as number | undefined) ?? undefined,
      serviceDescription: (sd.serviceDescription as string | undefined) ?? undefined,
    } satisfies ServiceDetails,
    createdAt: new Date(row.created_at).toLocaleDateString("en-US", {
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
  service_request_items (id, product_id, quantity, notes, products (name, sku)),
  service_request_services (id, service_type_id, service_name_snapshot, quantity, unit_price, total_price, notes)
` as const

// ── Inventory helper ──────────────────────────────────────────

async function adjustAvailable(productId: string, delta: number) {
  if (delta === 0 || !productId) return
  const admin = createServerAdminClient()
  const { data: inv } = await admin
    .from("inventory")
    .select("id, available_units")
    .eq("product_id", productId)
    .maybeSingle()
  if (!inv) return
  await admin
    .from("inventory")
    .update({ available_units: Math.max(0, inv.available_units + delta) })
    .eq("id", inv.id)
}

// ── Pricing rule lookup (server-side snapshot at save time) ───

async function lookupUnitPrice(
  serviceTypeId: string | null,
  serviceName: string,
  quantity: number
): Promise<number> {
  if (quantity <= 0) return 0
  try {
    const admin = createServerAdminClient()

    let stId = serviceTypeId
    if (!stId) {
      const { data: st } = await admin
        .from("service_types").select("id").eq("name", serviceName).maybeSingle()
      stId = st?.id ?? null
    }
    if (!stId) return 0

    const { data: rules } = await admin
      .from("service_pricing_rules")
      .select("price_per_unit, min_qty, max_qty")
      .eq("service_type_id", stId)
      .lte("min_qty", quantity)
      .order("min_qty", { ascending: false })

    if (!rules || rules.length === 0) return 0
    const match = rules.find((r) => r.max_qty === null || r.max_qty >= quantity)
    return match?.price_per_unit ?? 0
  } catch {
    return 0
  }
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

type ServiceInput = {
  serviceName:   string
  serviceTypeId: string | null
  notes:         string
}

type CreateInput = {
  clientId?:      string
  productId:      string
  quantity:       number
  services:       ServiceInput[]
  notes:          string
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

  if (!clientId)           throw new Error(isAdmin ? "Admin must select a client." : "Client ID not found in session.")
  if (!input.productId)    throw new Error("Select a product.")
  if (input.quantity <= 0) throw new Error("Quantity must be greater than 0.")

  const validServices = input.services.filter((s) => s.serviceName.trim())
  if (!validServices.length) throw new Error("Select at least one service.")

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

  const primaryService = validServices[0].serviceName

  // Insert request
  const { data: req, error: rErr } = await supabase
    .from("service_requests")
    .insert({
      client_id:          clientId,
      request_number:     `REQ-${maxNum + 1}`,
      service_type:       primaryService,
      status:             "new",
      notes:              input.notes.trim() || null,
      inventory_deducted: true,
      service_details:    input.serviceDetails,
    })
    .select("id")
    .single()
  if (rErr) throw new Error(rErr.message)

  const admin = createServerAdminClient()

  // Insert product item
  const { error: iErr } = await admin.from("service_request_items").insert({
    request_id: req.id,
    product_id: input.productId,
    quantity:   input.quantity,
  })
  if (iErr) throw new Error(iErr.message)

  // Insert service rows with price snapshots
  for (const svc of validServices) {
    const unitPrice  = await lookupUnitPrice(svc.serviceTypeId, svc.serviceName, input.quantity)
    const totalPrice = parseFloat((unitPrice * input.quantity).toFixed(2))
    await admin.from("service_request_services").insert({
      request_id:            req.id,
      service_type_id:       svc.serviceTypeId || null,
      service_name_snapshot: svc.serviceName,
      quantity:              input.quantity,
      unit_price:            unitPrice,
      total_price:           totalPrice,
      notes:                 svc.notes.trim() || null,
    })
  }

  // Deduct inventory once (regardless of service count)
  await adjustAvailable(input.productId, -input.quantity)

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
  services:       ServiceInput[]
  status:         ServiceStatus
  notes:          string
  serviceDetails: ServiceDetails
}

export async function updateRequest(id: string, input: UpdateInput): Promise<ServiceRequest> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const isAdmin = user.app_metadata?.role === "admin"

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

  type DbServiceStatus = "new" | "in_progress" | "completed" | "need_attention" | "invoiced" | "cancelled"
  const newDbStatus: DbServiceStatus = isAdmin
    ? (TO_DB[input.status] as DbServiceStatus)
    : (["new", "cancelled"].includes(TO_DB[input.status])
        ? (TO_DB[input.status] as DbServiceStatus)
        : (currentStatus as DbServiceStatus))

  const becomingCancelled = newDbStatus === "cancelled" && currentStatus !== "cancelled"
  const validServices     = input.services.filter((s) => s.serviceName.trim())
  const primaryService    = validServices[0]?.serviceName ?? ""

  const { error: uErr } = await supabase
    .from("service_requests")
    .update({
      service_type:    primaryService || undefined,
      status:          newDbStatus,
      notes:           input.notes.trim() || null,
      service_details: input.serviceDetails,
      ...(becomingCancelled && inventoryDeducted ? { inventory_deducted: false } : {}),
    })
    .eq("id", id)
  if (uErr) throw new Error(uErr.message)

  const admin = createServerAdminClient()

  // Replace product item
  await admin.from("service_request_items").delete().eq("request_id", id)
  if (!becomingCancelled && input.productId && input.quantity > 0) {
    const { error: insErr } = await admin.from("service_request_items").insert({
      request_id: id,
      product_id: input.productId,
      quantity:   input.quantity,
    })
    if (insErr) throw new Error(insErr.message)
  }

  // Replace service rows
  await admin.from("service_request_services").delete().eq("request_id", id)
  if (!becomingCancelled && validServices.length > 0) {
    for (const svc of validServices) {
      const unitPrice  = await lookupUnitPrice(svc.serviceTypeId, svc.serviceName, input.quantity)
      const totalPrice = parseFloat((unitPrice * input.quantity).toFixed(2))
      await admin.from("service_request_services").insert({
        request_id:            id,
        service_type_id:       svc.serviceTypeId || null,
        service_name_snapshot: svc.serviceName,
        quantity:              input.quantity,
        unit_price:            unitPrice,
        total_price:           totalPrice,
        notes:                 svc.notes.trim() || null,
      })
    }
  }

  // Inventory adjustments
  if (inventoryDeducted) {
    if (becomingCancelled) {
      await adjustAvailable(oldProductId, +oldQuantity)
    } else if (newDbStatus !== "cancelled") {
      if (oldProductId && oldProductId !== input.productId) {
        await adjustAvailable(oldProductId,    +oldQuantity)
        await adjustAvailable(input.productId, -input.quantity)
      } else if (input.productId) {
        await adjustAvailable(input.productId, oldQuantity - input.quantity)
      }
    }
  }

  const { data: full, error: fErr } = await supabase
    .from("service_requests")
    .select(REQUEST_SELECT)
    .eq("id", id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(full as unknown as DbRow)
}

// ── archiveRequest ────────────────────────────────────────────

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
      await adjustAvailable(item.product_id, +item.quantity)
    }
  }

  const { error } = await supabase
    .from("service_requests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}
