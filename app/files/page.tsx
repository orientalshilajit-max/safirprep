"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Search,
  Plus,
  Download,
  Trash2,
  FileText,
  File,
  Archive,
  AlertTriangle,
  FolderOpen,
  Tag,
  Truck,
  Receipt,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import {
  useRole,
  useFiles,
  useProducts,
  useShipments,
  useRequests,
  useAuthUser,
  useIsMockMode,
} from "@/components/layout/app-shell"
import { DataTable } from "@/components/ui/data-table"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState } from "@/components/ui/empty-state"
import { IconButton } from "@/components/ui/icon-button"
import { FilePreviewModal } from "@/components/files/file-preview-modal"
import { UploadModal } from "@/components/files/upload-modal"
import { listProductClients } from "@/app/products/actions"
import { listFiles, deleteFile } from "@/app/files/actions"
import type { FileDoc, FileCategory, DataTableColumn } from "@/lib/types"
import { FILE_CATEGORIES } from "@/lib/types"

const PAGE_SIZE = 10

function getFileKind(ext: string): "image" | "pdf" | "word" | "excel" | "archive" | "unknown" {
  const e = ext.toLowerCase()
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(e)) return "image"
  if (e === "pdf") return "pdf"
  if (["doc", "docx"].includes(e)) return "word"
  if (["xls", "xlsx", "csv"].includes(e)) return "excel"
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return "archive"
  return "unknown"
}

function FileThumbnail({ file, onClick }: { file: FileDoc; onClick: () => void }) {
  const kind = getFileKind(file.ext)

  if (kind === "image") {
    return (
      <button
        onClick={onClick}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-blue-400 transition-all"
        title="Preview"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.fileUrl ?? `https://via.placeholder.com/36x36/e2e8f0/94a3b8?text=${file.ext.toUpperCase()}`}
          alt={file.name}
          className="w-full h-full object-cover"
        />
      </button>
    )
  }

  const configs = {
    pdf:     { bg: "bg-red-50",   border: "border-red-100",   color: "text-red-500",   Icon: FileText },
    word:    { bg: "bg-blue-50",  border: "border-blue-100",  color: "text-blue-600",  Icon: FileText },
    excel:   { bg: "bg-green-50", border: "border-green-100", color: "text-green-600", Icon: FileText },
    archive: { bg: "bg-amber-50", border: "border-amber-100", color: "text-amber-500", Icon: Archive  },
    unknown: { bg: "bg-gray-100", border: "border-gray-200",  color: "text-gray-400",  Icon: File     },
  } as const

  const { bg, border, color, Icon } = configs[kind]

  return (
    <button
      onClick={onClick}
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${bg} ${border} hover:ring-2 hover:ring-blue-400 transition-all`}
      title="Preview"
    >
      <Icon className={`size-4 ${color}`} />
    </button>
  )
}

function ExtBadge({ ext }: { ext: string }) {
  const kind = getFileKind(ext)
  const styles = {
    pdf:     "bg-red-50 text-red-600 border-red-100",
    word:    "bg-blue-50 text-blue-600 border-blue-100",
    excel:   "bg-green-50 text-green-600 border-green-100",
    archive: "bg-amber-50 text-amber-600 border-amber-100",
    image:   "bg-purple-50 text-purple-600 border-purple-100",
    unknown: "bg-gray-100 text-gray-500 border-gray-200",
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${styles[kind]}`}>
      {ext}
    </span>
  )
}

function handleDownload(file: FileDoc) {
  if (file.fileUrl) {
    const a = document.createElement("a")
    a.href = file.fileUrl
    a.download = file.name
    a.target = "_blank"
    a.rel = "noopener noreferrer"
    a.click()
  }
}

