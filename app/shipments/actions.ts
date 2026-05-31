"use server"

import { revalidatePath } from "next/cache"
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
    isArchived:  row.archived_at != null,
    archivedAt:  row.archived_at
      ? new Date(row.archived_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : undefined,
    isInventoryUpdated: row.inventory_posted_at != null || Boolean(row.inventory_synced),
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
  id, client_id, shipment_number, status, notes, inventory_synced, inventory_posted_at, archived_at, created_at,
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

  if (!inv) {
    // No inventory row — create one using the product's client_id
    const { data: product, error: pErr } = await admin
      .from("products")
      .select("client_id")
      .eq("id", productId)
      .single()
    if (pErr || !product) {
      console.error(`[inventory] adjustIncoming: product ${productId} not found, skipping`)
      return
    }
    const { error: insErr } = await admin.from("inventory").insert({
      product_id:      productId,
      client_id:       product.client_id,
      incoming_units:  Math.max(0, delta),
      available_units: 0,
      damaged_units:   0,
    })
    if (insErr) console.error(`[inventory] adjustIncoming insert failed: ${insErr.message}`)
    return
  }

  const { error: updErr } = await admin
    .from("inventory")
    .update({ incoming_units: Math.max(0, inv.incoming_units + delta) })
    .eq("id", inv.id)
  if (updErr) console.error(`[inventory] adjustIncoming update failed: ${updErr.message}`)
}

// ── listShipments ─────────────────────────────────────────────

export async function listShipments(): Promise<Shipment[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("incoming_shipments")
    .select(SHIPMENT_SELECT)
    .is("deleted_at",   null)
    .is("archived_at",  null)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRow)
}

