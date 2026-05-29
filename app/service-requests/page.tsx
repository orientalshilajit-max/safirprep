"use client"

import { useState, useMemo } from "react"
import {
  Search, SlidersHorizontal, Plus, Pencil, Archive,
  FileText, CheckCircle, AlertTriangle, Clock, List,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import { useRole, useRequests, useProducts } from "@/components/layout/app-shell"
import { DataTable } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { IconButton } from "@/components/ui/icon-button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatCard } from "@/components/ui/stat-card"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { RequestModal, type RequestFormData } from "@/components/service-requests/request-modal"
import { SERVICE_TYPES } from "@/lib/types"
import type { ServiceRequest, ServiceStatus, ServiceType, DataTableColumn } from "@/lib/types"

const PAGE_SIZE = 8

const OPEN_STATUSES: ServiceStatus[] = ["New"]

export default function ServiceRequestsPage() {
  const { role } = useRole()
  const { requests, setRequests } = useRequests()
  const { setProducts } = useProducts()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | "all">("all")
  const [serviceFilter, setServiceFilter] = useState<ServiceType | "all">("all")
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceRequest | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ServiceRequest | null>(null)

  /* ── Stat counts ─────────────────────────────────────── */
  const active = requests.filter((r) => !r.isArchived)
  const counts = {
    Open: active.filter((r) => r.status === "New").length,
    "In Progress": active.filter((r) => r.status === "In Progress").length,
    Completed: active.filter((r) => r.status === "Completed").length,
    "Need Attention": active.filter((r) => r.status === "Need Attention").length,
  }

  /* ── Filtered + paginated ────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return active.filter((r) => {
      const matchSearch =
        !q ||
        r.requestNumber.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        r.service.toLowerCase().includes(q)
      const matchStatus =
        statusFilter === "all" || r.status === statusFilter
      const matchService =
        serviceFilter === "all" || r.service === serviceFilter
      return matchSearch && matchStatus && matchService
    })
  }, [active, search, statusFilter, serviceFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* ── Actions ─────────────────────────────────────────── */
  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(r: ServiceRequest) {
    setEditing(r)
    setModalOpen(true)
  }

  function handleSave(form: RequestFormData) {
    if (editing) {
      // Edit: update request (status change by admin or field edits)
      const oldStatus = editing.status
      const newStatus = form.status

      setRequests((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? {
                ...r,
                productId: form.productId,
                productName: requests.find((x) => x.id === editing.id)?.productName ?? form.productId,
                quantity: form.quantity,
                service: form.service as ServiceType,
                status: newStatus,
                files: form.files,
                notes: form.notes,
                serviceDetails: {
                  prepNotes: form.prepNotes,
                  orderNotes: form.orderNotes,
                  placementNotes: form.placementNotes,
                  bundleInstructions: form.bundleInstructions,
                  unitsPerBundle: form.unitsPerBundle,
                  serviceDescription: form.serviceDescription,
                },
              }
            : r
        )
      )

      // If admin cancels a New request that had inventory deducted, restore stock
      if (role === "admin" && newStatus === "Cancelled" && oldStatus === "New" && editing.inventoryDeducted) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === editing.productId
              ? { ...p, available: p.available + editing.quantity }
              : p
          )
        )
      }
    } else {
      // Create new request
      const allNums = requests.map((r) => parseInt(r.requestNumber.replace("REQ-", "")) || 0)
      const nextNum = Math.max(...allNums, 2005) + 1

      const product = requests.find(() => false) // placeholder
      // Get product name from the products context via the form
      const newReq: ServiceRequest = {
        id: `r${Date.now()}`,
        requestNumber: `REQ-${nextNum}`,
        clientId: "c1",
        clientName: role === "client" ? "John Smith" : "TechVault Co.",
        productId: form.productId,
        productName: "", // filled below
        productSku: "",
        service: form.service as ServiceType,
        quantity: form.quantity,
        status: "New",
        files: form.files,
        notes: form.notes,
        serviceDetails: {
          prepNotes: form.prepNotes,
          orderNotes: form.orderNotes,
          placementNotes: form.placementNotes,
          bundleInstructions: form.bundleInstructions,
          unitsPerBundle: form.unitsPerBundle,
          serviceDescription: form.serviceDescription,
        },
        createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        inventoryDeducted: true,
      }

      // We need to read the product to get name — use setProducts callback pattern
      setProducts((prev) => {
        const p = prev.find((x) => x.id === form.productId)
        if (p) {
          newReq.productName = p.name
          newReq.productSku = p.sku
          // Deduct inventory
          return prev.map((x) =>
            x.id === form.productId
              ? { ...x, available: Math.max(0, x.available - form.quantity) }
              : x
          )
        }
        return prev
      })

      setRequests((prev) => [newReq, ...prev])
    }

    setModalOpen(false)
  }

  function handleArchive(r: ServiceRequest) {
    setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, isArchived: true } : x)))
    // Restore inventory for New requests
    if (r.status === "New" && r.inventoryDeducted) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === r.productId ? { ...p, available: p.available + r.quantity } : p
        )
      )
    }
    setArchiveTarget(null)
  }

  function handleStatClick(filter: ServiceStatus) {
    setStatusFilter((prev) => (prev === filter ? "all" : filter))
    setPage(1)
  }

  /* ── Columns ─────────────────────────────────────────── */
  const baseColumns: DataTableColumn<ServiceRequest>[] = [
    {
      id: "number",
      header: "Request #",
      cell: (row) => (
        <span className="font-mono text-[12px] font-semibold text-gray-700">
          {row.requestNumber}
        </span>
      ),
    },
    {
      id: "product",
      header: "Product",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-900 truncate max-w-[180px]">
            {row.productName}
          </p>
          <p className="font-mono text-[11px] text-gray-400">{row.productSku}</p>
        </div>
      ),
    },
    {
      id: "service",
      header: "Service",
      cell: (row) => (
        <span className="text-[12px] text-gray-700">{row.service}</span>
      ),
    },
    {
      id: "quantity",
      header: "Qty",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <span className="text-[13px] font-semibold text-gray-800 tabular-nums">
          {row.quantity.toLocaleString()}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      id: "files",
      header: "Files",
      headerClassName: "text-center",
      className: "text-center",
      cell: (row) =>
        row.files.length === 0 ? (
          <span className="text-[12px] text-gray-300">—</span>
        ) : (
          <div className="flex items-center justify-center gap-1">
            <FileText className="size-3.5 text-gray-400" />
            <span className="text-[12px] font-semibold text-gray-600">
              {row.files.length}
            </span>
          </div>
        ),
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
        const canEdit = role === "admin" || row.status === "New"
        return (
          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && (
              <IconButton variant="primary" onClick={() => openEdit(row)} title="Edit">
                <Pencil className="size-3.5" />
              </IconButton>
            )}
            <IconButton
              variant="danger"
              onClick={() => setArchiveTarget(row)}
              title="Archive"
            >
              <Archive className="size-3.5" />
            </IconButton>
          </div>
        )
      },
    },
  ]

  const adminClientCol: DataTableColumn<ServiceRequest> = {
    id: "client",
    header: "Client",
    cell: (row) => (
      <span className="text-[12px] text-gray-500 max-w-[120px] truncate block">
        {row.clientName}
      </span>
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
            Service Requests
          </h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            Manage your prep and value-add requests
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors shadow-sm"
        >
          <Plus className="size-4" />
          New Service Request
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Open"
          value={counts.Open}
          icon={List}
          iconClass="bg-blue-50 text-blue-600"
          active={statusFilter === "New"}
          onClick={() => handleStatClick("New")}
        />
        <StatCard
          label="In Progress"
          value={counts["In Progress"]}
          icon={Clock}
          iconClass="bg-orange-50 text-orange-600"
          active={statusFilter === "In Progress"}
          onClick={() => handleStatClick("In Progress")}
        />
        <StatCard
          label="Completed"
          value={counts.Completed}
          icon={CheckCircle}
          iconClass="bg-green-50 text-green-600"
          active={statusFilter === "Completed"}
          onClick={() => handleStatClick("Completed")}
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
              placeholder="Search by product, service, client…"
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 bg-gray-50"
            />
          </div>

          <select
            value={serviceFilter}
            onChange={(e) => { setServiceFilter(e.target.value as ServiceType | "all"); setPage(1) }}
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            <option value="all">All Services</option>
            {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as ServiceStatus | "all"); setPage(1) }}
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            <option value="all">All Statuses</option>
            <option value="New">New</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Need Attention">Need Attention</option>
            <option value="Invoiced">Invoiced</option>
            <option value="Cancelled">Cancelled</option>
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
            keyExtractor={(r) => r.id}
            emptyState={
              <EmptyState
                title="No service requests found"
                description={
                  search || statusFilter !== "all" || serviceFilter !== "all"
                    ? "Try adjusting your search or filters."
                    : "Submit your first service request to get started."
                }
                action={
                  !search && statusFilter === "all" && serviceFilter === "all" && (
                    <button
                      onClick={openCreate}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="size-4" />
                      New Service Request
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
            requests
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

      {/* Create / Edit modal */}
      <RequestModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        request={editing}
      />

      {/* Archive confirm */}
      <ConfirmModal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => { if (archiveTarget) handleArchive(archiveTarget) }}
        title="Archive Request"
        message={`Archive ${archiveTarget?.requestNumber}? ${
          archiveTarget?.status === "New" && archiveTarget?.inventoryDeducted
            ? "The reserved inventory will be returned to Available."
            : ""
        }`}
        confirmLabel="Archive"
        variant="danger"
      />
    </div>
  )
}
