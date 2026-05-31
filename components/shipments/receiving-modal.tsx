"use client"

import { useState } from "react"
import { AlertCircle } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import type { ShipmentProduct, ShipmentStatus } from "@/lib/types"

export type ReceivingResult = {
  productId: string
  received: number
  damaged: number
  expected: number
}

type Line = {
  productId: string
  productName: string
  sku: string
  expected: number
  received: number
  damaged: number
}

type ReceivingModalProps = {
  isOpen: boolean
  onClose: () => void
  mode: "received" | "partially_received"
  products: ShipmentProduct[]
  /** finalStatus is computed inside the modal based on the remaining-in-transit choice. */
  onConfirm: (results: ReceivingResult[], finalStatus: ShipmentStatus) => void | Promise<void>
  saving?: boolean
  error?: string | null
}

function initLines(mode: "received" | "partially_received", products: ShipmentProduct[]): Line[] {
  return products.map((p) => ({
    productId:   p.productId,
    productName: p.productName,
    sku:         p.sku,
    expected:    p.units,
    received:    mode === "received" ? p.units : 0,
    damaged:     0,
  }))
}

export function ReceivingModal({
  isOpen,
  onClose,
  mode,
  products,
  onConfirm,
  saving = false,
  error  = null,
}: ReceivingModalProps) {
  const [lines, setLines] = useState<Line[]>(() => initLines(mode, products))
  // For "received" mode: whether remaining units are still in transit.
  // Defaults to false (mark remaining as missing) when opening in "received" mode.
  const [remainingInTransit, setRemainingInTransit] = useState(mode === "partially_received")

  // Reset when modal re-opens for a different shipment / mode
  const [prevKey, setPrevKey] = useState("")
  const currentKey = `${isOpen}|${mode}|${products.map((p) => p.productId).join(",")}`
  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
    if (isOpen) {
      setLines(initLines(mode, products))
      setRemainingInTransit(mode === "partially_received")
    }
  }

  function updateLine(productId: string, field: "received" | "damaged", raw: number) {
    const value = Math.max(0, raw)
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, [field]: value } : l)))
  }

  // "Partially Received" mode always keeps remaining in transit.
  // "Received" mode: depends on admin's choice.
  const showInTransit = mode === "partially_received" || remainingInTransit
  const finalStatus: ShipmentStatus = showInTransit ? "Partially Received" : "Received"

  const title = showInTransit ? "Record Partial Receiving" : "Confirm Receiving"
  const label = showInTransit ? "Confirm Partial Receive"  : "Confirm Receiving"

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onConfirm(
                lines.map((l) => ({
                  productId: l.productId,
                  received:  l.received,
                  damaged:   l.damaged,
                  expected:  l.expected,
                })),
                finalStatus,
              )
            }
            className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : label}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Remaining-in-transit toggle — only shown in "received" mode */}
        {mode === "received" && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12px] text-gray-600">Remaining units:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRemainingInTransit(false)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                  !remainingInTransit
                    ? "bg-gray-800 text-white border-gray-800"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Mark as missing
              </button>
              <button
                type="button"
                onClick={() => setRemainingInTransit(true)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                  remainingInTransit
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Still in transit
              </button>
            </div>
            <span className="text-[11px] text-gray-400">
              {remainingInTransit ? "→ Partially Received" : "→ Received"}
            </span>
          </div>
        )}

        {mode === "partially_received" && (
          <p className="text-[12px] text-gray-500">
            Enter received and damaged quantities. Remaining units stay In Transit.
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left   text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                <th className="px-4 py-2.5 text-left   text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-24">SKU</th>
                <th className="px-4 py-2.5 text-right  text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-20">Expected</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-28">Received</th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-28">Damaged</th>
                {showInTransit && (
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-28">In Transit</th>
                )}
                {!showInTransit && (
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-28">Missing</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line) => {
                const remaining = Math.max(0, line.expected - line.received - line.damaged)
                return (
                  <tr key={line.productId} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-[13px] font-medium text-gray-800">
                      {line.productName}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">
                      {line.sku || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] tabular-nums text-gray-700">
                      {line.expected.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min="0"
                        max={line.expected}
                        value={line.received}
                        onChange={(e) => updateLine(line.productId, "received", Number(e.target.value))}
                        className="w-20 mx-auto block px-2 py-1.5 text-[12px] text-right border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min="0"
                        value={line.damaged}
                        onChange={(e) => updateLine(line.productId, "damaged", Number(e.target.value))}
                        className="w-20 mx-auto block px-2 py-1.5 text-[12px] text-right border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                      />
                    </td>
                    {showInTransit ? (
                      <td className="px-4 py-2.5 text-right text-[13px] tabular-nums font-semibold text-blue-700">
                        {remaining.toLocaleString()}
                      </td>
                    ) : (
                      <td className={`px-4 py-2.5 text-right text-[13px] tabular-nums ${remaining > 0 ? "font-bold text-red-600" : "text-gray-400"}`}>
                        {remaining.toLocaleString()}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
            <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-red-600 leading-snug">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
