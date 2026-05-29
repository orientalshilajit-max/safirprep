"use client"

import { useEffect, useState, useCallback } from "react"
import { Plus, X } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { ProductModal } from "@/components/products/product-modal"
import { useProducts, useShipments, useRole } from "@/components/layout/app-shell"
import { CARRIERS } from "@/lib/types"
import type { Shipment, ShipmentProduct, ShipmentTracking } from "@/lib/types"

type ProductRow = { id: string; productId: string; units: number; notes: string }
type TrackingRow = { id: string; carrier: string; trackingNumber: string; boxCount: number; notes: string }

const uid = () => Math.random().toString(36).slice(2)

const emptyProductRow = (): ProductRow => ({ id: uid(), productId: "", units: 0, notes: "" })
const emptyTrackingRow = (): TrackingRow => ({ id: uid(), carrier: "UPS", trackingNumber: "", boxCount: 1, notes: "" })

type ShipmentModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (s: Shipment) => void
}

export function ShipmentModal({ isOpen, onClose, onSave }: ShipmentModalProps) {
  const { role } = useRole()
  const { products, setProducts } = useProducts()
  const { shipments } = useShipments()

  const [productRows, setProductRows] = useState<ProductRow[]>([emptyProductRow()])
  const [trackingRows, setTrackingRows] = useState<TrackingRow[]>([emptyTrackingRow()])
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [createProductRowId, setCreateProductRowId] = useState<string | null>(null)
  const [productModalOpen, setProductModalOpen] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setProductRows([emptyProductRow()])
      setTrackingRows([emptyTrackingRow()])
      setNotes("")
      setError("")
    }
  }, [isOpen])

  /* ── Product rows ─────────────────────────────────────── */
  const addProductRow = () => setProductRows((r) => [...r, emptyProductRow()])
  const removeProductRow = (id: string) =>
    setProductRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : r))
  const updateProductRow = useCallback((id: string, patch: Partial<ProductRow>) =>
    setProductRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))), [])

  function handleProductSelect(rowId: string, value: string) {
    if (value === "__CREATE__") {
      setCreateProductRowId(rowId)
      setProductModalOpen(true)
      return
    }
    updateProductRow(rowId, { productId: value })
  }

  /* ── Tracking rows ────────────────────────────────────── */
  const addTrackingRow = () => setTrackingRows((r) => [...r, emptyTrackingRow()])
  const removeTrackingRow = (id: string) =>
    setTrackingRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : r))
  const updateTrackingRow = (id: string, patch: Partial<TrackingRow>) =>
    setTrackingRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  /* ── Submit ───────────────────────────────────────────── */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validProducts = productRows.filter((r) => r.productId && r.units > 0)
    if (!validProducts.length) {
      setError("Add at least one product with a quantity.")
      return
    }
    setError("")

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
      .map((r) => ({ id: r.id, carrier: r.carrier, trackingNumber: r.trackingNumber, boxCount: r.boxCount, notes: r.notes }))

    const shipment: Shipment = {
      id: `s${Date.now()}`,
      shipmentNumber: `IN-${maxNum + 1}`,
      clientId: "c1",
      clientName: "TechVault Co.",
      products: sProducts,
      tracking: sTracking,
      status: "In Transit",
      createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      notes,
    }

    onSave(shipment)
  }

  const activeProducts = products.filter((p) => p.status === "Active")

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
                className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                form="shipment-form"
                type="submit"
                className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Create Shipment
              </button>
            </div>
          </div>
        }
      >
        <form id="shipment-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Products */}
          <div>
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">
              Products
            </h3>
            <div className="space-y-2">
              {productRows.map((row) => (
                <div key={row.id} className="flex items-start gap-2">
                  {/* Product select */}
                  <select
                    value={row.productId}
                    onChange={(e) => handleProductSelect(row.id, e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select product…</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                    <option disabled>──────────────</option>
                    <option value="__CREATE__">+ Create New Product</option>
                  </select>

                  {/* Units */}
                  <input
                    type="number"
                    min="1"
                    value={row.units || ""}
                    onChange={(e) => updateProductRow(row.id, { units: Number(e.target.value) })}
                    placeholder="Units"
                    className="w-20 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  />

                  {/* Notes */}
                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) => updateProductRow(row.id, { notes: e.target.value })}
                    placeholder="Notes"
                    className="w-36 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  {/* Remove */}
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

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Section 2: Tracking */}
          <div>
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">
              Shipping Information
            </h3>
            <div className="space-y-2">
              {trackingRows.map((row) => (
                <div key={row.id} className="flex items-start gap-2">
                  {/* Carrier */}
                  <select
                    value={row.carrier}
                    onChange={(e) => updateTrackingRow(row.id, { carrier: e.target.value })}
                    className="w-36 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CARRIERS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  {/* Tracking # */}
                  <input
                    type="text"
                    value={row.trackingNumber}
                    onChange={(e) => updateTrackingRow(row.id, { trackingNumber: e.target.value })}
                    placeholder="Tracking number"
                    className="flex-1 min-w-0 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />

                  {/* Box count */}
                  <input
                    type="number"
                    min="1"
                    value={row.boxCount}
                    onChange={(e) => updateTrackingRow(row.id, { boxCount: Number(e.target.value) })}
                    className="w-16 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                    title="Box count"
                  />

                  {/* Notes */}
                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) => updateTrackingRow(row.id, { notes: e.target.value })}
                    placeholder="Notes"
                    className="w-32 px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  {/* Remove */}
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

          {/* Divider */}
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
        </form>
      </Modal>

      {/* Nested: Create New Product */}
      <ProductModal
        isOpen={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        role={role}
        zIndex={60}
        onSave={(formData) => {
          const newProduct = {
            id: `p${Date.now()}`,
            clientId: "c1",
            clientName: "TechVault Co.",
            ...formData,
          }
          setProducts((prev) => [newProduct, ...prev])
          if (createProductRowId) {
            updateProductRow(createProductRowId, { productId: newProduct.id })
          }
          setProductModalOpen(false)
          setCreateProductRowId(null)
        }}
      />
    </>
  )
}
