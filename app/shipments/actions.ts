"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createServerAdminClient }     from "@/lib/supabase"
import type { Shipment, ShipmentStatus } from "@/lib/types"

// ── Status mapping ────────────────────────────────────────────

const TO_DB: Record<ShipmentStatus, string> = {
  "In Transit":         "in_transit",
  "Arrived":            "arrived",
  "Received":           "received",
  "Partially Received": "partially_received",
  "Need Attention":     "need_attention",
}

const FROM_DB: Record<string, ShipmentStatus> = {
  in_transit:          "In Transit",
  arrived:             "Arrived",
  received:            "Received",
  partially_received:  "Partially Received",
  need_attention:      "Need Attention",
}

const RECEIVED_DB = ["received", "partially_received"]

// ── Row mapper ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Shipment {
  return {
    id:             row.id,
    shipmentNumber: row.shipment_number,
    clientId:       row.client_id,
    clientName:     row.clients?.company_name ?? "",
    status:         FROM_DB[row.status] ?? "In Transit",
    notes:          row.notes ?? "",
    isArchived:     row.archived_at != null,
    isInventoryUpdated: row.inventory_synced,
    createdAt: new Date(row.created_at).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    }),
    products: (row.incoming_shipment_items ?? []).map((item: {
      id: string
      product_id: string
      expected_units: number
      received_units: number
      damaged_units: number
      notes: string | null
      products: { name: string; sku: string } | null
    }) => ({
      id:           item.id,
      productId:    item.product_id,
      productName:  item.products?.name ?? "",
      sku:          item.products?.sku  ?? "",
      units:        item.expected_units,
      receivedUnits: item.received_units,
      damagedUnits:  item.damaged_units,
      notes:         item.notes ?? "",
    })),
    tracking: (row.shipment_trackings ?? []).map((t: {
      id: string
      carrier: string
      tracking_number: string | null
      box_count: number
      notes: string | null
    }) => ({
      id:             t.id,
      carrier:        t.carrier,
      trackingNumber: t.tracking_number ?? "",
      boxCount:       t.box_count,
      notes:          t.notes ?? "",
    })),
  }
}

const SHIPMENT_SELECT = `
  id, client_id, shipment_number, status, notes, inventory_synced, archived_at, created_at,
  clients (company_name),
  incoming_shipment_items (id, product_id, expected_units, received_units, damaged_units, notes, products (name, sku)),
  shipment_trackings (id, carrier, tracking_number, box_count, notes)
` as const

// ── Inventory helper ──────────────────────────────────────────
// Always uses the service-role admin client so that:
//   • Clients can adjust their own inventory (no client UPDATE RLS policy exists)
//   • Admins bypass the RLS check as well (consistent path)
// Ownership is always verified via the user's session BEFORE calling this.

async function adjustIncoming(productId: string, delta: number) {
  if (delta === 0) return
  const admin = createServerAdminClient()
  const { data: inv } = await admin
    .from("inventory")
    .select("id, incoming_units")
    .eq("product_id", productId)
    .maybeSingle()
  if (!inv) return
  await admin
    .from("inventory")
    .update({ incoming_units: Math.max(0, inv.incoming_units + delta) })
    .eq("id", inv.id)
}

// ── listShipments ─────────────────────────────────────────────

export async function listShipments(): Promise<Shipment[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("incoming_shipments")
    .select(SHIPMENT_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRow)
}

// ── createShipment ────────────────────────────────────────────

type CreateInput = {
  clientId?: string
  products: { productId: string; units: number; notes: string }[]
  tracking: { carrier: string; trackingNumber: string; boxCount: number; notes: string }[]
  notes: string
}

