"use client"

import { useState, useCallback } from "react"
import { Plus, X, AlertCircle, AlertTriangle } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { ProductModal } from "@/components/products/product-modal"
import { useProducts, useShipments, useRole, useIsMockMode } from "@/components/layout/app-shell"
import { CARRIERS } from "@/lib/types"
import type { Shipment, ShipmentProduct, ShipmentTracking, ShipmentStatus } from "@/lib/types"
import { createShipment, updateShipment } from "@/app/shipments/actions"
import { createProduct } from "@/app/products/actions"

/* ── Row types ───────────────────────────────────────────── */
type ProductRow = {
  id: string
  productId: string
  units: number
  receivedUnits: number
  damagedUnits: number
  notes: string
}

type TrackingRow = {
  id: string
  carrier: string
  trackingNumber: string
  boxCount: number
  notes: string
}

/* ── Constants ───────────────────────────────────────────── */
const STATUSES: ShipmentStatus[] = [
  "In Transit",
  "Arrived",
  "Received",
  "Partially Received",
  "Need Attention",
]

const IN_TRANSIT_STATUSES: ShipmentStatus[] = ["In Transit", "Arrived", "Partially Received"]

const uid = () => Math.random().toString(36).slice(2)

const emptyProductRow  = (): ProductRow  => ({ id: uid(), productId: "", units: 0, receivedUnits: 0, damagedUnits: 0, notes: "" })
const emptyTrackingRow = (): TrackingRow => ({ id: uid(), carrier: "UPS", trackingNumber: "", boxCount: 1, notes: "" })

/* ── Props ───────────────────────────────────────────────── */
export type ShipmentModalProps = {
  isOpen:    boolean
  onClose:   () => void
  onSave:    (s: Shipment) => void
  mode?:     "create" | "edit"
  shipment?: Shipment | null
  clients?:  { id: string; name: string }[]
}

