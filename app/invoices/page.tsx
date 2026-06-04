"use client"

import { useState, useMemo, useRef } from "react"
import {
  Search, Download, Eye, FileText, CheckCircle,
  AlertTriangle, Clock, DollarSign, ChevronLeft,
  ChevronRight, ChevronDown, Merge, AlertCircle,
  SlidersHorizontal, CheckSquare, XSquare, Bell,
  Trash2, X,
} from "lucide-react"
import {
  useRole, useInvoices, useAuthUser, useIsMockMode, useCompanyBranding,
} from "@/components/layout/app-shell"
import {
  updateInvoice, listInvoices, updateInvoiceStatus,
  combineInvoices, bulkUpdateInvoiceStatus, deleteInvoices,
} from "@/app/invoices/actions"
import { DataTable } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { IconButton } from "@/components/ui/icon-button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatCard } from "@/components/ui/stat-card"
import { InvoiceModal } from "@/components/invoices/invoice-modal"
import {
  InvoiceFilterPanel,
  DEFAULT_INVOICE_FILTERS,
  countActiveInvoiceFilters,
} from "@/components/invoices/invoice-filter-panel"
import type { InvoiceFilters } from "@/components/invoices/invoice-filter-panel"
import type { Invoice, InvoiceStatus, DataTableColumn } from "@/lib/types"

const PAGE_SIZE = 8

const QUICK_STATUSES: InvoiceStatus[] = ["Unpaid", "Paid", "Overdue", "Void"]

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

function invoiceTotal(inv: Invoice) {
  return inv.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
}

