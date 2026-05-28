"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Plus, X, Save } from "lucide-react"
import { useRole, useProducts, useShipments } from "@/components/layout/app-shell"
import { StatusBadge } from "@/components/ui/status-badge"
import { CARRIERS } from "@/lib/types"
import type { Shipment, ShipmentProduct, ShipmentTracking, ShipmentStatus } from "@/lib/types"

const STATUSES: ShipmentStatus[] = [
  "In Transit",
  "Arrived",
  "Received",
  "Partially Received",
  "Need Attention",
]

const RECEIVED_STATUSES: ShipmentStatus[] = ["Received", "Partially Received"]

const uid = () => Math.random().toString(36).slice(2)

export default function EditShipmentPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { role } = useRole()
  const { products } = useProducts()
  const { shipments, setShipments } = useShipments()
  const { setProducts } = useProducts()

  const shipment = shipments.find((s) => s.id === params.id)

  /* ── Local edit state ─────────────────────────────────── */
  const [status, setStatus] = useState<ShipmentStatus>("In Transit")
  const [shipProducts, setShipProducts] = useState<ShipmentProduct[]>([])
  const [shipTracking, setShipTracking] = useState<ShipmentTracking[]>([])
  const [notes, setNotes] = useState("")
  const [originalStatus, setOriginalStatus] = useState<ShipmentStatus>("In Transit")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (shipment) {
      setStatus(shipment.status)
      setOriginalStatus(shipment.status)
      setShipProducts(shipment.products.map((p) => ({ ...p })))
      setShipTracking(shipment.tracking.map((t) => ({ ...t })))
      setNotes(shipment.notes)
    }
  }, [shipment?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!shipment) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-gray-500 text-[14px]">Shipment not found.</p>
        <button
          onClick={() => router.push("/shipments")}
          className="text-blue-600 text-[13px] font-medium hover:underline"
        >
          ← Back to Shipments
        </button>
      </div>
    )
  }

  /* ── Product rows ─────────────────────────────────────── */
  const updateProduct = (id: string, patch: Partial<ShipmentProduct>) =>
    setShipProducts((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const removeProduct = (id: string) =>
    setShipProducts((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows))
  function addProduct() {
    setShipProducts((rows) => [
      ...rows,
      { id: uid(), productId: "", productName: "", sku: "", units: 0, receivedUnits: 0, damagedUnits: 0, notes: "" },
    ])
  }

  /* ── Tracking rows ────────────────────────────────────── */
  const updateTracking = (id: string, patch: Partial<ShipmentTracking>) =>
    setShipTracking((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const removeTracking = (id: string) =>
    setShipTracking((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows))
  function addTracking() {
    setShipTracking((rows) => [
      ...rows,
      { id: uid(), carrier: "UPS", trackingNumber: "", boxCount: 1, notes: "" },
    ])
  }

  /* ── Save ─────────────────────────────────────────────── */
  function handleSave() {
    const updated: Shipment = {
      id: shipment!.id,
      shipmentNumber: shipment!.shipmentNumber,
      clientId: shipment!.clientId,
      clientName: shipment!.clientName,
      status,
      products: shipProducts,
      tracking: shipTracking,
      notes,
      isArchived: shipment!.isArchived,
      createdAt: shipment!.createdAt,
    }

    // Apply inventory update if transitioning INTO a received status
    const wasReceived = RECEIVED_STATUSES.includes(originalStatus)
    const nowReceived = RECEIVED_STATUSES.includes(status)
    const shouldUpdateInventory = role === "admin" && nowReceived && !wasReceived && !shipment!.isInventoryUpdated

    if (shouldUpdateInventory) {
      updated.isInventoryUpdated = true
      setProducts((prev) =>
        prev.map((p) => {
          const sp = shipProducts.find((x) => x.productId === p.id)
          if (!sp) return p
          return {
            ...p,
            available: p.available + sp.receivedUnits,
            incoming: Math.max(0, p.incoming - sp.units),
            damaged: p.damaged + sp.damagedUnits,
          }
        })
      )
    }

    setShipments((prev) => prev.map((s) => (s.id === shipment!.id ? updated : s)))
    setSaved(true)
    setTimeout(() => {
      router.push("/shipments")
    }, 300)
  }

  const isAdmin = role === "admin"
  const activeProducts = products.filter((p) => p.status === "Active")
  const totalUnits = shipProducts.reduce((s, p) => s + p.units, 0)
  const currentShipment = shipment!

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-5 pb-8 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/shipments")}
            className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-[17px] font-bold text-gray-900">
            {shipment.shipmentNumber}
          </h1>
          <StatusBadge status={currentShipment.status} />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/shipments")}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saved}
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
          >
            <Save className="size-3.5" />
            Save Changes
          </button>
        </div>
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-4 text-[12px] text-gray-400">
        <span>Created {currentShipment.createdAt}</span>
        {isAdmin && <span>· {currentShipment.clientName}</span>}
        <span>· {totalUnits.toLocaleString()} units total</span>
      </div>

      {/* Status card (admin only) */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3">
            Shipment Status
          </p>
          <div className="flex items-center gap-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ShipmentStatus)}
              className="px-3 py-2 text-[13px] font-medium border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {RECEIVED_STATUSES.includes(status) && !currentShipment.isInventoryUpdated && (
              <p className="text-[12px] text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                Saving will move received units into Available inventory.
              </p>
            )}
            {currentShipment.isInventoryUpdated && (
              <p className="text-[12px] text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
                Inventory already updated for this shipment.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Products card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-[13px] font-semibold text-gray-800">Products</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Product
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-24">
                  SKU
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-24">
                  Units
                </th>
                {isAdmin && (
                  <>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-28">
                      Received
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-28">
                      Damaged
                    </th>
                  </>
                )}
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Notes
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shipProducts.map((sp) => (
                <tr key={sp.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    <select
                      value={sp.productId}
                      onChange={(e) => {
                        const p = activeProducts.find((x) => x.id === e.target.value)
                        updateProduct(sp.id, {
                          productId: e.target.value,
                          productName: p?.name ?? sp.productName,
                          sku: p?.sku ?? sp.sku,
                        })
                      }}
                      className="w-full max-w-xs px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select product…</option>
                      {activeProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                      {sp.productId && !activeProducts.find((p) => p.id === sp.productId) && (
                        <option value={sp.productId}>{sp.productName}</option>
                      )}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[11px] text-gray-500">{sp.sku || "—"}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min="0"
                      value={sp.units}
                      onChange={(e) => updateProduct(sp.id, { units: Number(e.target.value) })}
                      className="w-20 ml-auto block px-2 py-1.5 text-[12px] text-right border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                    />
                  </td>
                  {isAdmin && (
                    <>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min="0"
                          value={sp.receivedUnits}
                          onChange={(e) => updateProduct(sp.id, { receivedUnits: Number(e.target.value) })}
                          className="w-20 ml-auto block px-2 py-1.5 text-[12px] text-right border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min="0"
                          value={sp.damagedUnits}
                          onChange={(e) => updateProduct(sp.id, { damagedUnits: Number(e.target.value) })}
                          className="w-20 ml-auto block px-2 py-1.5 text-[12px] text-right border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                        />
                      </td>
                    </>
                  )}
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      value={sp.notes}
                      onChange={(e) => updateProduct(sp.id, { notes: e.target.value })}
                      placeholder="Notes…"
                      className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => removeProduct(sp.id)}
                      disabled={shipProducts.length === 1}
                      className="flex size-6 items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <X className="size-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={addProduct}
            className="flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="size-3.5" />
            Add Product
          </button>
        </div>
      </div>

      {/* Tracking card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-[13px] font-semibold text-gray-800">Tracking</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-36">
                  Carrier
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Tracking Number
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-20">
                  Boxes
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Notes
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shipTracking.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    <select
                      value={t.carrier}
                      onChange={(e) => updateTracking(t.id, { carrier: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {CARRIERS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      value={t.trackingNumber}
                      onChange={(e) => updateTracking(t.id, { trackingNumber: e.target.value })}
                      placeholder="Tracking number"
                      className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono placeholder:text-gray-300 placeholder:font-sans"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min="1"
                      value={t.boxCount}
                      onChange={(e) => updateTracking(t.id, { boxCount: Number(e.target.value) })}
                      className="w-16 ml-auto block px-2 py-1.5 text-[12px] text-right border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      value={t.notes}
                      onChange={(e) => updateTracking(t.id, { notes: e.target.value })}
                      placeholder="Notes…"
                      className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => removeTracking(t.id)}
                      disabled={shipTracking.length === 1}
                      className="flex size-6 items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <X className="size-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={addTracking}
            className="flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="size-3.5" />
            Add Tracking
          </button>
        </div>
      </div>

      {/* Notes card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3">
          General Notes
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes about this shipment…"
          rows={3}
          className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
        />
      </div>
    </div>
  )
}