export async function createShipment(input: CreateInput): Promise<Shipment> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
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

  // Generate shipment number
  const { data: recent } = await supabase
    .from("incoming_shipments")
    .select("shipment_number")
    .order("created_at", { ascending: false })
    .limit(20)

  let maxNum = 1008
  for (const row of recent ?? []) {
    const n = parseInt(row.shipment_number.replace("IN-", "")) || 0
    if (n > maxNum) maxNum = n
  }

  // Insert shipment (user session — RLS enforces ownership)
  const { data: ship, error: sErr } = await supabase
    .from("incoming_shipments")
    .insert({
      client_id:       clientId,
      shipment_number: `IN-${maxNum + 1}`,
      status:          "in_transit",
      notes:           input.notes.trim() || null,
    })
    .select("id")
    .single()
  if (sErr) throw new Error(sErr.message)

  const validProducts = input.products.filter((p) => p.productId && p.units > 0)
  const validTracking  = input.tracking.filter((t) => t.carrier)

  // Use admin client for child records to avoid RLS gaps on INSERT for clients
  const admin = createServerAdminClient()

  if (validProducts.length) {
    const { error: iErr } = await admin.from("incoming_shipment_items").insert(
      validProducts.map((p) => ({
        shipment_id:    ship.id,
        product_id:     p.productId,
        expected_units: p.units,
        received_units: 0,
        damaged_units:  0,
        notes:          p.notes.trim() || null,
      }))
    )
    if (iErr) throw new Error(iErr.message)
  }

  if (validTracking.length) {
    const { error: tErr } = await admin.from("shipment_trackings").insert(
      validTracking.map((t) => ({
        shipment_id:     ship.id,
        carrier:         t.carrier,
        tracking_number: t.trackingNumber.trim() || null,
        box_count:       t.boxCount,
        notes:           t.notes.trim() || null,
      }))
    )
    if (tErr) throw new Error(tErr.message)
  }

  // Reflect expected units in incoming_units
  for (const p of validProducts) {
    await adjustIncoming(p.productId, p.units)
  }

  const { data: full, error: fErr } = await supabase
    .from("incoming_shipments")
    .select(SHIPMENT_SELECT)
    .eq("id", ship.id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(full)
}

// ── updateShipment ────────────────────────────────────────────

type UpdateInput = {
  status: ShipmentStatus
  notes: string
  products: {
    productId: string
    units: number
    receivedUnits: number
    damagedUnits: number
    notes: string
  }[]
  tracking: {
    carrier: string
    trackingNumber: string
    boxCount: number
    notes: string
  }[]
}

