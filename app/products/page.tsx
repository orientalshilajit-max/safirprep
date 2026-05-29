"use client"

import { useState, useMemo, useEffect } from "react"
import { Search, SlidersHorizontal, Plus, Pencil, Archive, ChevronLeft, ChevronRight } from "lucide-react"
import { useRole, useProducts, useIsMockMode } from "@/components/layout/app-shell"
import { DataTable } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { IconButton } from "@/components/ui/icon-button"
import { ProductThumbnail } from "@/components/ui/product-thumbnail"
import { EmptyState } from "@/components/ui/empty-state"
import { ProductModal } from "@/components/products/product-modal"
import type { ProductFormData } from "@/components/products/product-modal"
import {
  createProduct,
  updateProduct,
  toggleProductArchive,
  listProductClients,
} from "@/app/products/actions"
import type { Product, DataTableColumn } from "@/lib/types"

const PAGE_SIZE = 8

export default function ProductsPage() {
  const { role } = useRole()
  const { products, setProducts } = useProducts()
  const isMockMode = useIsMockMode()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Archived">("all")
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  // Client list for admin product-creation (Supabase mode only)
  const [pageClients, setPageClients] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!isMockMode && role === "admin") {
      listProductClients()
        .then(setPageClients)
        .catch(() => {/* non-critical — admin can still save without selector */})
    }
  }, [isMockMode, role])

  /* ── Derived state ───────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return products.filter((p) => {
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.asin.toLowerCase().includes(q) ||
        p.fnsku.toLowerCase().includes(q)
      const matchStatus =
        statusFilter === "all" || p.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [products, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* ── Actions ─────────────────────────────────────────── */
  function openAdd() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setModalOpen(true)
  }

  async function handleSave(data: ProductFormData) {
    if (isMockMode) {
      // Mock mode: update local state only
      if (editing) {
        setProducts((ps) =>
          ps.map((p) => (p.id === editing.id ? { ...p, ...data } : p))
        )
      } else {
        const next: Product = {
          id: `p${Date.now()}`,
          clientId: "c1",
          clientName: "TechVault Co.",
          ...data,
        }
        setProducts((ps) => [next, ...ps])
      }
      setModalOpen(false)
      return
    }

    // Supabase mode: call server action, update context with returned record
    if (editing) {
      const updated = await updateProduct(editing.id, data)
      setProducts((ps) => ps.map((p) => (p.id === editing.id ? updated : p)))
    } else {
      const created = await createProduct(data)
      setProducts((ps) => [created, ...ps])
    }
    setModalOpen(false)
  }

  async function handleArchive(id: string) {
    if (isMockMode) {
      setProducts((ps) =>
        ps.map((p) =>
          p.id === id
            ? { ...p, status: p.status === "Archived" ? "Active" : "Archived" }
            : p
        )
      )
      return
    }

    const newStatus = await toggleProductArchive(id)
    setProducts((ps) =>
      ps.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
    )
  }

  /* ── Column definitions ──────────────────────────────── */
  const baseColumns: DataTableColumn<Product>[] = [
    {
      id: "image",
      header: "Image",
      headerClassName: "w-14",
      className: "w-14",
      cell: (row, i) => <ProductThumbnail name={row.name} index={i} size="md" />,
    },
    {
      id: "name",
      header: "Product Name",
      cell: (row) => (
        <span className="font-medium text-gray-900 text-[13px]">{row.name}</span>
      ),
    },
    {
      id: "sku",
      header: "SKU",
      cell: (row) => (
        <span className="font-mono text-[12px] text-gray-500">{row.sku}</span>
      ),
    },
    {
      id: "asin",
      header: "ASIN / UPC",
      cell: (row) => (
        <span className="font-mono text-[12px] text-gray-500">{row.asin}</span>
      ),
    },
    {
      id: "fnsku",
      header: "FNSKU",
      cell: (row) => (
        <span className="font-mono text-[12px] text-gray-500">{row.fnsku}</span>
      ),
    },
    {
      id: "available",
      header: "Available",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <span className="tabular text-[13px] font-semibold text-gray-800">
          {row.available.toLocaleString()}
        </span>
      ),
    },
    {
      id: "incoming",
      header: "Incoming",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <span className={`tabular text-[13px] font-semibold ${row.incoming > 0 ? "text-blue-600" : "text-gray-400"}`}>
          {row.incoming.toLocaleString()}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      id: "actions",
      header: "Actions",
      headerClassName: "text-right w-20",
      className: "text-right w-20",
      cell: (row) => (
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton variant="primary" onClick={() => openEdit(row)} title="Edit">
            <Pencil className="size-3.5" />
          </IconButton>
          <IconButton
            variant="danger"
            onClick={() => handleArchive(row.id)}
            title={row.status === "Archived" ? "Restore" : "Archive"}
          >
            <Archive className="size-3.5" />
          </IconButton>
        </div>
      ),
    },
  ]

  // Admin gets a "Client" column after Product Name
  const adminClientCol: DataTableColumn<Product> = {
    id: "client",
    header: "Client",
    cell: (row) => (
      <span className="text-[12px] text-gray-500">{row.clientName}</span>
    ),
  }

  const columns =
    role === "admin"
      ? [
          ...baseColumns.slice(0, 2),
          adminClientCol,
          ...baseColumns.slice(2),
        ]
      : baseColumns

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900 leading-tight">Products</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">Manage your products</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors shadow-sm"
        >
          <Plus className="size-4" />
          Add Product
        </button>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by product, SKU, ASIN or UPC"
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 bg-gray-50"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            <option value="all">All Products</option>
            <option value="Active">Active</option>
            <option value="Archived">Archived</option>
          </select>

          {/* Filters */}
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
            keyExtractor={(p) => p.id}
            emptyState={
              <EmptyState
                title="No products found"
                description={
                  search
                    ? "Try adjusting your search or filter."
                    : "Add your first product to get started."
                }
                action={
                  !search && (
                    <button
                      onClick={openAdd}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="size-4" />
                      Add Product
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
            products
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
                  <span key={`ellipsis-${i}`} className="px-1 text-[12px] text-gray-400">
                    …
                  </span>
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

      {/* Modal */}
      <ProductModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        product={editing}
        role={role}
        clients={!isMockMode ? pageClients : undefined}
      />
    </div>
  )
}
