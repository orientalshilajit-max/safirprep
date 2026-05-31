"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Search, SlidersHorizontal, Plus, Pencil, Archive, Trash2,
  Truck, PackageCheck, PackageOpen, AlertTriangle, AlertCircle,
  ChevronLeft, ChevronRight, ChevronDown,
} from "lucide-react"
import { useRole, useShipments, useProducts, useIsMockMode } from "@/components/layout/app-shell"
import { DataTable } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { IconButton } from "@/components/ui/icon-button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatCard } from "@/components/ui/stat-card"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { ShipmentModal } from "@/components/shipments/shipment-modal"
import { ReceivingModal, type ReceivingResult } from "@/components/shipments/receiving-modal"
import {
  archiveShipment,
  softDeleteShipment,
  updateShipment,
} from "@/app/shipments/actions"
import { listProductClients } from "@/app/products/actions"
import { listProducts }       from "@/app/products/actions"
import type { Shipment, ShipmentStatus, DataTableColumn } from "@/lib/types"

const PAGE_SIZE = 8

const RECEIVED_STATUSES: ShipmentStatus[] = ["Received", "Partially Received"]
const ALL_STATUSES: ShipmentStatus[] = [
  "In Transit",
  "Arrived",
  "Received",
  "Partially Received",
  "Need Attention",
]