export default function FilesPage() {
  const { role }   = useRole()
  const authUser   = useAuthUser()
  const isMockMode = useIsMockMode()
  const { files, setFiles } = useFiles()
  const { products }  = useProducts()
  const { shipments } = useShipments()
  const { requests }  = useRequests()

  const [search,          setSearch]          = useState("")
  const [categoryFilter,  setCategoryFilter]  = useState<FileCategory | "all">("all")
  const [page,            setPage]            = useState(1)
  const [previewFile,     setPreviewFile]     = useState<FileDoc | null>(null)
  const [uploadOpen,      setUploadOpen]      = useState(false)
  const [deleteTarget,    setDeleteTarget]    = useState<FileDoc | null>(null)
  const [deleting,        setDeleting]        = useState(false)
  const [deleteError,     setDeleteError]     = useState("")

  // Client list for admin UploadModal (Supabase mode only)
  const [pageClients, setPageClients] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    if (!isMockMode && role === "admin") {
      listProductClients().then(setPageClients).catch(() => {})
    }
  }, [isMockMode, role])

  /* ── Visible files by role ──────────────────────────────
     In Supabase mode, DB RLS already scopes the result.
     In mock mode, manually filter by clientId.            */
  const visibleFiles = useMemo(() => {
    if (!isMockMode) return files
    if (role === "admin") return files
    const myClientId = authUser?.clientId ?? "c1"
    return files.filter((f) => f.clientId === myClientId)
  }, [files, role, isMockMode, authUser])

  /* ── Stat counts ──────────────────────────────────────── */
  const counts = {
    total:        visibleFiles.length,
    labels:       visibleFiles.filter((f) => f.category === "Labels").length,
    shipmentDocs: visibleFiles.filter((f) => f.category === "Shipment Docs").length,
    invoices:     visibleFiles.filter((f) => f.category === "Invoices").length,
  }

  /* ── Filtered + paginated ─────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return visibleFiles.filter((f) => {
      const matchSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.relatedTo.toLowerCase().includes(q) ||
        f.clientName.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.uploadedBy.toLowerCase().includes(q)
      const matchCat = categoryFilter === "all" || f.category === categoryFilter
      return matchSearch && matchCat
    })
  }, [visibleFiles, search, categoryFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* ── Upload ───────────────────────────────────────────── */
  async function handleUpload(doc: FileDoc) {
    if (!isMockMode) {
      // Re-fetch to capture any cross-device changes and get proper signed URLs
      const fresh = await listFiles().catch(() => null)
      if (fresh) { setFiles(fresh); return }
    }
    setFiles((prev) => [doc, ...prev])
  }

  /* ── Stat filter toggle ───────────────────────────────── */
  function handleStatClick(cat: FileCategory) {
    setCategoryFilter((prev) => (prev === cat ? "all" : cat))
    setPage(1)
  }

  /* ── Delete ──────────────────────────────────────────── */
  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError("")
    const result = await deleteFile(deleteTarget.id)
    if (result.success) {
      setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id))
      setDeleteTarget(null)
    } else {
      setDeleteError(result.error)
      if (result.partiallyDeleted) {
        // Record is likely orphaned in DB; remove from local list anyway
        setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id))
      }
    }
    setDeleting(false)
  }

  /* ── Upload modal props ───────────────────────────────── */
  // In mock mode, use the hardcoded mock client.
  // In Supabase mode, use the authenticated user's clientId (clients use theirs;
  // admin picks from the dropdown rendered inside UploadModal).
  const uploadClientId   = isMockMode ? "c1"            : (authUser?.clientId ?? "")
  const uploadClientName = isMockMode ? "TechVault Co." : (authUser?.displayName ?? "")

  /* ── Columns ──────────────────────────────────────────── */
  const baseColumns: DataTableColumn<FileDoc>[] = [
    {
      id: "preview",
      header: "Preview",
      headerClassName: "w-14",
      className: "w-14",
      cell: (row) => <FileThumbnail file={row} onClick={() => setPreviewFile(row)} />,
    },
    {
      id: "name",
      header: "File Name",
      cell: (row) => (
        <div className="min-w-0">
          <p
            className="text-[13px] font-medium text-gray-900 truncate max-w-[220px] cursor-pointer hover:text-blue-600 transition-colors"
            onClick={() => setPreviewFile(row)}
          >
            {row.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ExtBadge ext={row.ext} />
            <span className="text-[11px] text-gray-400">{row.size}</span>
          </div>
        </div>
      ),
    },
    {
      id: "category",
      header: "Category",
      cell: (row) => (
        <span className="text-[12px] text-gray-600 font-medium">{row.category}</span>
      ),
    },
    {
      id: "relatedTo",
      header: "Related To",
      cell: (row) => (
        <span className="font-mono text-[12px] text-gray-500 truncate max-w-[140px] block">
          {row.relatedTo}
        </span>
      ),
    },
    {
      id: "uploadedAt",
      header: "Uploaded Date",
      cell: (row) => (
        <span className="text-[12px] text-gray-500">{row.uploadedAt}</span>
      ),
    },
    {
      id: "actions",
      header: "Action",
      headerClassName: "text-right w-24",
      className: "text-right w-24",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton
            variant="primary"
            title="Download"
            onClick={() => handleDownload(row)}
          >
            <Download className="size-3.5" />
          </IconButton>
          {!isMockMode && (
            <IconButton
              variant="danger"
              title="Delete file"
              onClick={() => { setDeleteError(""); setDeleteTarget(row) }}
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          )}
        </div>
      ),
    },
  ]

  const adminClientCol: DataTableColumn<FileDoc> = {
    id: "client",
    header: "Client",
    cell: (row) => (
      <span className="text-[12px] text-gray-500 max-w-[120px] truncate block">{row.clientName}</span>
    ),
  }

  const adminUploadedByCol: DataTableColumn<FileDoc> = {
    id: "uploadedBy",
    header: "Uploaded By",
    cell: (row) => (
      <span className="text-[12px] text-gray-500 truncate block">{row.uploadedBy}</span>
    ),
  }

  const columns: DataTableColumn<FileDoc>[] =
    role === "admin"
      ? [
          baseColumns[0],
          adminClientCol,
          baseColumns[1],
          baseColumns[2],
          baseColumns[3],
          adminUploadedByCol,
          baseColumns[4],
          baseColumns[5],
        ]
      : baseColumns

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900 leading-tight">Files & Documents</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            All uploaded files across shipments, service requests, and more
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors shadow-sm shrink-0"
        >
          <Plus className="size-4" />
          Upload File
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Files"
          value={counts.total}
          icon={FolderOpen}
          iconClass="bg-blue-50 text-blue-600"
          onClick={() => { setCategoryFilter("all"); setPage(1) }}
          active={categoryFilter === "all"}
        />
        <StatCard
          label="Labels"
          value={counts.labels}
          icon={Tag}
          iconClass="bg-purple-50 text-purple-600"
          active={categoryFilter === "Labels"}
          onClick={() => handleStatClick("Labels")}
        />
        <StatCard
          label="Shipment Docs"
          value={counts.shipmentDocs}
          icon={Truck}
          iconClass="bg-orange-50 text-orange-500"
          active={categoryFilter === "Shipment Docs"}
          onClick={() => handleStatClick("Shipment Docs")}
        />
        <StatCard
          label="Invoices"
          value={counts.invoices}
          icon={Receipt}
          iconClass="bg-green-50 text-green-600"
          active={categoryFilter === "Invoices"}
          onClick={() => handleStatClick("Invoices")}
        />
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search files, client, category…"
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 bg-gray-50"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value as FileCategory | "all"); setPage(1) }}
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            <option value="all">All Categories</option>
            {FILE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <DataTable
            columns={columns}
            data={paginated}
            keyExtractor={(f) => f.id}
            mobileCard={(f) => (
              <div className="flex items-center gap-3 px-4 py-3">
                <FileThumbnail file={f} onClick={() => setPreviewFile(f)} />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
                    onClick={() => setPreviewFile(f)}
                  >
                    {f.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ExtBadge ext={f.ext} />
                    <span className="text-[11px] text-gray-400">{f.size}</span>
                    <span className="text-[11px] text-gray-400">·</span>
                    <span className="text-[11px] text-gray-500">{f.category}</span>
                  </div>
                  {role === "admin" && (
                    <p className="text-[11px] text-gray-400 truncate">{f.clientName}</p>
                  )}
                  <p className="font-mono text-[11px] text-gray-400 truncate">{f.relatedTo}</p>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton variant="primary" title="Download" onClick={() => handleDownload(f)}>
                    <Download className="size-3.5" />
                  </IconButton>
                  {!isMockMode && (
                    <IconButton variant="danger" title="Delete file" onClick={() => { setDeleteError(""); setDeleteTarget(f) }}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  )}
                </div>
              </div>
            )}
            emptyState={
              <EmptyState
                title="No files found"
                description={
                  search || categoryFilter !== "all"
                    ? "Try adjusting your search or filters."
                    : "Upload your first file to get started."
                }
                action={
                  !search && categoryFilter === "all" ? (
                    <button
                      onClick={() => setUploadOpen(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="size-4" />
                      Upload File
                    </button>
                  ) : undefined
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
            files
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

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { if (!deleting) { setDeleteTarget(null); setDeleteError("") } }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex gap-4 mb-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="size-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900">Delete file?</h2>
                <p className="text-[13px] text-gray-500 mt-1 leading-snug">
                  This will permanently delete <strong className="text-gray-700">{deleteTarget.name}</strong> from storage. This action cannot be undone.
                </p>
              </div>
            </div>

            {deleteError && (
              <p className={`text-[12px] rounded-lg px-3 py-2 mb-4 ${
                deleteError.includes("storage") ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
              }`}>
                {deleteError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError("") }}
                disabled={deleting}
                className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60"
              >
                {deleting && <span className="size-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />

      {/* Upload modal */}
      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={handleUpload}
        products={products}
        shipments={shipments}
        requests={requests}
        clientId={uploadClientId}
        clientName={uploadClientName}
        role={role}
        clients={!isMockMode ? pageClients : undefined}
        isMockMode={isMockMode}
      />
    </div>
  )
}