/* ── Component ───────────────────────────────────────────── */
export function ShipmentModal({
  isOpen,
  onClose,
  onSave,
  mode     = "create",
  shipment = null,
  clients  = [],
}: ShipmentModalProps) {
  const { role }                  = useRole()
  const { products, setProducts } = useProducts()
  const { shipments }             = useShipments()
  const isMockMode                = useIsMockMode()

  const [productRows,  setProductRows]  = useState<ProductRow[]>([emptyProductRow()])
  const [trackingRows, setTrackingRows] = useState<TrackingRow[]>([emptyTrackingRow()])
  const [status,       setStatus]       = useState<ShipmentStatus>("In Transit")
  const [notes,        setNotes]        = useState("")
  const [clientId,     setClientId]     = useState("")
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState("")

  const [createProductRowId, setCreateProductRowId] = useState<string | null>(null)
  const [productModalOpen,   setProductModalOpen]   = useState(false)

  // Reset form when modal opens or the target shipment changes
  const resetKey = `${isOpen}|${mode}|${shipment?.id ?? "__new__"}`
  const [prevKey, setPrevKey] = useState("")
  if (prevKey !== resetKey) {
    setPrevKey(resetKey)
    if (isOpen) {
      if (mode === "edit" && shipment) {
        setProductRows(
          shipment.products.length > 0
            ? shipment.products.map((p) => ({
                id:            p.id || uid(),
                productId:     p.productId,
                units:         p.units,
                receivedUnits: p.receivedUnits,
                damagedUnits:  p.damagedUnits,
                notes:         p.notes,
              }))
            : [emptyProductRow()]
        )
        setTrackingRows(
          shipment.tracking.length > 0
            ? shipment.tracking.map((t) => ({
                id:             t.id || uid(),
                carrier:        t.carrier,
                trackingNumber: t.trackingNumber,
                boxCount:       t.boxCount,
                notes:          t.notes,
              }))
            : [emptyTrackingRow()]
        )
        setStatus(shipment.status)
        setNotes(shipment.notes)
      } else {
        setProductRows([emptyProductRow()])
        setTrackingRows([emptyTrackingRow()])
        setStatus("In Transit")
        setNotes("")
        setClientId(clients[0]?.id ?? "")
      }
      setError("")
      setSaving(false)
    }
  }

  /* ── Product rows ─────────────────────────────────────── */
  const addProductRow    = () => setProductRows((r) => [...r, emptyProductRow()])
  const removeProductRow = (id: string) =>
    setProductRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : r))
  const updateProductRow = useCallback(
    (id: string, patch: Partial<ProductRow>) =>
      setProductRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    []
  )

  function handleProductSelect(rowId: string, value: string) {
    if (value === "__CREATE__") {
      setCreateProductRowId(rowId)
      setProductModalOpen(true)
      return
    }
    updateProductRow(rowId, { productId: value })
  }

  /* ── Tracking rows ────────────────────────────────────── */
  const addTrackingRow    = () => setTrackingRows((r) => [...r, emptyTrackingRow()])
  const removeTrackingRow = (id: string) =>
    setTrackingRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : r))
  const updateTrackingRow = (id: string, patch: Partial<TrackingRow>) =>
    setTrackingRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  /* ── Submit ───────────────────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validProducts = productRows.filter((r) => r.productId && r.units > 0)
    if (!validProducts.length) {
      setError("Add at least one product with a quantity.")
      return
    }
    if (mode === "create" && role === "admin" && !isMockMode && clients.length > 0 && !clientId) {
      setError("Select a client.")
      return
    }
    setError("")
    setSaving(true)

    try {
      if (mode === "edit" && shipment) {
        await handleEditSubmit(shipment, validProducts)
      } else {
        await handleCreateSubmit(validProducts)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${mode === "edit" ? "save" : "create"} shipment.`)
      setSaving(false)
    }
  }

  async function handleEditSubmit(target: Shipment, validProducts: ProductRow[]) {
    const trackingInput = trackingRows
      .filter((r) => r.carrier)
      .map((r) => ({
        carrier:        r.carrier,
        trackingNumber: r.trackingNumber,
        boxCount:       r.boxCount,
        notes:          r.notes,
      }))

    if (isMockMode) {
      const updated: Shipment = {
        ...target,
        status,
        notes,
        products: validProducts.map((r) => {
          const existing = target.products.find((p) => p.productId === r.productId)
          const meta     = products.find((p) => p.id === r.productId)
          return {
            id:            r.id,
            productId:     r.productId,
            productName:   meta?.name ?? existing?.productName ?? "",
            sku:           meta?.sku  ?? existing?.sku         ?? "",
            units:         r.units,
            receivedUnits: r.receivedUnits,
            damagedUnits:  r.damagedUnits,
            notes:         r.notes,
          }
        }),
        tracking: trackingRows.filter((r) => r.carrier).map((r) => ({
          id:             r.id,
          carrier:        r.carrier,
          trackingNumber: r.trackingNumber,
          boxCount:       r.boxCount,
          notes:          r.notes,
        })),
      }
      onSave(updated)
      return
    }

    const updated = await updateShipment(target.id, {
      status,
      notes,
      products: validProducts.map((r) => ({
        productId:     r.productId,
        units:         r.units,
        receivedUnits: r.receivedUnits,
        damagedUnits:  r.damagedUnits,
        notes:         r.notes,
      })),
      tracking: trackingInput,
    })
    onSave(updated)
  }

  async function handleCreateSubmit(validProducts: ProductRow[]) {
    const trackingInput = trackingRows
      .filter((r) => r.carrier)
      .map((r) => ({
        carrier:        r.carrier,
        trackingNumber: r.trackingNumber,
        boxCount:       r.boxCount,
        notes:          r.notes,
      }))

    if (!isMockMode) {
      const created = await createShipment({
        clientId: clientId || undefined,
        products: validProducts.map((r) => ({
          productId: r.productId,
          units:     r.units,
          notes:     r.notes,
        })),
        tracking: trackingInput,
        notes,
      })
      onSave(created)
      return
    }

    // Mock create
    const maxNum = shipments.reduce((max, s) => {
      const n = parseInt(s.shipmentNumber.replace("IN-", "")) || 0
      return Math.max(max, n)
    }, 1008)

    const sProducts: ShipmentProduct[] = validProducts.map((r) => {
      const p = products.find((x) => x.id === r.productId)
      return {
        id:            uid(),
        productId:     r.productId,
        productName:   p?.name ?? "",
        sku:           p?.sku  ?? "",
        units:         r.units,
        receivedUnits: 0,
        damagedUnits:  0,
        notes:         r.notes,
      }
    })

    const sTracking: ShipmentTracking[] = trackingRows
      .filter((r) => r.carrier || r.trackingNumber)
      .map((r) => ({
        id:             r.id,
        carrier:        r.carrier,
        trackingNumber: r.trackingNumber,
        boxCount:       r.boxCount,
        notes:          r.notes,
      }))

    const created: Shipment = {
      id:             `s${Date.now()}`,
      shipmentNumber: `IN-${maxNum + 1}`,
      clientId:       "c1",
      clientName:     "TechVault Co.",
      products:       sProducts,
      tracking:       sTracking,
      status:         "In Transit",
      createdAt:      new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      notes,
    }
    onSave(created)
  }

  /* ── Helpers ──────────────────────────────────────────── */
  const isAdmin      = role === "admin"
  const isEdit       = mode === "edit"
  const isInTransit  = IN_TRANSIT_STATUSES.includes(status)
  const inventoryPosted = shipment?.isInventoryUpdated ?? false

  // In edit mode include archived products already on the shipment
  const existingProductIds = new Set(shipment?.products.map((p) => p.productId) ?? [])
  const dropdownProducts   = products.filter(
    (p) => p.status === "Active" || existingProductIds.has(p.id)
  )

  const showClientField = isAdmin && !isMockMode && clients.length > 0 && !isEdit
  const title           = isEdit ? `Edit ${shipment?.shipmentNumber ?? "Shipment"}` : "Create Shipment"
  const submitLabel     = saving
    ? (isEdit ? "Saving…" : "Creating…")
    : (isEdit ? "Save Changes" : "Create Shipment")

  /* ── Render ───────────────────────────────────────────── */
  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        size="xl"
        footer={
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-red-600">{error}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                form="shipment-form"
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
              >
                {submitLabel}
              </button>
            </div>
          </div>
        }
      >
        <form id="shipment-form" onSubmit={handleSubmit} className="space-y-6">

          {/* Client selector — admin create, Supabase mode only */}
          {showClientField && (
            <div>
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">Client</h3>
              <select
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full max-w-xs px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── Section 1: Products ─────────────────────────── */}
          <div>
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">Products</h3>
            <div className="space-y-2">
              {productRows.map((row) => (
                <div key={row.id} className="flex items-start gap-2">
                  <select
                    value={row.productId}
                    onChange={(e) => handleProductSelect(row.id, e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select product…</option>
                    {dropdownProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.sku ? ` (${p.sku})` : ""}{p.status === "Archived" ? " [archived]" : ""}
                      </option>
                    ))}
                    <option disabled>──────────────</option>
                    <option value="__CREATE__">+ Create New Product</option>
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={row.units || ""}
                    onChange={(e) => updateProductRow(row.id, { units: Number(e.target.value) })}
                    placeholder="Units"
                    title="Expected units"
                    className="w-20 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  />

                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) => updateProductRow(row.id, { notes: e.target.value })}
                    placeholder="Notes"
                    className="w-36 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  <button
                    type="button"
                    onClick={() => removeProductRow(row.id)}
                    disabled={productRows.length === 1}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-0.5"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addProductRow}
              className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="size-3.5" />
              Add Another Product
            </button>
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Section 2: Shipping ─────────────────────────── */}
          <div>
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">
              Shipping Information
            </h3>
            <div className="space-y-2">
              {trackingRows.map((row) => (
                <div key={row.id} className="flex items-start gap-2">
                  <select
                    value={row.carrier}
                    onChange={(e) => updateTrackingRow(row.id, { carrier: e.target.value })}
                    className="w-36 shrink-0 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CARRIERS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={row.trackingNumber}
                    onChange={(e) => updateTrackingRow(row.id, { trackingNumber: e.target.value })}
                    placeholder="Tracking number"
                    className="flex-1 min-w-0 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />

                  <input
                    type="number"
                    min="1"
                    value={row.boxCount}
                    onChange={(e) => updateTrackingRow(row.id, { boxCount: Number(e.target.value) })}
                    title="Box count"
                    className="w-16 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  />

                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) => updateTrackingRow(row.id, { notes: e.target.value })}
                    placeholder="Notes"
                    className="w-32 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  <button
                    type="button"
                    onClick={() => removeTrackingRow(row.id)}
                    disabled={trackingRows.length === 1}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-0.5"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addTrackingRow}
              className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="size-3.5" />
              Add Another Tracking
            </button>
          </div>

          {/* ── Section 3: Admin Receiving (edit mode only) ──── */}
          {isEdit && isAdmin && (
            <>
              <div className="border-t border-gray-100" />
              <div>
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Status &amp; Receiving
                </h3>

                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ShipmentStatus)}
                    className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>

                  {inventoryPosted && (
                    <div className="flex items-center gap-1.5 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      Inventory already posted — stock will not auto-adjust.
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-[12px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-20">Expected</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-24">Received</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-24">Damaged</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-24">In Transit</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-20">Missing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {productRows.filter((r) => r.productId).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-center text-[12px] text-gray-400">
                            Add products in Section 1 to see receiving details.
                          </td>
                        </tr>
                      ) : (
                        productRows.filter((r) => r.productId).map((row) => {
                          const meta      = products.find((p) => p.id === row.productId)
                          const existing  = shipment?.products.find((p) => p.productId === row.productId)
                          const name      = meta?.name ?? existing?.productName ?? row.productId
                          const inTransit = isInTransit
                            ? Math.max(0, row.units - row.receivedUnits - row.damagedUnits)
                            : 0
                          const missing   = !isInTransit
                            ? Math.max(0, row.units - row.receivedUnits - row.damagedUnits)
                            : 0
                          return (
                            <tr key={row.id} className="hover:bg-gray-50/60">
                              <td className="px-3 py-2 text-gray-800 font-medium max-w-[160px] truncate">{name}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-600">{row.units}</td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  max={row.units}
                                  value={row.receivedUnits}
                                  onChange={(e) => updateProductRow(row.id, { receivedUnits: Math.max(0, Number(e.target.value)) })}
                                  className="w-16 px-1.5 py-0.5 text-[12px] text-right border border-gray-200 rounded tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  value={row.damagedUnits}
                                  onChange={(e) => updateProductRow(row.id, { damagedUnits: Math.max(0, Number(e.target.value)) })}
                                  className="w-16 px-1.5 py-0.5 text-[12px] text-right border border-gray-200 rounded tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                              </td>
                              <td className={`px-3 py-2 text-right tabular-nums font-medium ${inTransit > 0 ? "text-blue-600" : "text-gray-300"}`}>
                                {inTransit > 0 ? inTransit.toLocaleString() : "—"}
                              </td>
                              <td className={`px-3 py-2 text-right tabular-nums font-semibold ${missing > 0 ? "text-red-600" : "text-gray-300"}`}>
                                {missing > 0 ? missing.toLocaleString() : "—"}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div className="border-t border-gray-100" />

          {/* Notes */}
          <div>
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
              General Notes
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional shipment notes…"
              rows={2}
              className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
              <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
              <p className="text-[12px] text-red-600 leading-snug">{error}</p>
            </div>
          )}
        </form>
      </Modal>

      {/* Nested: Create New Product */}
      <ProductModal
        isOpen={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        role={role}
        zIndex={60}
        onSave={async (formData) => {
          if (!isMockMode) {
            const newProduct = await createProduct({ ...formData, clientId: clientId || undefined })
            setProducts((prev) => [newProduct, ...prev])
            if (createProductRowId) updateProductRow(createProductRowId, { productId: newProduct.id })
          } else {
            const newProduct = {
              id:         `p${Date.now()}`,
              clientId:   "c1",
              clientName: "TechVault Co.",
              ...formData,
            }
            setProducts((prev) => [newProduct, ...prev])
            if (createProductRowId) updateProductRow(createProductRowId, { productId: newProduct.id })
          }
          setProductModalOpen(false)
          setCreateProductRowId(null)
        }}
      />
    </>
  )
}
