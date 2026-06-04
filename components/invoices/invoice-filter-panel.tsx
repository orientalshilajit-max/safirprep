"use client"

import { useEffect, useRef, useState } from "react"
import { X, ChevronDown } from "lucide-react"
import type { InvoiceStatus } from "@/lib/types"

export type InvoiceFilters = {
  clientIds: string[]
  statuses: InvoiceStatus[]
  amountRange: "" | "under-50" | "50-100" | "100-500" | "500-plus" | "custom"
  amountFrom: string
  amountTo: string
  dateCreated: "" | "today" | "7d" | "30d" | "this-month" | "custom"
  dateCreatedFrom: string
  dateCreatedTo: string
  dueDateRange: "" | "due-today" | "due-this-week" | "due-next-7" | "overdue" | "custom"
  dueDateFrom: string
  dueDateTo: string
  mergeStatus: "" | "standalone" | "combined-invoice" | "included-in-merge"
}

export const DEFAULT_INVOICE_FILTERS: InvoiceFilters = {
  clientIds: [],
  statuses: [],
  amountRange: "",
  amountFrom: "",
  amountTo: "",
  dateCreated: "",
  dateCreatedFrom: "",
  dateCreatedTo: "",
  dueDateRange: "",
  dueDateFrom: "",
  dueDateTo: "",
  mergeStatus: "",
}

export function countActiveInvoiceFilters(f: InvoiceFilters): number {
  return (
    (f.clientIds.length > 0 ? 1 : 0) +
    (f.statuses.length > 0 ? 1 : 0) +
    (f.amountRange ? 1 : 0) +
    (f.dateCreated ? 1 : 0) +
    (f.dueDateRange ? 1 : 0) +
    (f.mergeStatus ? 1 : 0)
  )
}

type Props = {
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
  appliedFilters: InvoiceFilters
  onApply: (f: InvoiceFilters) => void
  onClear: () => void
  clients: { id: string; name: string }[]
  isAdmin: boolean
}

const ALL_STATUSES: InvoiceStatus[] = ["Unpaid", "Paid", "Overdue", "Void", "Combined"]