export async function listArchivedShipments(): Promise<Shipment[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("incoming_shipments")
    .select(SHIPMENT_SELECT)
    .is("deleted_at", null)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
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

  // Admin client — used for all writes so that RLS session issues can never
  // silently swallow an UPDATE (same pattern as archiveShipment).
  // Ownership is still verified below via the user-session SELECT.
  const admin = createServerAdminClient()

  // Verify ownership + load current state (user session, RLS-filtered)
  const { data: current, error: gErr } = await supabase
    .from("incoming_shipments")
    .select("status, inventory_synced, inventory_posted_at, incoming_shipment_items(product_id, expected_units)")
    .eq("id", id)
    .single()
  if (gErr) throw new Error(gErr.message)

  type DbStatus = "in_transit" | "arrived" | "received" | "partially_received" | "need_attention"
  const currentDbStatus = current.status as DbStatus
  // Consider posted if either column indicates it (handles rows created before migration)
  const inventoryPosted =
    (current.inventory_posted_at as string | null) != null ||
    Boolean(current.inventory_synced)

  const newDbStatus: DbStatus = isAdmin
    ? (TO_DB[input.status] as DbStatus)
    : currentDbStatus   // clients cannot change status

  const wasReceived     = RECEIVED_DB.includes(currentDbStatus)
  const nowReceived     = RECEIVED_DB.includes(newDbStatus)
  const doInventorySync = isAdmin && !inventoryPosted && nowReceived && !wasReceived

  console.log(`[updateShipment] id=${id} user=${user.id} isAdmin=${isAdmin}`)
  console.log(`[updateShipment] status: ${currentDbStatus} → ${newDbStatus}`)
  console.log(`[updateShipment] inventoryPosted=${inventoryPosted} wasReceived=${wasReceived} nowReceived=${nowReceived} doInventorySync=${doInventorySync}`)

  // Use admin client for the UPDATE so that RLS session edge-cases can never
  // block a valid admin operation (ownership already verified by the SELECT above).
  const now = new Date().toISOString()
  const { error: uErr } = await admin
    .from("incoming_shipments")
    .update({
      status: newDbStatus,
      notes:  input.notes.trim() || null,
      ...(doInventorySync ? { inventory_synced: true, inventory_posted_at: now } : {}),
    })
    .eq("id", id)
  if (uErr) throw new Error(`Shipment update failed: ${uErr.message}`)

  const oldItems = (
    current.incoming_shipment_items as { product_id: string; expected_units: number }[]
  ) ?? []

  const validProducts = input.products.filter((p) => p.productId && p.units > 0)
  const validTracking  = input.tracking.filter((t) => t.carrier)

  // Replace items (admin client — no client DELETE RLS)
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

  if (!inventoryPosted) {
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
      console.log(`[updateShipment] posting inventory for ${allIds.size} product(s)`)

      for (const productId of allIds) {
        const oldExpected = oldMap[productId] ?? 0
        const newItem     = validProducts.find((p) => p.productId === productId)
        const received    = isAdmin && newItem ? newItem.receivedUnits : 0
        const damaged     = isAdmin && newItem ? newItem.damagedUnits  : 0

        // Received: clear all reserved incoming (remaining = missing, nothing more coming).
        // Partially Received: only subtract what was processed (remaining stays in incoming
        // because those units are still expected to arrive).
        const incomingReduction = newDbStatus === "received"
          ? oldExpected
          : (received + damaged)

        const { data: inv, error: invSelErr } = await admin
          .from("inventory")
          .select("id, incoming_units, available_units, damaged_units")
          .eq("product_id", productId)
          .maybeSingle()

        if (invSelErr) {
          console.error(`[inventory] select error for product ${productId}: ${invSelErr.message}`)
          continue
        }

        console.log(`[inventory] product=${productId} oldExpected=${oldExpected} received=${received} damaged=${damaged} incomingReduction=${incomingReduction}`)

        if (inv) {
          console.log(`[inventory] before: incoming=${inv.incoming_units} available=${inv.available_units} damaged=${inv.damaged_units}`)
          const { error: invErr } = await admin
            .from("inventory")
            .update({
              incoming_units:  Math.max(0, inv.incoming_units  - incomingReduction),
              available_units: inv.available_units + received,
              damaged_units:   inv.damaged_units   + damaged,
            })
            .eq("id", inv.id)
          if (invErr) {
            console.error(`[inventory] update failed for product ${productId}: ${invErr.message}`)
          } else {
            console.log(`[inventory] after:  incoming=${Math.max(0, inv.incoming_units - incomingReduction)} available=${inv.available_units + received} damaged=${inv.damaged_units + damaged}`)
          }
        } else {
          console.error(`[inventory] no row for product ${productId} — creating`)
          const { data: prod } = await admin
            .from("products").select("client_id").eq("id", productId).single()
          if (prod) {
            const { error: insErr } = await admin.from("inventory").insert({
              product_id:      productId,
              client_id:       prod.client_id,
              incoming_units:  0,
              available_units: received,
              damaged_units:   damaged,
            })
            if (insErr) console.error(`[inventory] insert failed for product ${productId}: ${insErr.message}`)
            else        console.log(`[inventory] created row for product ${productId}: available=${received} damaged=${damaged}`)
          }
        }
      }

      // Invalidate the Next.js full-route and router cache so the client
      // sees fresh inventory data on the next navigation to these pages.
      revalidatePath("/products")
      revalidatePath("/shipments")
      console.log(`[updateShipment] inventory posted — revalidated /products and /shipments`)
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const isAdmin = user.app_metadata?.role === "admin"

  // Ownership check + status guard for clients
  const { data: ship, error: gErr } = await supabase
    .from("incoming_shipments")
    .select("id, status")
    .eq("id", id)
    .maybeSingle()
  if (gErr) throw new Error(gErr.message)
  if (!ship) throw new Error("Shipment not found or access denied.")

  if (!isAdmin && RECEIVED_DB.includes(ship.status as string)) {
    throw new Error("Received shipments can only be archived by an admin.")
  }

  const admin = createServerAdminClient()
  const { error } = await admin
    .from("incoming_shipments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/shipments")
}

export async function restoreShipment(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

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
    .update({ archived_at: null })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/shipments")
}

type ShipmentDeleteResult = { success: true } | { success: false; error: string }

export async function permanentDeleteShipment(id: string): Promise<ShipmentDeleteResult> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Unauthorized" }
  if (user.app_metadata?.role !== "admin") {
    return { success: false, error: "Only admins can permanently delete shipments." }
  }

  // Ownership / existence check
  const { data: ship, error: gErr } = await supabase
    .from("incoming_shipments")
    .select("id")
    .eq("id", id)
    .maybeSingle()
  if (gErr) return { success: false, error: gErr.message }
  if (!ship) return { success: false, error: "Shipment not found." }

  // Hard delete — trackings and items cascade; files get shipment_id = null
  const admin = createServerAdminClient()
  const { error: delErr } = await admin
    .from("incoming_shipments")
    .delete()
    .eq("id", id)
  if (delErr) return { success: false, error: delErr.message }

  revalidatePath("/shipments")
  return { success: true }
}

// ── softDeleteShipment ────────────────────────────────────────
// Reverses pending incoming_units before soft-deleting.

export async function softDeleteShipment(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient()

  const { data: current } = await supabase
    .from("incoming_shipments")
    .select("inventory_synced, inventory_posted_at, incoming_shipment_items(product_id, expected_units)")
    .eq("id", id)
    .single()

  const alreadyPosted =
    Boolean(current?.inventory_synced) ||
    (current?.inventory_posted_at as string | null) != null

  if (current && !alreadyPosted) {
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
