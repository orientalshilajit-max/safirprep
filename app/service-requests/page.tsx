"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Search, SlidersHorizontal, Plus, Pencil, Archive,
  FileText, CheckCircle, AlertTriangle, Clock, List,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import {
  useRole, useRequests, useProducts, useInvoices,
  useFiles, useClients, useIsMockMode,
} from "@/components/layout/app-shell"
import { DataTable } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { IconButton } from "@/components/ui/icon-button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatCard } from "@/components/ui/stat-card"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { RequestModal, type RequestFormData } from "@/components/service-requests/request-modal"
import { SERVICE_TYPES } from "@/lib/types"
import {
  createRequest,
  updateRequest,
  archiveRequest,
} from "@/app/service-requests/actions"
import { listProductClients } from "@/app/products/actions"
import { createInvoice }      from "@/app/invoices/actions"
import type { ServiceRequest, ServiceStatus, ServiceType, DataTableColumn, FileCategory, Invoice } from "@/lib/types"

const PAGE_SIZE = 8

const SERVICE_UNIT_PRICES: Record<string, number> = {
  "FBA Prep": 0.85, "FBM Fulfillment": 0.65, "Labeling": 0.45,
  "Bundling": 1.20, "Inspection": 1.50, "Forwarding": 0.75,
  "Storage": 22.00, "Returns": 2.00, "Other": 1.00,
}

function fileCategory(service: string): FileCategory {
  if (["FBA Prep", "Labeling", "Bundling"].includes(service)) return "Labels"
  return "Product Docs"
}

const OPEN_STATUSES: ServiceStatus[] = ["New"]
void OPEN_STATUSES // used only by mock archive logic below