export async function updateShipment(id: string, input: UpdateInput): Promise<Shipment> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const isAdmin = user.app_metadata?.role === "admin"

  // Verify ownership + load current state (user session, RLS-filtered)
  const { data: current, error: gErr } = await supabase
    .from("incoming_shipments")
    .select("status, inventory_synced, incoming_shipment_items(product_id, expected_units)")
    .eq("id", id)
    .single()
  if (gErr) throw new Error(gErr.message)

  type DbStatus = "in_transit" | "arrived" | "received" | "partially_received" | "need_attention"
  const currentDbStatus = current.status as DbStatus
  const inventorySynced = current.inventory_synced as boolean

  const newDbStatus: DbStatus = isAdmin
    ? (TO_DB[input.status] as DbStatus)
    : currentDbStatus   // clients cannot change status

  const wasReceived    = RECEIVED_DB.includes(currentDbStatus)
  const nowReceived    = RECEIVED_DB.includes(newDbStatus)
  const doInventorySync = isAdmin && !inventorySynced && nowReceived && !wasReceived

  // Update the shipment row (user session — RLS restricts clients to non-received only)
  const { error: uErr } = await supabase
    .from("incoming_shipments")
    .update({
      status: newDbStatus,
      notes:  input.notes.trim() || null,
      ...(doInventorySync ? { inventory_synced: true } : {}),
    })
    .eq("id", id)
  if (uErr) throw new Error(uErr.message)

  const oldItems = (
    current.incoming_shipment_items as { product_id: string; expected_units: number }[]
  ) ?? []

  const validProducts = input.products.filter((p) => p.productId && p.units > 0)
  const validTracking  = input.tracking.filter((t) => t.carrier)

  // Admin client for child-record operations: no client DELETE RLS exists,
  // and ownership is already verified by the select above.
  const admin = createServerAdminClient()

  // Replace items
  const { error: dItemErr } = await admin
    .from("incoming_shipment_items")
    .delete()
    .eq("shipment_id", id)
  if (dItemErr) throw new Error(dItemErr.message)

  if (validProducts.length) {
    const { error: insItemErr } = await admin.from("incoming_shipment_items").insert(
      validProducts.map((p) => ({
        shipment_id:    id,
        product_id:     p.productId,
        expected_units: p.units,
        received_units: isAdmin ? p.receivedUnits : 0,
        damaged_units:  isAdmin ? p.damagedUnits  : 0,
        notes:          p.notes.trim() || null,
      }))
    )
    if (insItemErr) throw new Error(insItemErr.message)
  }

  // Replace tracking
  const { error: dTrackErr } = await admin
    .from("shipment_trackings")
    .delete()
    .eq("shipment_id", id)
  if (dTrackErr) throw new Error(dTrackErr.message)

  if (validTracking.length) {
    const { error: insTrackErr } = await admin.from("shipment_trackings").insert(
      validTracking.map((t) => ({
        shipment_id:     id,
        carrier:         t.carrier,
        tracking_number: t.trackingNumber.trim() || null,
        box_count:       t.boxCount,
        notes:           t.notes.trim() || null,
      }))
    )
    if (insTrackErr) throw new Error(insTrackErr.message)
  }

  // ── Inventory adjustments ─────────────────────────────────

  if (!inventorySynced) {
    const oldMap: Record<string, number> = {}
    for (const item of oldItems) {
      oldMap[item.product_id] = (oldMap[item.product_id] ?? 0) + item.expected_units
    }
    const newMap: Record<string, number> = {}
    for (const p of validProducts) {
      newMap[p.productId] = (newMap[p.productId] ?? 0) + p.units
    }
    const allIds = new Set([...Object.keys(oldMap), ...Object.keys(newMap)])

    if (doInventorySync) {
      // Receive sync: subtract old incoming, add received + damaged
      for (const productId of allIds) {
        const oldExpected = oldMap[productId] ?? 0
        const newItem     = validProducts.find((p) => p.productId === productId)
        const received    = isAdmin && newItem ? newItem.receivedUnits : 0
        const damaged     = isAdmin && newItem ? newItem.damagedUnits  : 0

        const { data: inv } = await admin
          .from("inventory")
          .select("id, incoming_units, available_units, damaged_units")
          .eq("product_id", productId)
          .maybeSingle()

        if (inv) {
          await admin
            .from("inventory")
            .update({
              incoming_units:  Math.max(0, inv.incoming_units - oldExpected),
              available_units: inv.available_units + received,
              damaged_units:   inv.damaged_units   + damaged,
            })
            .eq("id", inv.id)
        }
      }
    } else {
      // Pre-receive edit: adjust incoming_units by the diff
      for (const productId of allIds) {
        const delta = (newMap[productId] ?? 0) - (oldMap[productId] ?? 0)
        await adjustIncoming(productId, delta)
      }
    }
  }

  const { data: full, error: fErr } = await supabase
    .from("incoming_shipments")
    .select(SHIPMENT_SELECT)
    .eq("id", id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(full)
}

// ── archiveShipment ───────────────────────────────────────────
// Sets archived_at. Uses admin client to bypass the "clients cannot
// update received shipments" RLS restriction — but first verifies
// the caller can actually see this shipment via their own session.

export async function archiveShipment(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient()

  // Ownership check: user session is RLS-filtered
  const { data: ship, error: gErr } = await supabase
    .from("incoming_shipments")
    .select("id")
    .eq("id", id)
    .maybeSingle()
  if (gErr) throw new Error(gErr.message)
  if (!ship) throw new Error("Shipment not found or access denied.")

  const admin = createServerAdminClient()
  const { error } = await admin
    .from("incoming_shipments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

// ── softDeleteShipment ────────────────────────────────────────
// Reverses pending incoming_units before soft-deleting.

export async function softDeleteShipment(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient()

  const { data: current } = await supabase
    .from("incoming_shipments")
    .select("inventory_synced, incoming_shipment_items(product_id, expected_units)")
    .eq("id", id)
    .single()

  if (current && !(current.inventory_synced as boolean)) {
    const items = (current.incoming_shipment_items ?? []) as {
      product_id: string
      expected_units: number
    }[]
    for (const item of items) {
      await adjustIncoming(item.product_id, -item.expected_units)
    }
  }

  // User session: RLS allows clients to soft-delete their own non-received shipments
  const { error } = await supabase
    .from("incoming_shipments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}