// An invoice can participate in a merge only when it is not already paid/void/merged.
function canMerge(inv: Invoice) {
  return !["Paid", "Void", "Combined"].includes(inv.status) && !inv.combinedIntoInvoiceId
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
  const [merging,        setMerging]        = useState(false)
  const [bulkWorking,    setBulkWorking]    = useState(false)
  const [downloadingId,  setDownloadingId]  = useState<string | null>(null)
  const [activeFilters,  setActiveFilters]  = useState<InvoiceFilters>(DEFAULT_INVOICE_FILTERS)
  const [filterOpen,     setFilterOpen]     = useState(false)
  const filterBtnRef = useRef<HTMLButtonElement>(null)

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

  /* ── Available clients for filter panel ── */
  const availableClients = useMemo(() => {
    if (role !== "admin") return []
    const map = new Map<string, string>()
    for (const inv of visible) {
      if (inv.clientId && inv.clientName && !map.has(inv.clientId))
        map.set(inv.clientId, inv.clientName)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [visible, role])

  /* ── Pre-compute which invoice IDs are targets of a merge ── */
  const mergedIntoIds = useMemo(() => {
    const s = new Set<string>()
    for (const inv of visible) {
      if (inv.combinedIntoInvoiceId) s.add(inv.combinedIntoInvoiceId)
    }
    return s
  }, [visible])

  /* ── Stats — exclude merged source invoices so only the combined parent counts ── */
  const stats = useMemo(() => {
    const base    = visible.filter((i) => !i.combinedIntoInvoiceId)
    const unpaid  = base.filter((i) => i.status === "Unpaid").length
    const paid    = base.filter((i) => i.status === "Paid").length
    const overdue = base.filter((i) => i.status === "Overdue").length
    const revenue = base.filter((i) => i.status === "Paid").reduce((s, i) => s + invoiceTotal(i), 0)
    const total   = base.length
    return { unpaid, paid, overdue, revenue, total }
  }, [visible])

  /* ── Filter + paginate ── */
  const filtered = useMemo(() => {
    const q    = search.toLowerCase().trim()
    const now  = new Date().getTime()
    const tod  = new Date(); tod.setHours(0, 0, 0, 0)
    const todMs      = tod.getTime()
    const todEndMs   = todMs + 86_400_000 - 1
    const weekEndMs  = todMs + 7 * 86_400_000
    const monthStart = new Date(tod.getFullYear(), tod.getMonth(), 1).getTime()

    return visible.filter((inv) => {
      // Search
      if (q) {
        const hit =
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.clientName.toLowerCase().includes(q) ||
          (inv.relatedRequestNumber?.toLowerCase().includes(q) ?? false)
        if (!hit) return false
      }

      // Status dropdown
      if (statusFilter !== "all" && inv.status !== statusFilter) return false

      // ── Advanced filters ──────────────────────────────────────

      // Client (admin only)
      if (activeFilters.clientIds.length > 0 && !activeFilters.clientIds.includes(inv.clientId)) return false

      // Status (multi-select, OR within the selection)
      if (activeFilters.statuses.length > 0 && !activeFilters.statuses.includes(inv.status)) return false

      // Amount
      const amt = invoiceTotal(inv)
      if (activeFilters.amountRange === "under-50"  && !(amt < 50))                   return false
      if (activeFilters.amountRange === "50-100"    && !(amt >= 50  && amt < 100))     return false
      if (activeFilters.amountRange === "100-500"   && !(amt >= 100 && amt < 500))     return false
      if (activeFilters.amountRange === "500-plus"  && !(amt >= 500))                  return false
      if (activeFilters.amountRange === "custom") {
        const lo = parseFloat(activeFilters.amountFrom)
        const hi = parseFloat(activeFilters.amountTo)
        if (!isNaN(lo) && amt < lo) return false
        if (!isNaN(hi) && amt > hi) return false
      }

      // Date created
      if (activeFilters.dateCreated && inv.createdAt) {
        const t = new Date(inv.createdAt).getTime()
        if (activeFilters.dateCreated === "today"      && t < todMs)             return false
        if (activeFilters.dateCreated === "7d"         && t < now - 7  * 86_400_000) return false
        if (activeFilters.dateCreated === "30d"        && t < now - 30 * 86_400_000) return false
        if (activeFilters.dateCreated === "this-month" && t < monthStart)        return false
        if (activeFilters.dateCreated === "custom") {
          if (activeFilters.dateCreatedFrom && t < new Date(activeFilters.dateCreatedFrom).getTime()) return false
          if (activeFilters.dateCreatedTo   && t > new Date(activeFilters.dateCreatedTo + "T23:59:59").getTime()) return false
        }
      }

      // Due date
      if (activeFilters.dueDateRange && inv.dueDate) {
        const due = new Date(inv.dueDate).getTime()
        if (activeFilters.dueDateRange === "due-today"     && !(due >= todMs && due <= todEndMs)) return false
        if (activeFilters.dueDateRange === "due-this-week" && !(due >= todMs && due < weekEndMs)) return false
        if (activeFilters.dueDateRange === "due-next-7"    && !(due > todEndMs && due <= weekEndMs)) return false
        if (activeFilters.dueDateRange === "overdue"       &&
            !(due < todMs && !["Paid", "Void", "Combined"].includes(inv.status))) return false
        if (activeFilters.dueDateRange === "custom") {
          if (activeFilters.dueDateFrom && due < new Date(activeFilters.dueDateFrom).getTime()) return false
          if (activeFilters.dueDateTo   && due > new Date(activeFilters.dueDateTo + "T23:59:59").getTime()) return false
        }
      }

      // Merge status
      // Default ("") hides merged source invoices — they are kept in the DB but not shown.
      // "all" explicitly reveals them. Specific options filter to that subset only.
      const isIncluded        = !!inv.combinedIntoInvoiceId
      const isCombinedInvoice = mergedIntoIds.has(inv.id)
      const isStandalone      = !isIncluded && !isCombinedInvoice && inv.status !== "Combined"

      if (!activeFilters.mergeStatus) {
        // Default: hide source invoices that were merged into another
        if (isIncluded) return false
      } else if (activeFilters.mergeStatus === "standalone") {
        if (!isStandalone) return false
      } else if (activeFilters.mergeStatus === "combined-invoice") {
        if (!isCombinedInvoice) return false
      } else if (activeFilters.mergeStatus === "included-in-merge") {
        if (!isIncluded) return false
      }
      // "all": no additional restriction — show everything

      return true
    })
  }, [visible, search, statusFilter, activeFilters, mergedIntoIds])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const activeFilterCount = countActiveInvoiceFilters(activeFilters)
  const hasAnyFilter = !!search || statusFilter !== "all" || activeFilterCount > 0

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

  /* ── Merge selected ── */
  async function handleMergeSelected() {
    const ids      = [...selectedIds]
    const selected = visible.filter((inv) => ids.includes(inv.id))

    if (ids.length < 2) { flash("Select at least 2 invoices to merge.", true); return }

    // Same-client check
    const clientIds = new Set(selected.map((inv) => inv.clientId))
    if (clientIds.size > 1) {
      flash("Cannot merge invoices. Selected invoices belong to different clients.", true)
      return
    }

    // Status check
    const blocked = selected.filter((inv) => !canMerge(inv))
    if (blocked.length > 0) {
      flash(
        `Cannot merge: ${blocked.map((i) => i.invoiceNumber).join(", ")} ` +
        `(${blocked[0].status} invoices cannot be merged).`,
        true,
      )
      return
    }

    setMerging(true)
    setActionMsg(null)
    try {
      await combineInvoices(ids)
      const fresh = await listInvoices()
      setInvoices(fresh)
      setSelectedIds(new Set())
      flash(`${ids.length} invoices merged successfully.`)
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to merge invoices.", true)
    } finally {
      setMerging(false)
    }
  }

  /* ── Bulk: Mark Paid ── */
  async function handleBulkMarkPaid() {
    const ids = [...selectedIds]
    if (isMockMode) {
      setInvoices((prev) => prev.map((inv) => ids.includes(inv.id) ? { ...inv, status: "Paid" as InvoiceStatus } : inv))
      flash(`${ids.length} invoice(s) marked as Paid.`)
      setSelectedIds(new Set())
      return
    }
    setBulkWorking(true)
    try {
      await bulkUpdateInvoiceStatus(ids, "Paid")
      setInvoices(await listInvoices())
      setSelectedIds(new Set())
      flash(`${ids.length} invoice(s) marked as Paid.`)
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to update invoices.", true)
    } finally {
      setBulkWorking(false)
    }
  }

  /* ── Bulk: Mark Unpaid ── */
  async function handleBulkMarkUnpaid() {
    const ids = [...selectedIds]
    if (isMockMode) {
      setInvoices((prev) => prev.map((inv) => ids.includes(inv.id) ? { ...inv, status: "Unpaid" as InvoiceStatus } : inv))
      flash(`${ids.length} invoice(s) marked as Unpaid.`)
      setSelectedIds(new Set())
      return
    }
    setBulkWorking(true)
    try {
      await bulkUpdateInvoiceStatus(ids, "Unpaid")
      setInvoices(await listInvoices())
      setSelectedIds(new Set())
      flash(`${ids.length} invoice(s) marked as Unpaid.`)
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to update invoices.", true)
    } finally {
      setBulkWorking(false)
    }
  }

  /* ── Bulk: Send Reminder (queued — no email service wired) ── */
  function handleSendReminder() {
    flash(`Reminder queued for ${selectedIds.size} invoice(s).`)
    setSelectedIds(new Set())
  }

  /* ── Bulk: Download PDFs ── */
  async function handleBulkDownload() {
    const toDownload = visible.filter((inv) => selectedIds.has(inv.id))
    let errors = 0
    for (const inv of toDownload) {
      try {
        const res = await fetch(`/api/invoices/${inv.id}/pdf`)
        if (!res.ok) { errors++; continue }
        const blob = await res.blob()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement("a")
        a.href     = url
        a.download = `invoice-${inv.invoiceNumber}.pdf`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        await new Promise((r) => setTimeout(r, 400))
      } catch { errors++ }
    }
    if (errors > 0) flash(`Downloaded ${toDownload.length - errors} of ${toDownload.length}. ${errors} failed.`, true)
    else flash(`Downloaded ${toDownload.length} PDF(s).`)
  }

  /* ── Bulk: Delete ── */
  async function handleBulkDelete() {
    const count = selectedIds.size
    if (!window.confirm(`Delete ${count} invoice(s)? Paid invoices will be skipped. This cannot be undone.`)) return
    const ids = [...selectedIds]

    if (isMockMode) {
      setInvoices((prev) => prev.filter((inv) => !ids.includes(inv.id) || inv.status === "Paid"))
      flash(`Invoice(s) deleted.`)
      setSelectedIds(new Set())
      return
    }
    setBulkWorking(true)
    try {
      const { deleted, skipped } = await deleteInvoices(ids)
      setInvoices(await listInvoices())
      setSelectedIds(new Set())
      if (skipped.length > 0) flash(`Deleted ${deleted}. Skipped paid: ${skipped.join(", ")}.`, true)
      else flash(`Deleted ${deleted} invoice(s).`)
    } catch (err) {
      flash(err instanceof Error ? err.message : "Failed to delete invoices.", true)
    } finally {
      setBulkWorking(false)
    }
  }

  function toggleSelect(id: string) {
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

  async function handleDownloadPdf(inv: Invoice) {
    if (downloadingId) return
    setDownloadingId(inv.id)
    try {
      const res = await fetch(`/api/invoices/${inv.id}/pdf`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        if (res.status === 403) throw new Error("You do not have access to this invoice.")
        throw new Error(json.error ?? "Unable to download invoice.")
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `invoice-${inv.invoiceNumber}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      flash(err instanceof Error ? err.message : "Unable to download invoice.", true)
    } finally {
      setDownloadingId(null)
    }
  }

  /* ── Columns ── */
  const checkboxCol: DataTableColumn<Invoice> = {
    id: "select",
    header: "",
    headerClassName: "w-10 pl-4 pr-1",
    className: "w-10 pl-4 pr-1",
    cell: (row) => (
      <input
        type="checkbox"
        checked={selectedIds.has(row.id)}
        onChange={() => toggleSelect(row.id)}
        onClick={(e) => e.stopPropagation()}
        className="accent-blue-600 size-3.5 cursor-pointer"
      />
    ),
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
          <IconButton variant="default" title="Download PDF"
            disabled={downloadingId === row.id}
            onClick={(e) => { e.stopPropagation(); void handleDownloadPdf(row) }}>
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

  const isBulkBusy = merging || bulkWorking

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
      </div>

      {/* Flash message */}
      {actionMsg && (
        <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 ${
          actionMsg.isError ? "border-red-100 bg-red-50" : "border-green-100 bg-green-50"}`}>
          <AlertCircle className={`size-4 mt-0.5 shrink-0 ${actionMsg.isError ? "text-red-500" : "text-green-600"}`} />
          <p className={`text-[13px] flex-1 ${actionMsg.isError ? "text-red-600" : "text-green-700"}`}>{actionMsg.text}</p>
          <button onClick={() => setActionMsg(null)} className="ml-auto text-gray-400 hover:text-gray-600">
            <X className="size-3.5" />
          </button>
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
          <button
            ref={filterBtnRef}
            onClick={() => setFilterOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border rounded-lg transition-colors ${
              filterOpen || activeFilterCount > 0
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal className="size-3.5" />
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
          </button>
        </div>

        {/* Bulk action bar */}
        {role === "admin" && selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 bg-blue-50 border-b border-blue-100">
            <span className="text-[12px] font-semibold text-blue-700 mr-1">
              {selectedIds.size} selected
            </span>
            <div className="h-3.5 w-px bg-blue-200 mx-0.5" />
            <button onClick={handleMergeSelected} disabled={isBulkBusy}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-violet-700 bg-violet-100 hover:bg-violet-200 rounded-md transition-colors disabled:opacity-50">
              <Merge className="size-3" />
              {merging ? "Merging…" : "Merge"}
            </button>
            <button onClick={handleBulkMarkPaid} disabled={isBulkBusy}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-green-700 bg-green-100 hover:bg-green-200 rounded-md transition-colors disabled:opacity-50">
              <CheckSquare className="size-3" />
              Mark Paid
            </button>
            <button onClick={handleBulkMarkUnpaid} disabled={isBulkBusy}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors disabled:opacity-50">
              <XSquare className="size-3" />
              Mark Unpaid
            </button>
            <button onClick={handleSendReminder} disabled={isBulkBusy}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors disabled:opacity-50">
              <Bell className="size-3" />
              Send Reminder
            </button>
            <button onClick={handleBulkDownload} disabled={isBulkBusy}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50">
              <Download className="size-3" />
              Download PDFs
            </button>
            <button onClick={handleBulkDelete} disabled={isBulkBusy}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors disabled:opacity-50">
              <Trash2 className="size-3" />
              Delete
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-gray-400 hover:text-gray-600 transition-colors" title="Clear selection">
              <X className="size-3.5" />
            </button>
          </div>
        )}

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
                    {role === "admin" && (
                      <input type="checkbox" checked={selectedIds.has(inv.id)}
                        onChange={() => toggleSelect(inv.id)}
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
                  <IconButton variant="default" title="Download PDF"
                    disabled={downloadingId === inv.id}
                    onClick={(e) => { e.stopPropagation(); void handleDownloadPdf(inv) }}>
                    <Download className="size-3.5" />
                  </IconButton>
                </div>
              </div>
            )}
            emptyState={
              <EmptyState title="No invoices found"
                description={hasAnyFilter
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

      {/* Filter panel */}
      {filterOpen && (
        <InvoiceFilterPanel
          onClose={() => setFilterOpen(false)}
          anchorRef={filterBtnRef}
          appliedFilters={activeFilters}
          onApply={(f) => { setActiveFilters(f); setPage(1) }}
          onClear={() => { setActiveFilters(DEFAULT_INVOICE_FILTERS); setPage(1) }}
          clients={availableClients}
          isAdmin={role === "admin"}
        />
      )}

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