export default function ServiceRequestsPage() {
  const { role }    = useRole()
  const isMockMode  = useIsMockMode()
  const { requests, setRequests } = useRequests()
  const { setProducts } = useProducts()
  const { invoices, setInvoices } = useInvoices()
  const { setFiles }              = useFiles()
  const { clients }               = useClients()

  const [search,        setSearch]        = useState("")
  const [statusFilter,  setStatusFilter]  = useState<ServiceStatus | "all">("all")
  const [serviceFilter, setServiceFilter] = useState<ServiceType | "all">("all")
  const [page,          setPage]          = useState(1)
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editing,       setEditing]       = useState<ServiceRequest | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ServiceRequest | null>(null)

  // Client list for admin's modal selector (Supabase mode only)
  const [pageClients, setPageClients] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    if (!isMockMode && role === "admin") {
      listProductClients().then(setPageClients).catch(() => {})
    }
  }, [isMockMode, role])

  /* ── Stat counts ─────────────────────────────────────── */
  const active = requests.filter((r) => !r.isArchived)
  const counts = {
    Open:             active.filter((r) => r.status === "New").length,
    "In Progress":    active.filter((r) => r.status === "In Progress").length,
    Completed:        active.filter((r) => r.status === "Completed").length,
    "Need Attention": active.filter((r) => r.status === "Need Attention").length,
  }

  /* ── Filtered + paginated ────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return active.filter((r) => {
      const allServiceNames = r.services?.length
        ? r.services.map((s) => s.serviceName.toLowerCase())
        : [r.service.toLowerCase()]
      const matchSearch =
        !q ||
        r.requestNumber.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        allServiceNames.some((n) => n.includes(q))
      const matchStatus  = statusFilter  === "all" || r.status  === statusFilter
      const matchService =
        serviceFilter === "all" ||
        r.service === serviceFilter ||
        r.services?.some((s) => s.serviceName === serviceFilter)
      return matchSearch && matchStatus && matchService
    })
  }, [active, search, statusFilter, serviceFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* ── Helpers ─────────────────────────────────────────── */
  function openCreate() { setEditing(null);  setModalOpen(true) }
  function openEdit(r: ServiceRequest) { setEditing(r); setModalOpen(true) }

  // Sync files to mock Files context (mock-only; not connected to Supabase yet)
  function syncFilesToContext(
    req: { id: string; requestNumber: string; clientId: string; clientName: string; service: string; createdAt: string },
    formFiles: RequestFormData["files"]
  ) {
    if (!formFiles.length) return
    setFiles((prev) => {
      const existing = new Set(
        prev.filter((f) => f.relatedType === "service-request" && f.relatedId === req.id).map((f) => f.name)
      )
      const newDocs = formFiles
        .filter((sf) => !existing.has(sf.name))
        .map((sf) => ({
          id:          `fd-req-${sf.id}`,
          name:        sf.name,
          ext:         sf.name.split(".").pop()?.toLowerCase() ?? "bin",
          size:        sf.size,
          category:    fileCategory(req.service),
          relatedTo:   req.requestNumber,
          relatedType: "service-request" as const,
          relatedId:   req.id,
          clientId:    req.clientId,
          clientName:  req.clientName,
          uploadedBy:  req.clientName,
          uploadedAt:  req.createdAt,
        }))
      return newDocs.length ? [...newDocs, ...prev] : prev
    })
  }

  /* ── Save handler ────────────────────────────────────── */
  async function handleSave(form: RequestFormData) {
    const today = new Date().toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    })

    const validServices = form.services.filter((s) => s.serviceName.trim())
    const primaryServiceName = (validServices[0]?.serviceName ?? "") as ServiceType
    const serviceInputs = validServices.map((s) => ({
      serviceName:   s.serviceName,
      serviceTypeId: s.serviceTypeId,
      notes:         s.notes,
    }))
    const serviceDetails = {
      prepNotes:          form.prepNotes,
      orderNotes:         form.orderNotes,
      placementNotes:     form.placementNotes,
      bundleInstructions: form.bundleInstructions,
      unitsPerBundle:     form.unitsPerBundle,
      serviceDescription: form.serviceDescription,
    }

    // ── Mock mode ──────────────────────────────────────────
    if (isMockMode) {
      if (editing) {
        const oldStatus   = editing.status
        const newStatus   = form.status
        const productName = requests.find((x) => x.id === editing.id)?.productName ?? editing.productName

        setRequests((prev) =>
          prev.map((r) =>
            r.id === editing.id
              ? {
                  ...r,
                  productId:   form.productId,
                  productName,
                  quantity:    form.quantity,
                  service:     primaryServiceName || r.service,
                  services:    validServices.map((s) => ({
                    serviceName:   s.serviceName,
                    serviceTypeId: s.serviceTypeId,
                    quantity:      form.quantity,
                    unitPrice:     SERVICE_UNIT_PRICES[s.serviceName] ?? 1,
                    totalPrice:    (SERVICE_UNIT_PRICES[s.serviceName] ?? 1) * form.quantity,
                    notes:         s.notes,
                  })),
                  status:      newStatus,
                  files:       form.files,
                  notes:       form.notes,
                  serviceDetails,
                }
              : r
          )
        )

        if (role === "admin" && newStatus === "Cancelled" && oldStatus === "New" && editing.inventoryDeducted) {
          setProducts((prev) =>
            prev.map((p) => p.id === editing.productId ? { ...p, available: p.available + editing.quantity } : p)
          )
        }

        // Auto-generate invoice on Invoiced status (mock only)
        const alreadyHasInvoice = invoices.some((inv) => inv.relatedRequestNumber === editing.requestNumber)
        if (role === "admin" && newStatus === "Invoiced" && oldStatus !== "Invoiced" && !alreadyHasInvoice) {
          const client    = clients.find((c) => c.id === editing.clientId)
          const allNums   = invoices.map((i) => parseInt(i.invoiceNumber.replace("INV-", "")) || 0)
          const nextNum   = Math.max(...allNums, 41) + 1
          const dueDate   = new Date(Date.now() + 14 * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          const unitPrice = SERVICE_UNIT_PRICES[primaryServiceName] ?? 1.00
          const newInvoice: Invoice = {
            id:             `inv-${Date.now()}`,
            invoiceNumber:  `INV-${nextNum.toString().padStart(4, "0")}`,
            clientId:       editing.clientId,
            clientName:     editing.clientName,
            clientEmail:    client?.email ?? "",
            clientAddress:  client?.phone ?? "",
            date:           today,
            dueDate,
            status:         "Unpaid",
            lineItems:      [{ id: `li-${Date.now()}`, description: `${primaryServiceName} – ${productName} (${form.quantity} units)`, quantity: form.quantity, unitPrice }],
            notes:          "",
            relatedRequestNumber: editing.requestNumber,
          }
          setInvoices((prev) => [newInvoice, ...prev])
        }

        syncFilesToContext(
          { id: editing.id, requestNumber: editing.requestNumber, clientId: editing.clientId, clientName: editing.clientName, service: primaryServiceName, createdAt: editing.createdAt },
          form.files
        )
      } else {
        const allNums   = requests.map((r) => parseInt(r.requestNumber.replace("REQ-", "")) || 0)
        const nextNum   = Math.max(...allNums, 2005) + 1
        const newReq: ServiceRequest = {
          id:            `r${Date.now()}`,
          requestNumber: `REQ-${nextNum}`,
          clientId:      "c1",
          clientName:    "TechVault Co.",
          productId:     form.productId,
          productName:   "",
          productSku:    "",
          service:       primaryServiceName,
          services:      validServices.map((s) => ({
            serviceName:   s.serviceName,
            serviceTypeId: s.serviceTypeId,
            quantity:      form.quantity,
            unitPrice:     SERVICE_UNIT_PRICES[s.serviceName] ?? 1,
            totalPrice:    (SERVICE_UNIT_PRICES[s.serviceName] ?? 1) * form.quantity,
            notes:         s.notes,
          })),
          quantity:      form.quantity,
          status:        "New",
          files:         form.files,
          notes:         form.notes,
          serviceDetails,
          createdAt:         today,
          inventoryDeducted: true,
        }
        setProducts((prev) => {
          const p = prev.find((x) => x.id === form.productId)
          if (p) {
            newReq.productName = p.name
            newReq.productSku  = p.sku
            return prev.map((x) => x.id === form.productId ? { ...x, available: Math.max(0, x.available - form.quantity) } : x)
          }
          return prev
        })
        setRequests((prev) => [newReq, ...prev])
        syncFilesToContext(
          { id: newReq.id, requestNumber: newReq.requestNumber, clientId: newReq.clientId, clientName: newReq.clientName, service: primaryServiceName, createdAt: today },
          form.files
        )
      }

      setModalOpen(false)
      return
    }

    // ── Supabase mode ──────────────────────────────────────
    if (editing) {
      const updated = await updateRequest(editing.id, {
        productId:      form.productId,
        quantity:       form.quantity,
        services:       serviceInputs,
        status:         form.status,
        notes:          form.notes,
        serviceDetails,
      })

      setRequests((prev) => prev.map((r) => r.id === editing.id ? updated : r))

      // Mirror inventory change in products context for immediate UI feedback
      const becomingCancelled = form.status === "Cancelled" && editing.status !== "Cancelled"
      if (editing.inventoryDeducted) {
        if (becomingCancelled) {
          setProducts((prev) => prev.map((p) => p.id === editing.productId
            ? { ...p, available: p.available + editing.quantity } : p))
        } else if (form.status !== "Cancelled") {
          if (editing.productId !== form.productId) {
            setProducts((prev) => prev.map((p) => {
              if (p.id === editing.productId) return { ...p, available: p.available + editing.quantity }
              if (p.id === form.productId)    return { ...p, available: Math.max(0, p.available - form.quantity) }
              return p
            }))
          } else if (editing.quantity !== form.quantity) {
            const delta = editing.quantity - form.quantity
            setProducts((prev) => prev.map((p) => p.id === form.productId
              ? { ...p, available: Math.max(0, p.available + delta) } : p))
          }
        }
      }

      // Auto-create invoice when admin marks request as Invoiced (Supabase mode)
      const becomingInvoiced = form.status === "Invoiced" && editing.status !== "Invoiced"
      const alreadyHasInvoice = invoices.some((inv) => inv.relatedRequestNumber === editing.requestNumber)
      if (role === "admin" && becomingInvoiced && !alreadyHasInvoice) {
        try {
          const unitPrice = SERVICE_UNIT_PRICES[primaryServiceName] ?? 1.00
          const dueDate   = new Date(Date.now() + 14 * 86_400_000)
            .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          const newInvoice = await createInvoice({
            clientId:  editing.clientId,
            requestId: editing.id,
            lineItems: [{
              description: `${primaryServiceName} – ${updated.productName} (${form.quantity} units)`,
              quantity:    form.quantity,
              unitPrice,
            }],
            dueDate,
            notes: "",
          })
          setInvoices((prev) => [newInvoice, ...prev])
        } catch (err) {
          // Invoice creation is best-effort; don't block the request save
          console.error("[ServiceRequests] Invoice creation failed:", err)
        }
      }
    } else {
      const created = await createRequest({
        clientId:  form.clientId || undefined,
        productId: form.productId,
        quantity:  form.quantity,
        services:  serviceInputs,
        notes:     form.notes,
        serviceDetails,
      })

      setRequests((prev) => [created, ...prev])
      setProducts((prev) => prev.map((p) => p.id === form.productId
        ? { ...p, available: Math.max(0, p.available - form.quantity) } : p))
    }

    setModalOpen(false)
  }

  /* ── Archive handler ─────────────────────────────────── */
  async function handleArchive(r: ServiceRequest) {
    if (isMockMode) {
      setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, isArchived: true } : x)))
      if (r.status === "New" && r.inventoryDeducted) {
        setProducts((prev) => prev.map((p) => p.id === r.productId ? { ...p, available: p.available + r.quantity } : p))
      }
      setArchiveTarget(null)
      return
    }

    try {
      await archiveRequest(r.id)
      setRequests((prev) => prev.filter((x) => x.id !== r.id))
      // Restore inventory locally if request was still "New"
      if (r.status === "New" && r.inventoryDeducted) {
        setProducts((prev) => prev.map((p) => p.id === r.productId ? { ...p, available: p.available + r.quantity } : p))
      }
    } catch (err) {
      console.error("[ServiceRequestsPage] archiveRequest failed:", err)
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
        <span className="font-mono text-[12px] font-semibold text-gray-700">{row.requestNumber}</span>
      ),
    },
    {
      id: "product",
      header: "Product",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-900 truncate max-w-[180px]">{row.productName}</p>
          <p className="font-mono text-[11px] text-gray-400">{row.productSku}</p>
        </div>
      ),
    },
    {
      id: "service",
      header: "Services",
      cell: (row) => {
        const svcs = row.services?.length ? row.services : null
        if (!svcs) return <span className="text-[12px] text-gray-700">{row.service}</span>
        const first = svcs[0].serviceName
        const extra = svcs.length - 1
        return (
          <span className="text-[12px] text-gray-700">
            {first}
            {extra > 0 && <span className="text-gray-400 ml-1">+{extra}</span>}
          </span>
        )
      },
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
            <span className="text-[12px] font-semibold text-gray-600">{row.files.length}</span>
          </div>
        ),
    },
    {
      id: "created",
      header: "Created",
      cell: (row) => <span className="text-[12px] text-gray-500">{row.createdAt}</span>,
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
            <IconButton variant="danger" onClick={() => setArchiveTarget(row)} title="Archive">
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
      <span className="text-[12px] text-gray-500 max-w-[120px] truncate block">{row.clientName}</span>
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
          <h1 className="text-[20px] font-bold text-gray-900 leading-tight">Service Requests</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">Manage your prep and value-add requests</p>
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
        <StatCard label="Open"          value={counts.Open}             icon={List}          iconClass="bg-blue-50 text-blue-600"   active={statusFilter === "New"}           onClick={() => handleStatClick("New")} />
        <StatCard label="In Progress"   value={counts["In Progress"]}   icon={Clock}         iconClass="bg-orange-50 text-orange-600" active={statusFilter === "In Progress"}   onClick={() => handleStatClick("In Progress")} />
        <StatCard label="Completed"     value={counts.Completed}        icon={CheckCircle}   iconClass="bg-green-50 text-green-600"  active={statusFilter === "Completed"}     onClick={() => handleStatClick("Completed")} />
        <StatCard label="Need Attention" value={counts["Need Attention"]} icon={AlertTriangle} iconClass="bg-red-50 text-red-500"     active={statusFilter === "Need Attention"} onClick={() => handleStatClick("Need Attention")} />
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
                      safePage === n ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}>
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

      {/* Create / Edit modal */}
      <RequestModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        request={editing}
        clients={!isMockMode ? pageClients : undefined}
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
