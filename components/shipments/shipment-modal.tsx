"use client"

import { useState, useCallback } from "react"
import { Plus, X, AlertCircle } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { ProductModal } from "@/components/products/product-modal"
import { useProducts, useShipments, useRole, useIsMockMode } from "@/components/layout/app-shell"
import { CARRIERS } from "@/lib/types"
import type { Shipment, ShipmentProduct, ShipmentTracking } from "@/lib/types"
import { createShipment } from "@/app/shipments/actions"
import { createProduct } from "@/app/products/actions"

type ProductRow  = { id: string; productId: string; units: number; notes: string }
type TrackingRow = { id: string; carrier: string; trackingNumber: string; boxCount: number; notes: string }

const uid = () => Math.random().toString(36).slice(2)

const emptyProductRow  = (): ProductRow  => ({ id: uid(), productId: "", units: 0, notes: "" })
const emptyTrackingRow = (): TrackingRow => ({ id: uid(), carrier: "UPS", trackingNumber: "", boxCount: 1, notes: "" })

type ShipmentModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (s: Shipment) => void
  /** Admin-only: list of clients for the "assign to client" selector. */
  clients?: { id: string; name: string }[]
}

export function ShipmentModal({ isOpen, onClose, onSave, clients = [] }: ShipmentModalProps) {
  const { role }              = useRole()
  const { products, setProducts } = useProducts()
  const { shipments }         = useShipments()
  const isMockMode            = useIsMockMode()

  const [productRows,  setProductRows]  = useState<ProductRow[]>([emptyProductRow()])
  const [trackingRows, setTrackingRows] = useState<TrackingRow[]>([emptyTrackingRow()])
  const [notes,        setNotes]        = useState("")
  const [clientId,     setClientId]     = useState<string>("")
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState("")

  const [createProductRowId, setCreateProductRowId] = useState<string | null>(null)
  const [productModalOpen,   setProductModalOpen]   = useState(false)

  // Reset form when modal opens
  const [prevIsOpen, setPrevIsOpen] = useState(false)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setProductRows([emptyProductRow()])
      setTrackingRows([emptyTrackingRow()])
      setNotes("")
      setClientId(clients[0]?.id ?? "")
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
  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    const validProducts = productRows.filter((r) => r.productId && r.units > 0)
    if (!validProducts.length) {
      setError("Add at least one product with a quantity.")
      return
    }
    if (role === "admin" && !isMockMode && clients.length > 0 && !clientId) {
      setError("Select a client.")
      return
    }
    setError("")
    setSaving(true)

    try {
      if (!isMockMode) {
        // ── Supabase mode ──────────────────────────────────────
        const shipment = await createShipment({
          clientId: clientId || undefined,
          products: validProducts.map((r) => ({
            productId: r.productId,
            units: r.units,
            notes: r.notes,
          })),
          tracking: trackingRows
            .filter((r) => r.carrier)
            .map((r) => ({
              carrier: r.carrier,
              trackingNumber: r.trackingNumber,
              boxCount: r.boxCount,
              notes: r.notes,
            })),
          notes,
        })
        onSave(shipment)
      } else {
        // ── Mock mode (unchanged) ──────────────────────────────
        const maxNum = shipments.reduce((max, s) => {
          const n = parseInt(s.shipmentNumber.replace("IN-", "")) || 0
          return Math.max(max, n)
        }, 1008)

        const sProducts: ShipmentProduct[] = validProducts.map((r) => {
          const p = products.find((x) => x.id === r.productId)
          return {
            id: uid(),
            productId: r.productId,
            productName: p?.name ?? "",
            sku: p?.sku ?? "",
            units: r.units,
            receivedUnits: 0,
            damagedUnits: 0,
            notes: r.notes,
          }
        })

        const sTracking: ShipmentTracking[] = trackingRows
          .filter((r) => r.carrier || r.trackingNumber)
          .map((r) => ({
            id: r.id,
            carrier: r.carrier,
            trackingNumber: r.trackingNumber,
            boxCount: r.boxCount,
            notes: r.notes,
          }))

        const shipment: Shipment = {
          id: `s${Date.now()}`,
          shipmentNumber: `IN-${maxNum + 1}`,
          clientId: "c1",
          clientName: "TechVault Co.",
          products: sProducts,
          tracking: sTracking,
          status: "In Transit",
          createdAt: new Date().toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          }),
          notes,
        }
        onSave(shipment)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create shipment.")
      setSaving(false)
    }
  }

  const activeProducts  = products.filter((p) => p.status === "Active")
  const isAdmin         = role === "admin"
  const showClientField = isAdmin && !isMockMode && clients.length > 0

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Create Shipment"
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
                {saving ? "Creating…" : "Create Shipment"}
              </button>
            </div>
          </div>
        }
      >
        <form id="shipment-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Admin client selector (Supabase mode only) */}
          {showClientField && (
            <div>
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">
                Client
              </h3>
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

          {/* Section 1: Products */}
          <div>
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">
              Products
            </h3>
            <div className="space-y-2">
              {productRows.map((row) => (
                <div key={row.id} className="flex items-start gap-2">
                  <select
                    value={row.productId}
                    onChange={(e) => handleProductSelect(row.id, e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select product…</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
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

          {/* Section 2: Tracking */}
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
                    className="w-36 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-16 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                    title="Box count"
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

          {/* Inline error banner (also shown in footer, but useful for large forms) */}
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
            // Supabase mode: use the selected clientId (for admin) or session (for client)
            const newProduct = await createProduct({ ...formData, clientId: clientId || undefined })
            setProducts((prev) => [newProduct, ...prev])
            if (createProductRowId) updateProductRow(createProductRowId, { productId: newProduct.id })
          } else {
            // Mock mode
            const newProduct = {
              id: `p${Date.now()}`,
              clientId: "c1",
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
