"use client"

import { useState } from "react"
import { AlertCircle } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import type { ShipmentProduct } from "@/lib/types"

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
  onConfirm: (results: ReceivingResult[]) => void | Promise<void>
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

  // Reset when modal re-opens for a different shipment / mode
  const [prevKey, setPrevKey] = useState("")
  const currentKey = `${isOpen}|${mode}|${products.map((p) => p.productId).join(",")}`
  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
    if (isOpen) setLines(initLines(mode, products))
  }

  function updateLine(productId: string, field: "received" | "damaged", raw: number) {
    const value = Math.max(0, raw)
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, [field]: value } : l)))
  }

  const isPartial = mode === "partially_received"
  const title     = isPartial ? "Record Partial Receiving" : "Confirm Receiving"
  const label     = isPartial ? "Confirm Partial Receive"  : "Confirm Receiving"

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
              onConfirm(lines.map((l) => ({
                productId: l.productId,
                received:  l.received,
                damaged:   l.damaged,
                expected:  l.expected,
              })))
            }
            className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : label}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {isPartial && (
          <p className="text-[12px] text-gray-500">
            Enter the received and damaged quantities. Still in Transit is calculated automatically.
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
                {isPartial && (
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-32">Still in Transit</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line) => {
                const still = Math.max(0, line.expected - line.received - line.damaged)
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
                    {isPartial && (
                      <td className="px-4 py-2.5 text-right text-[13px] tabular-nums font-semibold text-blue-700">
                        {still.toLocaleString()}
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
