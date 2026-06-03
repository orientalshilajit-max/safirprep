"use client"

import { useState, useMemo } from "react"
import {
  Search, Download, Eye, FileText, CheckCircle,
  AlertTriangle, Clock, DollarSign, ChevronLeft,
  ChevronRight, ChevronDown, Merge, AlertCircle,
} from "lucide-react"
import {
  useRole, useInvoices, useAuthUser, useIsMockMode, useCompanyBranding,
} from "@/components/layout/app-shell"
import { updateInvoice, listInvoices, updateInvoiceStatus, combineInvoices } from "@/app/invoices/actions"
import { DataTable } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { IconButton } from "@/components/ui/icon-button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatCard } from "@/components/ui/stat-card"
import { InvoiceModal } from "@/components/invoices/invoice-modal"
import type { Invoice, InvoiceStatus, DataTableColumn } from "@/lib/types"

const PAGE_SIZE = 8

const QUICK_STATUSES: InvoiceStatus[] = ["Unpaid", "Paid", "Overdue", "Void"]

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

function invoiceTotal(inv: Invoice) {
  return inv.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
}

function canCombine(inv: Invoice) {
  return !["Paid", "Void", "Combined"].includes(inv.status)
}

export default function InvoicesPage() {
  const { role }   = useRole()
  const authUser   = useAuthUser()
  const isMockMode = useIsMockMode()
  const { invoices, setInvoices } = useInvoices()
  const branding   = useCompanyBranding()

  const [search,         setSearch]         = useState("")
  const [statusFilter,   setStatusFilter]   = useState<InvoiceStatus | "all">("all")
  const [page,           setPage]           = useState(1)
  const [viewing,        setViewing]        = useState<Invoice | null>(null)
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set())
  const [statusDropdown, setStatusDropdown] = useState<{ id: string; top: number; left: number } | null>(null)
  const [actionMsg,      setActionMsg]      = useState<{ text: string; isError: boolean } | null>(null)
  const [combining,      setCombining]      = useState(false)

  function flash(text: string, isError = false) {
    setActionMsg({ text, isError })
    if (!isError) setTimeout(() => setActionMsg(null), 3500)
  }

  /* ── Visible by role ── */
  const visible = useMemo(() => {
    if (role === "admin") return invoices
    if (!isMockMode) return invoices
    const myId = authUser?.clientId ?? "c1"
    return invoices.filter((inv) => inv.clientId === myId)
  }, [invoices, role, isMockMode, authUser])

  /* ── Stats ── */
  const stats = useMemo(() => {
    const unpaid  = visible.filter((i) => i.status === "Unpaid").length
    const paid    = visible.filter((i) => i.status === "Paid").length
    const overdue = visible.filter((i) => i.status === "Overdue").length
    const revenue = visible.filter((i) => i.status === "Paid").reduce((s, i) => s + invoiceTotal(i), 0)
    const total   = visible.length
    return { unpaid, paid, overdue, revenue, total }
  }, [visible])

  /* ── Filter + paginate ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return visible.filter((inv) => {
      const matchSearch =
        !q ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        (inv.relatedRequestNumber?.toLowerCase().includes(q) ?? false)
      const matchStatus = statusFilter === "all" || inv.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [visible, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* ── Save (from modal edit) ── */
  async function handleSave(updated: Invoice) {
    if (isMockMode) {
      setInvoices((prev) => prev.map((inv) => inv.id === updated.id ? updated : inv))
      setViewing(updated)
      return
    }
    const saved = await updateInvoice(updated.id, {
      status: updated.status, dueDate: updated.dueDate,
      notes: updated.notes, lineItems: updated.lineItems,
    })
    const fresh = await listInvoices().catch(() => null)
    if (fresh) setInvoices(fresh)
    else setInvoices((prev) => prev.map((inv) => inv.id === saved.id ? saved : inv))
    setViewing(saved)
  }

  /* ── Inline status change ── */
  function handleStatusBadgeClick(e: React.MouseEvent, inv: Invoice) {
    e.stopPropagation()
    if (statusDropdown?.id === inv.id) { setStatusDropdown(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setStatusDropdown({ id: inv.id, top: rect.bottom + 4, left: rect.left })
  }

  async function handleStatusSelect(newStatus: InvoiceStatus) {
    const inv = statusDropdown ? invoices.find((i) => i.id === statusDropdown.id) : null
    setStatusDropdown(null)
    if (!inv || newStatus === inv.status) return

    if (isMockMode) {
      setInvoices((prev) => prev.map((i) => i.id === inv.id ? { ...i, status: newStatus } : i))
      flash(`${inv.invoiceNumber} → ${newStatus}`)
      return
    }
    try {
      await updateInvoiceStatus(inv.id, newStatus)
      const fresh = await listInvoices()
      setInvoices(fresh)
      flash(`${inv.invoiceNumber} → ${newStatus}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to update status.", true)
    }
  }

  /* ── Combine ── */
  async function handleCombine() {
    const ids = [...selectedIds]
    if (ids.length < 2) { flash("Select at least 2 invoices to combine.", true); return }
    setCombining(true)
    setActionMsg(null)
    try {
      await combineInvoices(ids)
      const fresh = await listInvoices()
      setInvoices(fresh)
      setSelectedIds(new Set())
      flash("Invoices combined successfully into a new invoice.")
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to combine invoices.", true)
    } finally {
      setCombining(false)
    }
  }

  function toggleSelect(id: string, inv: Invoice) {
    if (!canCombine(inv)) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleStatClick(status: InvoiceStatus) {
    setStatusFilter((prev) => (prev === status ? "all" : status))
    setPage(1)
  }

  const companyInfo = {
    name:                branding.companyName,
    logoUrl:             branding.companyLogoUrl,
    invoiceLogoUrl:      branding.companyInvoiceLogoUrl,
    address:             branding.companyAddress,
    email:               branding.companyEmail,
    phone:               branding.companyPhone,
    website:             branding.companyWebsite,
    paymentInstructions: branding.companyPaymentInstructions,
  }

  /* ── Columns ── */
  const checkboxCol: DataTableColumn<Invoice> = {
    id: "select",
    header: "",
    headerClassName: "w-10 pl-4 pr-1",
    className: "w-10 pl-4 pr-1",
    cell: (row) => {
      if (!canCombine(row)) return <span className="inline-block w-4" />
      return (
        <input
          type="checkbox"
          checked={selectedIds.has(row.id)}
          onChange={() => toggleSelect(row.id, row)}
          onClick={(e) => e.stopPropagation()}
          className="accent-blue-600 size-3.5 cursor-pointer"
        />
      )
    },
  }

  const baseColumns: DataTableColumn<Invoice>[] = [
    {
      id: "number",
      header: "Invoice #",
      cell: (row) => (
        <button onClick={() => setViewing(row)}
          className="font-mono text-[12px] font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors">
          {row.invoiceNumber}
          {row.combinedIntoInvoiceId && (
            <span className="ml-1.5 text-[10px] font-normal text-violet-500 normal-case">(merged)</span>
          )}
        </button>
      ),
    },
    {
      id: "date",
      header: "Date",
      cell: (row) => <span className="text-[12px] text-gray-500">{row.date}</span>,
    },
    {
      id: "amount",
      header: "Amount",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <span className="text-[13px] font-semibold text-gray-800 tabular-nums">{fmt(invoiceTotal(row))}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => {
        if (role !== "admin") return <StatusBadge status={row.status} />
        return (
          <button type="button" onClick={(e) => handleStatusBadgeClick(e, row)}
            className="inline-flex items-center gap-1 rounded-full hover:ring-2 hover:ring-blue-300 focus:outline-none transition-all"
            title="Change status">
            <StatusBadge status={row.status} />
            <ChevronDown className="size-3 text-gray-400 shrink-0" />
          </button>
        )
      },
    },
    {
      id: "dueDate",
      header: "Due Date",
      cell: (row) => (
        <span className={`text-[12px] ${row.status === "Overdue" ? "text-red-600 font-semibold" : "text-gray-500"}`}>
          {row.dueDate}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Action",
      headerClassName: "text-right w-20",
      className: "text-right w-20",
      cell: (row) => (
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton variant="primary" title="View Invoice" onClick={() => setViewing(row)}>
            <Eye className="size-3.5" />
          </IconButton>
          <IconButton variant="default" title="Download PDF" onClick={() => {}}>
            <Download className="size-3.5" />
          </IconButton>
        </div>
      ),
    },
  ]

  const adminClientCol: DataTableColumn<Invoice> = {
    id: "client",
    header: "Client",
    cell: (row) => (
      <span className="text-[12px] text-gray-500 max-w-[130px] truncate block">{row.clientName}</span>
    ),
  }

  const columns: DataTableColumn<Invoice>[] =
    role === "admin"
      ? [checkboxCol, baseColumns[0], adminClientCol, ...baseColumns.slice(1)]
      : baseColumns

  /* ── Render ── */
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900 leading-tight">Invoices</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {role === "admin" ? "Manage and track all client billing" : "View and download your invoices"}
          </p>
        </div>
        {role === "admin" && selectedIds.size >= 2 && (
          <button onClick={handleCombine} disabled={combining}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-60 shrink-0">
            <Merge className="size-4" />
            {combining ? "Combining…" : `Combine ${selectedIds.size} Invoices`}
          </button>
        )}
      </div>

      {/* Flash message */}
      {actionMsg && (
        <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 ${
          actionMsg.isError ? "border-red-100 bg-red-50" : "border-green-100 bg-green-50"}`}>
          <AlertCircle className={`size-4 mt-0.5 shrink-0 ${actionMsg.isError ? "text-red-500" : "text-green-600"}`} />
          <p className={`text-[13px] ${actionMsg.isError ? "text-red-600" : "text-green-700"}`}>{actionMsg.text}</p>
          <button onClick={() => setActionMsg(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-[12px]">✕</button>
        </div>
      )}

      {/* Stat cards */}
      {role === "admin" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Open Invoices" value={stats.unpaid} icon={FileText}
            iconClass="bg-blue-50 text-blue-600" active={statusFilter === "Unpaid"} onClick={() => handleStatClick("Unpaid")} />
          <StatCard label="Paid Invoices" value={stats.paid} icon={CheckCircle}
            iconClass="bg-green-50 text-green-600" active={statusFilter === "Paid"} onClick={() => handleStatClick("Paid")} />
          <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle}
            iconClass="bg-red-50 text-red-500" active={statusFilter === "Overdue"} onClick={() => handleStatClick("Overdue")} />
          <StatCard label="Revenue" value={stats.revenue}
            valueDisplay={stats.revenue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
            sublabel="from paid invoices" icon={DollarSign} iconClass="bg-emerald-50 text-emerald-600" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Unpaid" value={stats.unpaid} icon={Clock}
            iconClass="bg-orange-50 text-orange-500" active={statusFilter === "Unpaid"} onClick={() => handleStatClick("Unpaid")} />
          <StatCard label="Paid" value={stats.paid} icon={CheckCircle}
            iconClass="bg-green-50 text-green-600" active={statusFilter === "Paid"} onClick={() => handleStatClick("Paid")} />
          <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle}
            iconClass="bg-red-50 text-red-500" active={statusFilter === "Overdue"} onClick={() => handleStatClick("Overdue")} />
          <StatCard label="Total Invoices" value={stats.total} icon={FileText}
            iconClass="bg-blue-50 text-blue-600" onClick={() => { setStatusFilter("all"); setPage(1) }}
            active={statusFilter === "all" && search === ""} />
        </div>
      )}

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400 pointer-events-none" />
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search invoice, client…"
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 bg-gray-50" />
          </div>
          <select value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as InvoiceStatus | "all"); setPage(1) }}
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600">
            <option value="all">All Statuses</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
            <option value="Void">Void</option>
            <option value="Combined">Combined</option>
          </select>
          {role === "admin" && selectedIds.size > 0 && (
            <span className="text-[12px] text-gray-500">{selectedIds.size} selected</span>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <DataTable
            columns={columns}
            data={paginated}
            keyExtractor={(inv) => inv.id}
            mobileCard={(inv) => (
              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {role === "admin" && canCombine(inv) && (
                      <input type="checkbox" checked={selectedIds.has(inv.id)}
                        onChange={() => toggleSelect(inv.id, inv)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-blue-600 size-3.5 cursor-pointer mt-0.5" />
                    )}
                    <button onClick={() => setViewing(inv)}
                      className="font-mono text-[12px] font-semibold text-blue-600 hover:underline">
                      {inv.invoiceNumber}
                    </button>
                  </div>
                  {role === "admin" ? (
                    <button type="button" onClick={(e) => handleStatusBadgeClick(e, inv)}
                      className="inline-flex items-center gap-1 rounded-full hover:ring-2 hover:ring-blue-300 shrink-0">
                      <StatusBadge status={inv.status} />
                      <ChevronDown className="size-3 text-gray-400" />
                    </button>
                  ) : (
                    <StatusBadge status={inv.status} />
                  )}
                </div>
                {role === "admin" && <p className="text-[12px] text-gray-500 mt-0.5">{inv.clientName}</p>}
                <div className="flex items-center justify-between mt-1">
                  <div className="text-[11px] text-gray-400">
                    <span>{inv.date}</span>
                    {inv.dueDate && (
                      <span className={`ml-2 ${inv.status === "Overdue" ? "text-red-600 font-semibold" : ""}`}>Due: {inv.dueDate}</span>
                    )}
                  </div>
                  <span className="text-[14px] font-bold text-gray-900">{fmt(invoiceTotal(inv))}</span>
                </div>
                <div className="flex justify-end gap-0.5 mt-2">
                  <IconButton variant="primary" title="View Invoice" onClick={() => setViewing(inv)}>
                    <Eye className="size-3.5" />
                  </IconButton>
                  <IconButton variant="default" title="Download PDF" onClick={() => {}}>
                    <Download className="size-3.5" />
                  </IconButton>
                </div>
              </div>
            )}
            emptyState={
              <EmptyState title="No invoices found"
                description={search || statusFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "No invoices have been issued yet."} />
            }
          />
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50 shrink-0">
          <p className="text-[12px] text-gray-500">
            Showing{" "}
            <span className="font-medium text-gray-700">{filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}</span>
            {" "}to{" "}
            <span className="font-medium text-gray-700">{Math.min(safePage * PAGE_SIZE, filtered.length)}</span>
            {" "}of{" "}
            <span className="font-medium text-gray-700">{filtered.length}</span> invoices
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
              className="flex size-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="size-3.5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
              .reduce<(number | "…")[]>((acc, n, i, arr) => {
                if (i > 0 && (arr[i - 1] as number) !== n - 1) acc.push("…")
                acc.push(n)
                return acc
              }, [])
              .map((n, i) =>
                n === "…" ? (
                  <span key={`e${i}`} className="px-1 text-[12px] text-gray-400">…</span>
                ) : (
                  <button key={n} onClick={() => setPage(n as number)}
                    className={`flex size-7 items-center justify-center rounded-md text-[12px] font-medium transition-colors ${
                      safePage === n ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
                    {n}
                  </button>
                )
              )}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="flex size-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Invoice detail / edit modal */}
      <InvoiceModal
        invoice={viewing}
        role={role}
        onClose={() => setViewing(null)}
        onSave={handleSave}
        companyInfo={companyInfo}
      />

      {/* Status dropdown — fixed positioned */}
      {statusDropdown && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setStatusDropdown(null)} />
          <div className="fixed z-40 bg-white rounded-lg border border-gray-200 shadow-lg py-1 min-w-[160px]"
            style={{ top: statusDropdown.top, left: statusDropdown.left }}>
            {QUICK_STATUSES.map((s) => {
              const inv = invoices.find((i) => i.id === statusDropdown.id)
              const isCurrent = inv?.status === s
              return (
                <button key={s} type="button" onClick={() => handleStatusSelect(s)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-gray-50 transition-colors ${
                    isCurrent ? "text-blue-600 font-semibold" : "text-gray-700"}`}>
                  <span className={`size-1.5 rounded-full shrink-0 ${isCurrent ? "bg-blue-600" : ""}`} />
                  {s}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