export default function ShipmentsPage() {
  const router     = useRouter()
  const { role }   = useRole()
  const isMockMode = useIsMockMode()
  const { shipments, setShipments } = useShipments()
  const { setProducts }             = useProducts()

  const [search,       setSearch]       = useState("")
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | "all">("all")
  const [page,         setPage]         = useState(1)
  const [createOpen,   setCreateOpen]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Shipment | null>(null)
  const [actionError,  setActionError]  = useState<string | null>(null)

  // Status dropdown (fixed-position, one open at a time)
  const [statusDropdown, setStatusDropdown] = useState<{
    id: string
    top: number
    left: number
  } | null>(null)

  // Receiving modal
  const [receivingTarget, setReceivingTarget] = useState<Shipment | null>(null)
  const [receivingMode,   setReceivingMode]   = useState<"received" | "partially_received">("received")
  const [receivingSaving, setReceivingSaving] = useState(false)
  const [receivingError,  setReceivingError]  = useState<string | null>(null)

  function flashError(msg: string) {
    setActionError(msg)
    setTimeout(() => setActionError(null), 4000)
  }

  // Client list for admin's Create Shipment selector (Supabase mode only)
  const [pageClients, setPageClients] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    if (!isMockMode && role === "admin") {
      listProductClients().then(setPageClients).catch(() => {})
    }
  }, [isMockMode, role])

  /* ── Stat card counts ────────────────────────────────── */
  const active = shipments.filter((s) => !s.isArchived)
  const counts = {
    "In Transit":     active.filter((s) => s.status === "In Transit").length,
    Arrived:          active.filter((s) => s.status === "Arrived").length,
    Received:         active.filter((s) => RECEIVED_STATUSES.includes(s.status)).length,
    "Need Attention": active.filter((s) => s.status === "Need Attention").length,
  }

  /* ── Filtered + paginated ────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return active.filter((s) => {
      const matchSearch =
        !q ||
        s.shipmentNumber.toLowerCase().includes(q) ||
        s.clientName.toLowerCase().includes(q) ||
        s.tracking.some((t) => t.trackingNumber.toLowerCase().includes(q))
      const matchStatus =
        statusFilter === "all" ||
        s.status === statusFilter ||
        (statusFilter === "Received" && RECEIVED_STATUSES.includes(s.status))
      return matchSearch && matchStatus
    })
  }, [active, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* ── Shipment list actions ───────────────────────────── */
  function handleCreate(shipment: Shipment) {
    setShipments((prev) => [shipment, ...prev])
    setProducts((prev) =>
      prev.map((p) => {
        const sp = shipment.products.find((x) => x.productId === p.id)
        return sp ? { ...p, incoming: p.incoming + sp.units } : p
      })
    )
    setCreateOpen(false)
  }

  async function handleArchive(id: string) {
    if (isMockMode) {
      setShipments((prev) => prev.map((s) => (s.id === id ? { ...s, isArchived: true } : s)))
      return
    }
    try {
      await archiveShipment(id)
      setShipments((prev) => prev.map((s) => (s.id === id ? { ...s, isArchived: true } : s)))
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Failed to archive shipment.")
    }
  }

  async function handleDelete(id: string) {
    if (isMockMode) {
      setShipments((prev) => prev.filter((s) => s.id !== id))
      return
    }
    try {
      await softDeleteShipment(id)
      setShipments((prev) => prev.filter((s) => s.id !== id))
      const deleted = shipments.find((s) => s.id === id)
      if (deleted && !deleted.isInventoryUpdated) {
        setProducts((prev) =>
          prev.map((p) => {
            const sp = deleted.products.find((x) => x.productId === p.id)
            return sp ? { ...p, incoming: Math.max(0, p.incoming - sp.units) } : p
          })
        )
      }
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Failed to delete shipment.")
    }
  }

  /* ── Status badge click / dropdown ──────────────────── */
  function handleStatusBadgeClick(e: React.MouseEvent, shipment: Shipment) {
    e.stopPropagation()
    if (statusDropdown?.id === shipment.id) {
      setStatusDropdown(null)
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setStatusDropdown({ id: shipment.id, top: rect.bottom + 4, left: rect.left })
  }

  function handleStatusSelect(newStatus: ShipmentStatus) {
    const shipment = statusDropdown ? shipments.find((s) => s.id === statusDropdown.id) : null
    setStatusDropdown(null)
    if (!shipment || newStatus === shipment.status) return

    if (RECEIVED_STATUSES.includes(newStatus) && !shipment.isInventoryUpdated) {
      setReceivingTarget(shipment)
      setReceivingMode(newStatus === "Received" ? "received" : "partially_received")
    } else if (!RECEIVED_STATUSES.includes(newStatus)) {
      handleQuickStatusChange(shipment, newStatus)
    }
  }

  async function handleQuickStatusChange(shipment: Shipment, newStatus: ShipmentStatus) {
    if (isMockMode) {
      setShipments((prev) => prev.map((s) => (s.id === shipment.id ? { ...s, status: newStatus } : s)))
      return
    }
    try {
      const updated = await updateShipment(shipment.id, {
        status:   newStatus,
        notes:    shipment.notes,
        products: shipment.products.map((sp) => ({
          productId:     sp.productId,
          units:         sp.units,
          receivedUnits: sp.receivedUnits,
          damagedUnits:  sp.damagedUnits,
          notes:         sp.notes,
        })),
        tracking: shipment.tracking.map((t) => ({
          carrier:        t.carrier,
          trackingNumber: t.trackingNumber,
          boxCount:       t.boxCount,
          notes:          t.notes,
        })),
      })
      setShipments((prev) => prev.map((s) => (s.id === shipment.id ? updated : s)))
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Failed to update status.")
    }
  }

  /* ── Receiving modal confirm ─────────────────────────── */
  async function handleReceivingConfirm(results: ReceivingResult[]) {
    if (!receivingTarget) return
    const newStatus: ShipmentStatus = receivingMode === "received" ? "Received" : "Partially Received"

    if (isMockMode) {
      const updated: Shipment = {
        ...receivingTarget,
        status: newStatus,
        isInventoryUpdated: true,
        products: receivingTarget.products.map((sp) => {
          const r = results.find((x) => x.productId === sp.productId)
          return r ? { ...sp, receivedUnits: r.received, damagedUnits: r.damaged } : sp
        }),
      }
      setShipments((prev) => prev.map((s) => (s.id === receivingTarget.id ? updated : s)))
      setProducts((prev) =>
        prev.map((p) => {
          const r = results.find((x) => x.productId === p.id)
          if (!r) return p
          const incomingDelta = newStatus === "Received" ? r.expected : r.received + r.damaged
          return {
            ...p,
            available: p.available + r.received,
            incoming:  Math.max(0, p.incoming - incomingDelta),
            damaged:   p.damaged + r.damaged,
          }
        })
      )
      setReceivingTarget(null)
      return
    }

    setReceivingSaving(true)
    setReceivingError(null)
    try {
      const updated = await updateShipment(receivingTarget.id, {
        status:   newStatus,
        notes:    receivingTarget.notes,
        products: receivingTarget.products.map((sp) => {
          const r = results.find((x) => x.productId === sp.productId)
          return {
            productId:     sp.productId,
            units:         sp.units,
            receivedUnits: r?.received ?? sp.receivedUnits,
            damagedUnits:  r?.damaged  ?? sp.damagedUnits,
            notes:         sp.notes,
          }
        }),
        tracking: receivingTarget.tracking.map((t) => ({
          carrier:        t.carrier,
          trackingNumber: t.trackingNumber,
          boxCount:       t.boxCount,
          notes:          t.notes,
        })),
      })

      setShipments((prev) => prev.map((s) => (s.id === receivingTarget.id ? updated : s)))

      // Re-fetch products so Available/Incoming/Damaged columns update immediately
      try {
        const fresh = await listProducts()
        setProducts(fresh)
      } catch {
        // Fallback: optimistic update with correct partial-receive delta
        setProducts((prev) =>
          prev.map((p) => {
            const r = results.find((x) => x.productId === p.id)
            if (!r) return p
            const incomingDelta = newStatus === "Received" ? r.expected : r.received + r.damaged
            return {
              ...p,
              available: p.available + r.received,
              incoming:  Math.max(0, p.incoming - incomingDelta),
              damaged:   p.damaged  + r.damaged,
            }
          })
        )
      }

      setReceivingTarget(null)
    } catch (err) {
      setReceivingError(err instanceof Error ? err.message : "Failed to record receiving.")
    } finally {
      setReceivingSaving(false)
    }
  }

  function handleStatClick(status: ShipmentStatus | "all") {
    setStatusFilter((prev) => (prev === status ? "all" : status))
    setPage(1)
  }

  /* ── Totals / helpers ────────────────────────────────── */
  function totalUnits(s: Shipment) {
    return s.products.reduce((sum, p) => sum + p.units, 0)
  }

  function primaryTracking(s: Shipment) {
    if (!s.tracking.length) return "—"
    const first = s.tracking[0]
    const extra = s.tracking.length - 1
    return extra > 0 ? `${first.trackingNumber} +${extra}` : first.trackingNumber
  }

  /* ── Columns ─────────────────────────────────────────── */
  const baseColumns: DataTableColumn<Shipment>[] = [
    {
      id: "number",
      header: "Shipment #",
      cell: (row) => (
        <span className="font-mono text-[12px] font-semibold text-gray-700">
          {row.shipmentNumber}
        </span>
      ),
    },
    {
      id: "products",
      header: "Products",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <span className="text-[13px] text-gray-700 tabular-nums">{row.products.length}</span>
      ),
    },
    {
      id: "units",
      header: "Units",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <span className="text-[13px] font-semibold text-gray-800 tabular-nums">
          {totalUnits(row).toLocaleString()}
        </span>
      ),
    },
    {
      id: "tracking",
      header: "Tracking #",
      cell: (row) => (
        <span className="font-mono text-[11px] text-gray-500 max-w-[160px] truncate block">
          {primaryTracking(row)}
        </span>
      ),
    },
    {
      id: "carrier",
      header: "Carrier",
      cell: (row) => (
        <span className="text-[12px] text-gray-600">{row.tracking[0]?.carrier ?? "—"}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => {
        // Non-admin or already-posted: static badge
        if (role !== "admin" || row.isInventoryUpdated) {
          return <StatusBadge status={row.status} />
        }
        // Admin on un-posted shipment: clickable badge with chevron
        return (
          <button
            type="button"
            onClick={(e) => handleStatusBadgeClick(e, row)}
            className="inline-flex items-center gap-1 rounded-full hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
            title="Change status"
          >
            <StatusBadge status={row.status} />
            <ChevronDown className="size-3 text-gray-400 shrink-0" />
          </button>
        )
      },
    },
    {
      id: "created",
      header: "Created",
      cell: (row) => (
        <span className="text-[12px] text-gray-500">{row.createdAt}</span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      headerClassName: "text-right w-20",
      className: "text-right w-20",
      cell: (row) => {
        const isReceived = RECEIVED_STATUSES.includes(row.status)
        return (
          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <IconButton
              variant="primary"
              onClick={() => router.push(`/shipments/${row.id}`)}
              title="Edit"
            >
              <Pencil className="size-3.5" />
            </IconButton>
            {isReceived ? (
              <IconButton
                variant="default"
                onClick={() => handleArchive(row.id)}
                title="Archive"
              >
                <Archive className="size-3.5" />
              </IconButton>
            ) : (
              <IconButton
                variant="danger"
                onClick={() => setDeleteTarget(row)}
                title="Delete"
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            )}
          </div>
        )
      },
    },
  ]

  const adminClientCol: DataTableColumn<Shipment> = {
    id: "client",
    header: "Client",
    cell: (row) => (
      <span className="text-[12px] text-gray-500">{row.clientName}</span>
    ),
  }

  const columns =
    role === "admin"
      ? [baseColumns[0], adminClientCol, ...baseColumns.slice(1)]
      : baseColumns

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900 leading-tight">
            Incoming Shipments
          </h1>
          <p className="text-[13px] text-gray-400 mt-0.5">Track your incoming shipments</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors shadow-sm"
        >
          <Plus className="size-4" />
          Create Shipment
        </button>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
          <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-[13px] text-red-600">{actionError}</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="In Transit"
          value={counts["In Transit"]}
          icon={Truck}
          iconClass="bg-blue-50 text-blue-600"
          active={statusFilter === "In Transit"}
          onClick={() => handleStatClick("In Transit")}
        />
        <StatCard
          label="Arrived"
          value={counts.Arrived}
          icon={PackageOpen}
          iconClass="bg-violet-50 text-violet-600"
          active={statusFilter === "Arrived"}
          onClick={() => handleStatClick("Arrived")}
        />
        <StatCard
          label="Received"
          value={counts.Received}
          icon={PackageCheck}
          iconClass="bg-green-50 text-green-600"
          active={statusFilter === "Received"}
          onClick={() => handleStatClick("Received")}
        />
        <StatCard
          label="Need Attention"
          value={counts["Need Attention"]}
          icon={AlertTriangle}
          iconClass="bg-red-50 text-red-500"
          active={statusFilter === "Need Attention"}
          onClick={() => handleStatClick("Need Attention")}
        />
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by shipment, tracking or client"
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 bg-gray-50"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            <option value="all">All Statuses</option>
            <option value="In Transit">In Transit</option>
            <option value="Arrived">Arrived</option>
            <option value="Received">Received</option>
            <option value="Partially Received">Partially Received</option>
            <option value="Need Attention">Need Attention</option>
          </select>

          <button className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <SlidersHorizontal className="size-3.5" />
            Filters
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <DataTable
            columns={columns}
            data={paginated}
            keyExtractor={(s) => s.id}
            emptyState={
              <EmptyState
                title="No shipments found"
                description={
                  search || statusFilter !== "all"
                    ? "Try adjusting your search or filter."
                    : "Create your first shipment to get started."
                }
                action={
                  !search && statusFilter === "all" && (
                    <button
                      onClick={() => setCreateOpen(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="size-4" />
                      Create Shipment
                    </button>
                  )
                }
              />
            }
          />
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50 shrink-0">
          <p className="text-[12px] text-gray-500">
            Showing{" "}
            <span className="font-medium text-gray-700">
              {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium text-gray-700">
              {Math.min(safePage * PAGE_SIZE, filtered.length)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-gray-700">{filtered.length}</span>{" "}
            shipments
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="flex size-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
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
                  <button
                    key={n}
                    onClick={() => setPage(n as number)}
                    className={`flex size-7 items-center justify-center rounded-md text-[12px] font-medium transition-colors ${
                      safePage === n
                        ? "bg-blue-600 text-white"
                        : "border border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {n}
                  </button>
                )
              )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="flex size-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Create modal */}
      <ShipmentModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreate}
        clients={!isMockMode ? pageClients : undefined}
      />

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id) }}
        title="Delete Shipment"
        message={`This shipment (${deleteTarget?.shipmentNumber}) will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />

      {/* Receiving modal (portal — rendered outside table overflow) */}
      {receivingTarget && (
        <ReceivingModal
          isOpen={!!receivingTarget}
          onClose={() => { setReceivingTarget(null); setReceivingError(null) }}
          mode={receivingMode}
          products={receivingTarget.products}
          onConfirm={handleReceivingConfirm}
          saving={receivingSaving}
          error={receivingError}
        />
      )}

      {/* Status dropdown — fixed positioned to avoid table overflow clipping */}
      {statusDropdown && (
        <>
          {/* Invisible backdrop to dismiss on click-outside */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setStatusDropdown(null)}
          />
          <div
            className="fixed z-40 bg-white rounded-lg border border-gray-200 shadow-lg py-1 min-w-[180px]"
            style={{ top: statusDropdown.top, left: statusDropdown.left }}
          >
            {ALL_STATUSES.map((s) => {
              const ship = shipments.find((x) => x.id === statusDropdown.id)
              const isCurrent = ship?.status === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleStatusSelect(s)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-gray-50 transition-colors ${
                    isCurrent ? "text-blue-600 font-semibold" : "text-gray-700"
                  }`}
                >
                  {isCurrent && <span className="size-1.5 rounded-full bg-blue-600 shrink-0" />}
                  {!isCurrent && <span className="size-1.5 shrink-0" />}
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
