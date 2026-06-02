"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Search, SlidersHorizontal, Plus, Pencil,
  Archive, ArchiveRestore, Trash2,
  ChevronLeft, ChevronRight, X, AlertCircle, CheckCircle2,
} from "lucide-react"
import { useRole, useProducts, useIsMockMode } from "@/components/layout/app-shell"
import { DataTable } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { IconButton } from "@/components/ui/icon-button"
import { ProductThumbnail } from "@/components/ui/product-thumbnail"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { ProductModal } from "@/components/products/product-modal"
import type { ProductFormData } from "@/components/products/product-modal"
import {
  createProduct,
  updateProduct,
  archiveProduct,
  restoreProduct,
  deleteProductPermanently,
  listProductClients,
  listProducts,
} from "@/app/products/actions"
import type { Product, DataTableColumn } from "@/lib/types"

const PAGE_SIZE = 8

export default function ProductsPage() {
  const { role } = useRole()
  const { products, setProducts } = useProducts()
  const isMockMode = useIsMockMode()

  const [search,        setSearch]        = useState("")
  const [statusFilter,  setStatusFilter]  = useState<"all" | "Active" | "Archived">("Active")
  const [page,          setPage]          = useState(1)
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editing,       setEditing]       = useState<Product | null>(null)
  const [previewImage,  setPreviewImage]  = useState<string | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Product | null>(null)
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Client list for admin product-creation (Supabase mode only)
  const [pageClients, setPageClients] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!isMockMode && role === "admin") {
      listProductClients()
        .then(setPageClients)
        .catch(() => {})
    }
  }, [isMockMode, role])

  useEffect(() => {
    if (!previewImage) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreviewImage(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [previewImage])

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
      const matchStatus = statusFilter === "all" || p.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [products, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* ── Helpers ─────────────────────────────────────────── */
  function flash(type: "success" | "error", text: string) {
    setActionMessage({ type, text })
    if (type === "success") setTimeout(() => setActionMessage(null), 3000)
  }

  function openAdd()        { setEditing(null); setModalOpen(true) }
  function openEdit(p: Product) { setEditing(p);  setModalOpen(true) }

  /* ── Save ────────────────────────────────────────────── */
  async function handleSave(data: ProductFormData) {
    if (isMockMode) {
      if (editing) {
        setProducts((ps) => ps.map((p) => (p.id === editing.id ? { ...p, ...data } : p)))
      } else {
        const next: Product = {
          id: `p${Date.now()}`,
          clientId:   "c1",
          clientName: "TechVault Co.",
          ...data,
        }
        setProducts((ps) => [next, ...ps])
      }
      setModalOpen(false)
      return
    }

    if (editing) {
      await updateProduct(editing.id, data)
    } else {
      await createProduct(data)
    }
    setProducts(await listProducts())
    setModalOpen(false)
  }

  /* ── Archive ─────────────────────────────────────────── */
  async function handleArchive(id: string) {
    if (isMockMode) {
      setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, status: "Archived" as const } : p)))
      flash("success", "Product archived successfully.")
      return
    }
    try {
      await archiveProduct(id)
      setProducts(await listProducts())
      flash("success", "Product archived successfully.")
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "Failed to archive product.")
    }
  }

  /* ── Restore ─────────────────────────────────────────── */
  async function handleRestore(id: string) {
    if (isMockMode) {
      setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, status: "Active" as const } : p)))
      flash("success", "Product restored successfully.")
      return
    }
    try {
      await restoreProduct(id)
      setProducts(await listProducts())
      flash("success", "Product restored successfully.")
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "Failed to restore product.")
    }
  }

  /* ── Permanent delete ────────────────────────────────── */
  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeleteTarget(null)

    if (isMockMode) {
      setProducts((ps) => ps.filter((p) => p.id !== id))
      flash("success", "Product deleted permanently.")
      return
    }
    const result = await deleteProductPermanently(id)
    if (result.success) {
      setProducts(await listProducts())
      flash("success", "Product deleted permanently.")
    } else {
      flash("error", result.error)
    }
  }

  /* ── Column definitions ──────────────────────────────── */
  const baseColumns: DataTableColumn<Product>[] = [
    {
      id: "image",
      header: "Image",
      headerClassName: "w-14",
      className: "w-14",
      cell: (row, i) =>
        row.image ? (
          <button
            type="button"
            onClick={() => setPreviewImage(row.image!)}
            className="rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <ProductThumbnail src={row.image} name={row.name} index={i} size="md" />
          </button>
        ) : (
          <ProductThumbnail name={row.name} index={i} size="md" />
        ),
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
      headerClassName: "text-right w-28",
      className: "text-right w-28",
      cell: (row) => (
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton variant="primary" onClick={() => openEdit(row)} title="Edit">
            <Pencil className="size-3.5" />
          </IconButton>

          {row.status === "Active" ? (
            /* Active product: Archive */
            <IconButton
              variant="danger"
              onClick={() => handleArchive(row.id)}
              title="Archive"
            >
              <Archive className="size-3.5" />
            </IconButton>
          ) : (
            /* Archived product: Restore + Delete Permanently */
            <>
              <IconButton
                variant="primary"
                onClick={() => handleRestore(row.id)}
                title="Restore"
              >
                <ArchiveRestore className="size-3.5" />
              </IconButton>
              <IconButton
                variant="danger"
                onClick={() => setDeleteTarget(row)}
                title="Delete Permanently"
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            </>
          )}
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
      ? [...baseColumns.slice(0, 2), adminClientCol, ...baseColumns.slice(2)]
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

      {/* Action message banner */}
      {actionMessage && (
        <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 ${
          actionMessage.type === "success"
            ? "border-green-100 bg-green-50"
            : "border-red-100 bg-red-50"
        }`}>
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="size-4 text-green-600 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
          )}
          <p className={`text-[13px] flex-1 ${
            actionMessage.type === "success" ? "text-green-700" : "text-red-600"
          }`}>
            {actionMessage.text}
          </p>
          <button
            onClick={() => setActionMessage(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

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
              placeholder="Search by product, SKU, ASIN or UPC"
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 bg-gray-50"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            <option value="Active">Active</option>
            <option value="Archived">Archived</option>
            <option value="all">All Products</option>
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
            keyExtractor={(p) => p.id}
            emptyState={
              <EmptyState
                title="No products found"
                description={
                  search || statusFilter !== "all"
                    ? "Try adjusting your search or filter."
                    : "Add your first product to get started."
                }
                action={
                  !search && statusFilter === "Active" && (
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
                  <span key={`ellipsis-${i}`} className="px-1 text-[12px] text-gray-400">…</span>
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

      {/* Add / Edit modal */}
      <ProductModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        product={editing}
        role={role}
        clients={!isMockMode ? pageClients : undefined}
      />

      {/* Permanent delete confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete product permanently?"
        message={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone. Only safe if the product has no inventory or activity history.`}
        confirmLabel="Delete Permanently"
        variant="danger"
      />

      {/* Image preview lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close preview"
          >
            <X className="size-5" />
          </button>
          <img
            src={previewImage}
            alt="Product preview"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