function CollapsibleSection({
  title,
  count,
  defaultExpanded = false,
  children,
}: {
  title: string
  count: number
  defaultExpanded?: boolean
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-gray-700">{title}</span>
          {count > 0 && (
            <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
              {count}
            </span>
          )}
        </div>
        <ChevronDown
          className={`size-3.5 text-gray-400 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && <div className="px-4 pb-3">{children}</div>}
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
      <input type="radio" checked={checked} onChange={onChange} className="size-3.5 accent-blue-600" />
      <span className={`text-[12px] ${checked ? "text-gray-900 font-medium" : "text-gray-600"} group-hover:text-gray-900`}>
        {label}
      </span>
    </label>
  )
}

function CheckOption({
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
      <input type="checkbox" checked={checked} onChange={onChange} className="size-3.5 accent-blue-600 rounded" />
      <span className={`text-[12px] ${checked ? "text-gray-900 font-medium" : "text-gray-600"} group-hover:text-gray-900`}>
        {label}
      </span>
    </label>
  )
}

function CustomRange({
  label,
  from,
  to,
  onFrom,
  onTo,
  type = "date",
  placeholder,
}: {
  label?: string
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  type?: "date" | "number"
  placeholder?: string
}) {
  return (
    <div className="mt-2 space-y-1.5">
      {label && <p className="text-[11px] text-gray-400">{label}</p>}
      <div>
        <label className="block text-[11px] text-gray-500 mb-0.5">From</label>
        <input
          type={type}
          value={from}
          onChange={(e) => onFrom(e.target.value)}
          placeholder={type === "number" ? (placeholder ?? "0") : undefined}
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-[11px] text-gray-500 mb-0.5">To</label>
        <input
          type={type}
          value={to}
          onChange={(e) => onTo(e.target.value)}
          placeholder={type === "number" ? (placeholder ?? "0") : undefined}
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  )
}

// Parent renders this only when panel is open → mounts fresh each time →
// useState(appliedFilters) captures the right initial values without a sync effect.
export function InvoiceFilterPanel({
  onClose,
  anchorRef,
  appliedFilters,
  onApply,
  onClear,
  clients,
  isAdmin,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<InvoiceFilters>(appliedFilters)
  const [pos, setPos] = useState({ top: 0, right: 0 })

  // Position from anchor (DOM read on mount)
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close on click outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (
        panelRef.current && !panelRef.current.contains(t) &&
        anchorRef.current && !anchorRef.current.contains(t)
      ) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose, anchorRef])

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  // ── Helpers ──────────────────────────────────────────────────

  function toggleClient(id: string) {
    setPending((p) => ({
      ...p,
      clientIds: p.clientIds.includes(id)
        ? p.clientIds.filter((c) => c !== id)
        : [...p.clientIds, id],
    }))
  }

  function toggleStatus(s: InvoiceStatus) {
    setPending((p) => ({
      ...p,
      statuses: p.statuses.includes(s)
        ? p.statuses.filter((x) => x !== s)
        : [...p.statuses, s],
    }))
  }

  function setAmountRange(v: InvoiceFilters["amountRange"]) {
    setPending((p) => ({
      ...p,
      amountRange: p.amountRange === v ? "" : v,
      amountFrom: "",
      amountTo: "",
    }))
  }

  function setDateCreated(v: InvoiceFilters["dateCreated"]) {
    setPending((p) => ({
      ...p,
      dateCreated: p.dateCreated === v ? "" : v,
      dateCreatedFrom: "",
      dateCreatedTo: "",
    }))
  }

  function setDueDateRange(v: InvoiceFilters["dueDateRange"]) {
    setPending((p) => ({
      ...p,
      dueDateRange: p.dueDateRange === v ? "" : v,
      dueDateFrom: "",
      dueDateTo: "",
    }))
  }

  function setMergeStatus(v: InvoiceFilters["mergeStatus"]) {
    setPending((p) => ({ ...p, mergeStatus: p.mergeStatus === v ? "" : v }))
  }

  function handleApply() { onApply(pending); onClose() }
  function handleClear() { onClear(); onClose() }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      ref={panelRef}
      className="fixed z-40 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
      style={{ top: pos.top, right: pos.right }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <p className="text-[13px] font-semibold text-gray-900">Filters</p>
        <button onClick={onClose}
          className="flex size-6 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <X className="size-3.5" />
        </button>
      </div>

      {/* Sections */}
      <div className="max-h-[72vh] overflow-y-auto">

        {/* CLIENT — admin only */}
        {isAdmin && clients.length > 0 && (
          <CollapsibleSection
            title="Client"
            count={pending.clientIds.length}
            defaultExpanded={pending.clientIds.length > 0}
          >
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {clients.map((c) => (
                <CheckOption
                  key={c.id}
                  label={c.name}
                  checked={pending.clientIds.includes(c.id)}
                  onChange={() => toggleClient(c.id)}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* STATUS */}
        <CollapsibleSection
          title="Status"
          count={pending.statuses.length}
          defaultExpanded={pending.statuses.length > 0}
        >
          <div className="space-y-1.5">
            {ALL_STATUSES.map((s) => (
              <CheckOption
                key={s}
                label={s}
                checked={pending.statuses.includes(s)}
                onChange={() => toggleStatus(s)}
              />
            ))}
          </div>
        </CollapsibleSection>

        {/* AMOUNT */}
        <CollapsibleSection
          title="Amount"
          count={pending.amountRange ? 1 : 0}
          defaultExpanded={!!pending.amountRange}
        >
          <div className="space-y-1.5">
            <RadioOption label="Under $50"    checked={pending.amountRange === "under-50"}  onChange={() => setAmountRange("under-50")} />
            <RadioOption label="$50 – $100"   checked={pending.amountRange === "50-100"}    onChange={() => setAmountRange("50-100")} />
            <RadioOption label="$100 – $500"  checked={pending.amountRange === "100-500"}   onChange={() => setAmountRange("100-500")} />
            <RadioOption label="$500+"        checked={pending.amountRange === "500-plus"}  onChange={() => setAmountRange("500-plus")} />
            <RadioOption label="Custom Range" checked={pending.amountRange === "custom"}    onChange={() => setAmountRange("custom")} />
          </div>
          {pending.amountRange === "custom" && (
            <CustomRange
              type="number"
              placeholder="0.00"
              from={pending.amountFrom}
              to={pending.amountTo}
              onFrom={(v) => setPending((p) => ({ ...p, amountFrom: v }))}
              onTo={(v) => setPending((p) => ({ ...p, amountTo: v }))}
            />
          )}
        </CollapsibleSection>

        {/* DATE CREATED */}
        <CollapsibleSection
          title="Date Created"
          count={pending.dateCreated ? 1 : 0}
          defaultExpanded={!!pending.dateCreated}
        >
          <div className="space-y-1.5">
            <RadioOption label="Today"        checked={pending.dateCreated === "today"}      onChange={() => setDateCreated("today")} />
            <RadioOption label="Last 7 Days"  checked={pending.dateCreated === "7d"}         onChange={() => setDateCreated("7d")} />
            <RadioOption label="Last 30 Days" checked={pending.dateCreated === "30d"}        onChange={() => setDateCreated("30d")} />
            <RadioOption label="This Month"   checked={pending.dateCreated === "this-month"} onChange={() => setDateCreated("this-month")} />
            <RadioOption label="Custom Range" checked={pending.dateCreated === "custom"}     onChange={() => setDateCreated("custom")} />
          </div>
          {pending.dateCreated === "custom" && (
            <CustomRange
              from={pending.dateCreatedFrom}
              to={pending.dateCreatedTo}
              onFrom={(v) => setPending((p) => ({ ...p, dateCreatedFrom: v }))}
              onTo={(v) => setPending((p) => ({ ...p, dateCreatedTo: v }))}
            />
          )}
        </CollapsibleSection>

        {/* DUE DATE */}
        <CollapsibleSection
          title="Due Date"
          count={pending.dueDateRange ? 1 : 0}
          defaultExpanded={!!pending.dueDateRange}
        >
          <div className="space-y-1.5">
            <RadioOption label="Due Today"     checked={pending.dueDateRange === "due-today"}     onChange={() => setDueDateRange("due-today")} />
            <RadioOption label="Due This Week" checked={pending.dueDateRange === "due-this-week"} onChange={() => setDueDateRange("due-this-week")} />
            <RadioOption label="Due Next 7 Days" checked={pending.dueDateRange === "due-next-7"} onChange={() => setDueDateRange("due-next-7")} />
            <RadioOption label="Overdue"       checked={pending.dueDateRange === "overdue"}       onChange={() => setDueDateRange("overdue")} />
            <RadioOption label="Custom Range"  checked={pending.dueDateRange === "custom"}        onChange={() => setDueDateRange("custom")} />
          </div>
          {pending.dueDateRange === "custom" && (
            <CustomRange
              from={pending.dueDateFrom}
              to={pending.dueDateTo}
              onFrom={(v) => setPending((p) => ({ ...p, dueDateFrom: v }))}
              onTo={(v) => setPending((p) => ({ ...p, dueDateTo: v }))}
            />
          )}
        </CollapsibleSection>

        {/* MERGE STATUS */}
        <CollapsibleSection
          title="Merge Status"
          count={pending.mergeStatus ? 1 : 0}
          defaultExpanded={!!pending.mergeStatus}
        >
          <div className="space-y-1.5">
            <RadioOption label="Standalone"        checked={pending.mergeStatus === "standalone"}        onChange={() => setMergeStatus("standalone")} />
            <RadioOption label="Combined Invoice"  checked={pending.mergeStatus === "combined-invoice"}  onChange={() => setMergeStatus("combined-invoice")} />
            <RadioOption label="Included In Merge" checked={pending.mergeStatus === "included-in-merge"} onChange={() => setMergeStatus("included-in-merge")} />
          </div>
        </CollapsibleSection>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
        <button onClick={handleClear}
          className="flex-1 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
          Clear Filters
        </button>
        <button onClick={handleApply}
          className="flex-1 py-1.5 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
          Apply Filters
        </button>
      </div>
    </div>
  )
}
