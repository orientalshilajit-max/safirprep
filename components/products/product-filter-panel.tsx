"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"

export type ProductFilters = {
  clientIds: string[]
  inventoryStatus: "" | "in-stock" | "incoming-only" | "out-of-stock" | "low-stock"
  hasIncoming: "" | "yes" | "no"
  dateAdded: "" | "today" | "7d" | "30d" | "custom"
  dateFrom: string
  dateTo: string
  imageStatus: "" | "has-image" | "no-image"
}

export const DEFAULT_FILTERS: ProductFilters = {
  clientIds: [],
  inventoryStatus: "",
  hasIncoming: "",
  dateAdded: "",
  dateFrom: "",
  dateTo: "",
  imageStatus: "",
}

export function countActiveFilters(f: ProductFilters): number {
  return (
    (f.clientIds.length > 0 ? 1 : 0) +
    (f.inventoryStatus ? 1 : 0) +
    (f.hasIncoming ? 1 : 0) +
    (f.dateAdded ? 1 : 0) +
    (f.imageStatus ? 1 : 0)
  )
}

type Props = {
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
  appliedFilters: ProductFilters
  onApply: (f: ProductFilters) => void
  onClear: () => void
  clients: { id: string; name: string }[]
  isAdmin: boolean
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  )
}

function RadioOption({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="size-3.5 accent-blue-600"
      />
      <span className={`text-[12px] ${checked ? "text-gray-900 font-medium" : "text-gray-600"} group-hover:text-gray-900`}>
        {label}
      </span>
    </label>
  )
}

// The parent renders this component only when the panel is open, so it mounts
// fresh on each open. useState(appliedFilters) correctly captures the current
// applied state at open-time without needing an effect to sync it.
export function ProductFilterPanel({
  onClose,
  anchorRef,
  appliedFilters,
  onApply,
  onClear,
  clients,
  isAdmin,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<ProductFilters>(appliedFilters)
  const [pos, setPos] = useState({ top: 0, right: 0 })

  // Compute panel position from the anchor button on mount (DOM read → external sync)
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }
  // anchorRef identity is stable; run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close on click outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose, anchorRef])

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  function toggleClient(id: string) {
    setPending((prev) => ({
      ...prev,
      clientIds: prev.clientIds.includes(id)
        ? prev.clientIds.filter((c) => c !== id)
        : [...prev.clientIds, id],
    }))
  }

  function setInvStatus(v: ProductFilters["inventoryStatus"]) {
    setPending((prev) => ({ ...prev, inventoryStatus: prev.inventoryStatus === v ? "" : v }))
  }

  function setHasIncoming(v: ProductFilters["hasIncoming"]) {
    setPending((prev) => ({ ...prev, hasIncoming: prev.hasIncoming === v ? "" : v }))
  }

  function setDateAdded(v: ProductFilters["dateAdded"]) {
    setPending((prev) => ({
      ...prev,
      dateAdded: prev.dateAdded === v ? "" : v,
      dateFrom: "",
      dateTo: "",
    }))
  }

  function setImageStatus(v: ProductFilters["imageStatus"]) {
    setPending((prev) => ({ ...prev, imageStatus: prev.imageStatus === v ? "" : v }))
  }

  function handleApply() {
    onApply(pending)
    onClose()
  }

  function handleClear() {
    onClear()
    onClose()
  }

  return (
    <div
      ref={panelRef}
      className="fixed z-40 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
      style={{ top: pos.top, right: pos.right }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-[13px] font-semibold text-gray-900">Filters</p>
        <button
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto">

        {/* CLIENT — admin only */}
        {isAdmin && clients.length > 0 && (
          <Section title="Client">
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {clients.map((c) => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={pending.clientIds.includes(c.id)}
                    onChange={() => toggleClient(c.id)}
                    className="size-3.5 accent-blue-600 rounded"
                  />
                  <span className={`text-[12px] truncate ${pending.clientIds.includes(c.id) ? "text-gray-900 font-medium" : "text-gray-600"} group-hover:text-gray-900`}>
                    {c.name}
                  </span>
                </label>
              ))}
            </div>
          </Section>
        )}

        {/* INVENTORY STATUS */}
        <Section title="Inventory Status">
          <div className="space-y-1.5">
            <RadioOption label="In Stock (available > 0)"      checked={pending.inventoryStatus === "in-stock"}      onChange={() => setInvStatus("in-stock")} />
            <RadioOption label="Incoming Only (available = 0)" checked={pending.inventoryStatus === "incoming-only"} onChange={() => setInvStatus("incoming-only")} />
            <RadioOption label="Out of Stock"                  checked={pending.inventoryStatus === "out-of-stock"}  onChange={() => setInvStatus("out-of-stock")} />
            <RadioOption label="Low Stock (available ≤ 10)"   checked={pending.inventoryStatus === "low-stock"}     onChange={() => setInvStatus("low-stock")} />
          </div>
        </Section>

        {/* HAS INCOMING SHIPMENT */}
        <Section title="Has Incoming Shipment">
          <div className="space-y-1.5">
            <RadioOption label="Yes" checked={pending.hasIncoming === "yes"} onChange={() => setHasIncoming("yes")} />
            <RadioOption label="No"  checked={pending.hasIncoming === "no"}  onChange={() => setHasIncoming("no")} />
          </div>
        </Section>

        {/* DATE ADDED */}
        <Section title="Date Added">
          <div className="space-y-1.5">
            <RadioOption label="Today"        checked={pending.dateAdded === "today"}  onChange={() => setDateAdded("today")} />
            <RadioOption label="Last 7 Days"  checked={pending.dateAdded === "7d"}     onChange={() => setDateAdded("7d")} />
            <RadioOption label="Last 30 Days" checked={pending.dateAdded === "30d"}    onChange={() => setDateAdded("30d")} />
            <RadioOption label="Custom Range" checked={pending.dateAdded === "custom"} onChange={() => setDateAdded("custom")} />
          </div>
          {pending.dateAdded === "custom" && (
            <div className="mt-2 space-y-1.5">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">From</label>
                <input
                  type="date"
                  value={pending.dateFrom}
                  onChange={(e) => setPending((p) => ({ ...p, dateFrom: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">To</label>
                <input
                  type="date"
                  value={pending.dateTo}
                  onChange={(e) => setPending((p) => ({ ...p, dateTo: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </Section>

        {/* IMAGE STATUS */}
        <Section title="Image Status">
          <div className="space-y-1.5">
            <RadioOption label="Has Image" checked={pending.imageStatus === "has-image"} onChange={() => setImageStatus("has-image")} />
            <RadioOption label="No Image"  checked={pending.imageStatus === "no-image"}  onChange={() => setImageStatus("no-image")} />
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
        <button
          onClick={handleClear}
          className="flex-1 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Clear Filters
        </button>
        <button
          onClick={handleApply}
          className="flex-1 py-1.5 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Apply Filters
        </button>
      </div>
    </div>
  )
}
