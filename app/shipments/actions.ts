"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import type { Shipment, ShipmentStatus } from "@/lib/types"

// ── Status mapping ────────────────────────────────────────────

const TO_DB: Record<ShipmentStatus, string> = {
  "In Transit":        "in_transit",
  "Arrived":           "arrived",
  "Received":          "received",
  "Partially Received":"partially_received",
  "Need Attention":    "need_attention",
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
    id: row.id,
    shipmentNumber: row.shipment_number,
    clientId: row.client_id,
    clientName: row.clients?.company_name ?? "",
    status: FROM_DB[row.status] ?? "In Transit",
    notes: row.notes ?? "",
    isArchived: row.archived_at != null,
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
      id: item.id,
      productId: item.product_id,
      productName: item.products?.name ?? "",
      sku: item.products?.sku ?? "",
      units: item.expected_units,
      receivedUnits: item.received_units,
      damagedUnits: item.damaged_units,
      notes: item.notes ?? "",
    })),
    tracking: (row.shipment_trackings ?? []).map((t: {
      id: string
      carrier: string
      tracking_number: string | null
      box_count: number
      notes: string | null
    }) => ({
      id: t.id,
      carrier: t.carrier,
      trackingNumber: t.tracking_number ?? "",
      boxCount: t.box_count,
      notes: t.notes ?? "",
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

type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>

async function adjustIncoming(supa: Supa, productId: string, delta: number) {
  if (delta === 0) return
  const { data: inv } = await supa
    .from("inventory")
    .select("id, incoming_units")
    .eq("product_id", productId)
    .maybeSingle()
  if (!inv) return
  await supa
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

  // Generate shipment number by checking the last 20 records
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

  // Insert shipment
  const { data: ship, error: sErr } = await supabase
    .from("incoming_shipments")
    .insert({
      client_id: clientId,
      shipment_number: `IN-${maxNum + 1}`,
      status: "in_transit",
      notes: input.notes.trim() || null,
    })
    .select("id")
    .single()
  if (sErr) throw new Error(sErr.message)

  const validProducts = input.products.filter((p) => p.productId && p.units > 0)
  const validTracking = input.tracking.filter((t) => t.carrier)

  // Insert items
  if (validProducts.length) {
    const { error: iErr } = await supabase.from("incoming_shipment_items").insert(
      validProducts.map((p) => ({
        shipment_id: ship.id,
        product_id: p.productId,
        expected_units: p.units,
        received_units: 0,
        damaged_units: 0,
        notes: p.notes.trim() || null,
      }))
    )
    if (iErr) throw new Error(iErr.message)
  }

  // Insert tracking
  if (validTracking.length) {
    const { error: tErr } = await supabase.from("shipment_trackings").insert(
      validTracking.map((t) => ({
        shipment_id: ship.id,
        carrier: t.carrier,
        tracking_number: t.trackingNumber.trim() || null,
        box_count: t.boxCount,
        notes: t.notes.trim() || null,
      }))
    )
    if (tErr) throw new Error(tErr.message)
  }

  // Increment inventory.incoming_units for each product
  for (const p of validProducts) {
    await adjustIncoming(supabase, p.productId, p.units)
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

  // Load current state to compute inventory diffs and guard against double-sync
  const { data: current, error: gErr } = await supabase
    .from("incoming_shipments")
    .select("status, inventory_synced, incoming_shipment_items(product_id, expected_units)")
    .eq("id", id)
    .single()
  if (gErr) throw new Error(gErr.message)

  type DbStatus = "in_transit" | "arrived" | "received" | "partially_received" | "need_attention"
  const currentDbStatus = current.status as DbStatus
  const inventorySynced = current.inventory_synced as boolean

  // Clients cannot change status
  const newDbStatus: DbStatus = isAdmin
    ? (TO_DB[input.status] as DbStatus)
    : currentDbStatus

  const wasReceived = RECEIVED_DB.includes(currentDbStatus)
  const nowReceived = RECEIVED_DB.includes(newDbStatus)
  // Inventory sync fires only once: admin, first time transitioning to received
  const doInventorySync = isAdmin && !inventorySynced && nowReceived && !wasReceived

  // Update the shipment record
  const { error: uErr } = await supabase
    .from("incoming_shipments")
    .update({
      status: newDbStatus,
      notes: input.notes.trim() || null,
      ...(doInventorySync ? { inventory_synced: true } : {}),
    })
    .eq("id", id)
  if (uErr) throw new Error(uErr.message)

  // Snapshot old items before replacing them
  const oldItems = (
    current.incoming_shipment_items as { product_id: string; expected_units: number }[]
  ) ?? []

  // Replace items: delete all → re-insert
  const { error: dItemErr } = await supabase
    .from("incoming_shipment_items")
    .delete()
    .eq("shipment_id", id)
  if (dItemErr) throw new Error(dItemErr.message)

  const validProducts = input.products.filter((p) => p.productId && p.units > 0)

  if (validProducts.length) {
    const { error: insItemErr } = await supabase.from("incoming_shipment_items").insert(
      validProducts.map((p) => ({
        shipment_id: id,
        product_id: p.productId,
        expected_units: p.units,
        // Clients cannot set received/damaged counts
        received_units: isAdmin ? p.receivedUnits : 0,
        damaged_units:  isAdmin ? p.damagedUnits  : 0,
        notes: p.notes.trim() || null,
      }))
    )
    if (insItemErr) throw new Error(insItemErr.message)
  }

  // Replace tracking: delete all → re-insert
  const { error: dTrackErr } = await supabase
    .from("shipment_trackings")
    .delete()
    .eq("shipment_id", id)
  if (dTrackErr) throw new Error(dTrackErr.message)

  const validTracking = input.tracking.filter((t) => t.carrier)
  if (validTracking.length) {
    const { error: insTrackErr } = await supabase.from("shipment_trackings").insert(
      validTracking.map((t) => ({
        shipment_id: id,
        carrier: t.carrier,
        tracking_number: t.trackingNumber.trim() || null,
        box_count: t.boxCount,
        notes: t.notes.trim() || null,
      }))
    )
    if (insTrackErr) throw new Error(insTrackErr.message)
  }

  // ── Inventory adjustments (only while not yet synced) ────────

  if (!inventorySynced) {
    // Build product-level expected_units maps: old (from DB) vs new (from input)
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
      // Receive sync: remove the old incoming amount that was posted on create/edit,
      // then add received and damaged to their respective buckets.
      for (const productId of allIds) {
        const oldExpected = oldMap[productId] ?? 0
        const newItem     = validProducts.find((p) => p.productId === productId)
        const received    = isAdmin && newItem ? newItem.receivedUnits : 0
        const damaged     = isAdmin && newItem ? newItem.damagedUnits  : 0

        const { data: inv } = await supabase
          .from("inventory")
          .select("id, incoming_units, available_units, damaged_units")
          .eq("product_id", productId)
          .maybeSingle()

        if (inv) {
          await supabase
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
      // Pre-receive edit: adjust incoming_units by the diff in expected quantities
      for (const productId of allIds) {
        const delta = (newMap[productId] ?? 0) - (oldMap[productId] ?? 0)
        await adjustIncoming(supabase, productId, delta)
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

export async function archiveShipment(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("incoming_shipments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

// ── softDeleteShipment ────────────────────────────────────────
// Reverses pending incoming_units before soft-deleting.

export async function softDeleteShipment(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient()

  // Load items to reverse incoming_units (only if inventory not yet synced)
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
      await adjustIncoming(supabase, item.product_id, -item.expected_units)
    }
  }

  const { error } = await supabase
    .from("incoming_shipments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}
