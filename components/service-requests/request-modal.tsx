"use client"

import { useRef, useState, useEffect, useMemo } from "react"
import { FileText, Upload, X, Plus, AlertCircle, Download } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { useProducts, useRole, useIsMockMode, useFiles } from "@/components/layout/app-shell"
import { listAvailableServiceTypes } from "@/app/service-requests/actions"
import type { AvailableServiceType } from "@/app/service-requests/actions"
import { SERVICE_TYPES } from "@/lib/types"
import type { FileDoc, ServiceFile, ServiceRequest, ServiceStatus } from "@/lib/types"

const uid = () => Math.random().toString(36).slice(2)

const SERVICE_STATUSES: ServiceStatus[] = [
  "New",
  "In Progress",
  "Completed",
  "Need Attention",
  "Invoiced",
  "Cancelled",
]

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/* ── File type helpers ──────────────────────────────────── */
const IMAGE_EXTS  = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg"])
const WORD_EXTS   = new Set(["doc", "docx"])
const EXCEL_EXTS  = new Set(["xls", "xlsx", "csv"])

function fileIconClass(ext: string) {
  if (WORD_EXTS.has(ext))  return "bg-blue-100 text-blue-500"
  if (EXCEL_EXTS.has(ext)) return "bg-green-100 text-green-600"
  if (ext === "pdf")        return "bg-red-100 text-red-500"
  return "bg-gray-100 text-gray-500"
}

/* ── Reusable upload button ─────────────────────────────── */
function UploadBtn({
  label,
  onAdd,
  optional = false,
}: {
  label: string
  onAdd: (meta: ServiceFile[], raw: File[]) => void
  optional?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || [])
    if (!picked.length) return
    const meta: ServiceFile[] = picked.map((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "file"
      return {
        id:       uid(),
        name:     f.name,
        type:     ext,
        size:     formatSize(f.size),
        localUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      }
    })
    onAdd(meta, picked)
    e.target.value = ""
  }

  return (
    <>
      <input ref={ref} type="file" className="hidden" multiple onChange={handle} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Upload className="size-3.5 text-gray-400" />
        {label}
        {optional && <span className="text-gray-400 font-normal">(optional)</span>}
      </button>
    </>
  )
}

/* ── Pending file card (with preview, removable) ────────── */
function FileCard({ file, onRemove }: { file: ServiceFile; onRemove: (id: string) => void }) {
  const ext = file.type.toLowerCase()
  const isImage = !!file.localUrl

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg max-w-[240px]">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.localUrl} alt={file.name} className="w-8 h-8 shrink-0 rounded object-cover" />
      ) : (
        <div className={`w-8 h-8 shrink-0 rounded flex items-center justify-center ${fileIconClass(ext)}`}>
          <FileText className="size-3.5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-gray-700 truncate leading-tight">{file.name}</p>
        <p className="text-[10px] text-gray-400">{file.size}</p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(file.id)}
        className="shrink-0 text-gray-300 hover:text-red-500 transition-colors ml-1"
        title="Remove"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/* ── Existing (already-uploaded) file row ───────────────── */
function ExistingFileRow({ file }: { file: FileDoc }) {
  const ext = file.ext.toLowerCase()
  const isImage = IMAGE_EXTS.has(ext)

  return (
    <a
      href={file.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`Download ${file.name}`}
      className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg max-w-[240px] hover:bg-gray-100 transition-colors group"
    >
      {isImage && file.fileUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.fileUrl} alt={file.name} className="w-8 h-8 shrink-0 rounded object-cover" />
      ) : (
        <div className={`w-8 h-8 shrink-0 rounded flex items-center justify-center ${fileIconClass(ext)}`}>
          <FileText className="size-3.5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-gray-700 truncate leading-tight">{file.name}</p>
        <p className="text-[10px] text-gray-400">{file.size}</p>
      </div>
      <Download className="size-3 shrink-0 text-gray-300 group-hover:text-blue-500 transition-colors ml-1" />
    </a>
  )
}

/* ── Price computation (client-side from fetched rules) ─── */
function computeRowPrice(
  serviceName: string,
  serviceTypeId: string | null,
  qty: number,
  types: AvailableServiceType[]
): number | null {
  if (!serviceName || qty <= 0 || types.length === 0) return null
  const found = types.find(
    (t) => (serviceTypeId && t.id === serviceTypeId) || t.name === serviceName
  )
  if (!found || found.pricingRules.length === 0) return null
  const eligible = [...found.pricingRules]
    .filter((r) => r.minQty <= qty)
    .sort((a, b) => b.minQty - a.minQty)
  const match = eligible.find((r) => r.maxQty === null || r.maxQty >= qty)
  return match ? parseFloat((match.pricePerUnit * qty).toFixed(2)) : null
}

/* ── Form state ─────────────────────────────────────────── */
type ServiceRowState = {
  rowId: string
  serviceTypeId: string | null
  serviceName: string
  notes: string
}

type FormState = {
  clientId: string
  productId: string
  quantity: number
  useAllAvailable: boolean
  services: ServiceRowState[]
  /** Metadata for newly-selected (not yet uploaded) files. */
  files: ServiceFile[]
  /** Raw File objects keyed by ServiceFile.id, for upload on save. */
  pendingFiles: Record<string, File>
  notes: string
  status: ServiceStatus
  prepNotes: string
  orderNotes: string
  placementNotes: string
  bundleInstructions: string
  unitsPerBundle: number
  serviceDescription: string
}

const emptyForm = (): FormState => ({
  clientId: "",
  productId: "",
  quantity: 0,
  useAllAvailable: false,
  services: [{ rowId: uid(), serviceTypeId: null, serviceName: "", notes: "" }],
  files: [],
  pendingFiles: {},
  notes: "",
  status: "New",
  prepNotes: "",
  orderNotes: "",
  placementNotes: "",
  bundleInstructions: "",
  unitsPerBundle: 1,
  serviceDescription: "",
})

/* ── Input helpers ──────────────────────────────────────── */
const labelClass = "block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5"
const inputClass =
  "w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
const textareaClass =
  "w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"

/* ── Props ──────────────────────────────────────────────── */
type RequestModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (form: FormState) => void | Promise<void>
  request?: ServiceRequest | null
  clients?: { id: string; name: string }[]
}

export function RequestModal({ isOpen, onClose, onSave, request, clients = [] }: RequestModalProps) {
  const { role }     = useRole()
  const { products } = useProducts()
  const isMockMode   = useIsMockMode()
  const { files: allFiles } = useFiles()

  const [form,      setFormState] = useState<FormState>(emptyForm())
  const [error,     setError]     = useState("")
  const [saveError, setSaveError] = useState("")
  const [saving,    setSaving]    = useState(false)
  const [fetchedServiceTypes, setFetchedServiceTypes] = useState<AvailableServiceType[]>([])

  const mockServiceTypes = useMemo<AvailableServiceType[]>(
    () => SERVICE_TYPES.map((name) => ({ id: name, name, visibleToCustomers: true, pricingRules: [] })),
    []
  )
  const availServiceTypes = isMockMode ? mockServiceTypes : fetchedServiceTypes

  const [prevKey, setPrevKey] = useState<string>("")
  const currentKey = `${isOpen}|${request?.id ?? "__new__"}`

  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
    if (isOpen) {
      setFormState(request ? {
        clientId:           "",
        productId:          request.productId,
        quantity:           request.quantity,
        useAllAvailable:    false,
        services:
          request.services?.length > 0
            ? request.services.map((s) => ({
                rowId:         uid(),
                serviceTypeId: s.serviceTypeId ?? null,
                serviceName:   s.serviceName,
                notes:         s.notes,
              }))
            : [{ rowId: uid(), serviceTypeId: null, serviceName: request.service || "", notes: "" }],
        files:              isMockMode ? [...request.files] : [],
        pendingFiles:       {},
        notes:              request.notes,
        status:             request.status,
        prepNotes:          request.serviceDetails.prepNotes          ?? "",
        orderNotes:         request.serviceDetails.orderNotes         ?? "",
        placementNotes:     request.serviceDetails.placementNotes     ?? "",
        bundleInstructions: request.serviceDetails.bundleInstructions ?? "",
        unitsPerBundle:     request.serviceDetails.unitsPerBundle     ?? 1,
        serviceDescription: request.serviceDetails.serviceDescription ?? "",
      } : {
        ...emptyForm(),
        clientId: clients[0]?.id ?? "",
      })
      setError("")
      setSaveError("")
      setSaving(false)
    }
  }

  // Fetch available service types from server when modal opens (Supabase mode only)
  useEffect(() => {
    if (!isOpen || isMockMode) return
    listAvailableServiceTypes().then(setFetchedServiceTypes).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const isEdit   = !!request
  const isAdmin  = role === "admin"
  const activeProducts  = products.filter((p) => p.status === "Active")
  const selectedProduct = activeProducts.find((p) => p.id === form.productId)
    ?? products.find((p) => p.id === form.productId)

  // Already-uploaded files for this request (Supabase mode only, edit only)
  const existingUploadedFiles = useMemo(
    () =>
      isEdit && !isMockMode && request
        ? allFiles.filter(
            (f) => f.relatedType === "service-request" && f.relatedId === request.id
          )
        : [],
    [allFiles, isEdit, isMockMode, request]
  )

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState((f) => ({ ...f, [key]: value }))
  }

  const effectiveQuantity =
    form.useAllAvailable && selectedProduct
      ? selectedProduct.available
      : form.quantity

  /* ── Service row management ─────────────────────────────── */
  function addServiceRow() {
    setFormState((f) => ({
      ...f,
      services: [...f.services, { rowId: uid(), serviceTypeId: null, serviceName: "", notes: "" }],
    }))
  }

  function removeServiceRow(idx: number) {
    setFormState((f) => ({
      ...f,
      services: f.services.filter((_, i) => i !== idx),
    }))
  }

  function updateServiceRowName(idx: number, serviceName: string) {
    const found = availServiceTypes.find((t) => t.name === serviceName)
    setFormState((f) => ({
      ...f,
      services: f.services.map((row, i) =>
        i === idx ? { ...row, serviceName, serviceTypeId: found?.id ?? null } : row
      ),
    }))
  }

  /* ── File management ─────────────────────────────────────── */
  function addFiles(meta: ServiceFile[], raw: File[]) {
    setFormState((f) => ({
      ...f,
      files: [...f.files, ...meta],
      pendingFiles: {
        ...f.pendingFiles,
        ...Object.fromEntries(meta.map((m, i) => [m.id, raw[i]])),
      },
    }))
  }

  function removeFile(id: string) {
    const sf = form.files.find((f) => f.id === id)
    if (sf?.localUrl) URL.revokeObjectURL(sf.localUrl)
    setFormState((f) => {
      const newPending = { ...f.pendingFiles }
      delete newPending[id]
      return { ...f, files: f.files.filter((x) => x.id !== id), pendingFiles: newPending }
    })
  }

  /* ── Submit ─────────────────────────────────────────────── */
  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!form.productId)        { setError("Select a product."); return }
    if (effectiveQuantity <= 0) { setError("Enter a quantity greater than 0."); return }
    const validServices = form.services.filter((s) => s.serviceName.trim())
    if (!validServices.length)  { setError("Select at least one service."); return }
    if (validServices.some((s) => s.serviceName === "Other") && !form.serviceDescription.trim()) {
      setError("Provide a description for the Other service."); return
    }
    setError("")
    setSaveError("")
    setSaving(true)
    try {
      await onSave({ ...form, quantity: effectiveQuantity })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save request.")
    } finally {
      setSaving(false)
    }
  }

  const canEdit         = isAdmin || !isEdit || request?.status === "New"
  const showClientField = isAdmin && !isEdit && clients.length > 0

  /* ── Derived for service-specific fields ────────────────── */
  const selectedServiceNames = new Set(form.services.map((s) => s.serviceName).filter(Boolean))
  const needsLabels   = selectedServiceNames.has("FBA Prep") || selectedServiceNames.has("Labeling")
  const needsFBM      = selectedServiceNames.has("FBM Fulfillment")
  const needsBundling = selectedServiceNames.has("Bundling")
  const needsOther    = selectedServiceNames.has("Other")
  const hasServiceFields = needsLabels || needsFBM || needsBundling || needsOther

  /* ── Price rows for estimate section ───────────────────── */
  const pricedRows = form.services
    .filter((s) => s.serviceName)
    .map((s) => ({
      name:  s.serviceName,
      price: computeRowPrice(s.serviceName, s.serviceTypeId, effectiveQuantity, availServiceTypes),
    }))
  const pricedCount   = pricedRows.filter((r) => r.price !== null).length
  const totalEstimate = pricedRows.reduce((sum, r) => sum + (r.price ?? 0), 0)
  const showEstimate  = !isMockMode && effectiveQuantity > 0 && pricedCount > 0

  const totalFileCount = existingUploadedFiles.length + form.files.length

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Service Request" : "New Service Request"}
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-red-600">{error}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            {canEdit && (
              <button
                form="request-form"
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
              >
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Submit Request"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <form id="request-form" onSubmit={handleSubmit} className="space-y-5">

        {/* Admin: client selector when creating (Supabase mode) */}
        {showClientField && (
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <label className={labelClass}>Client <span className="text-red-500">*</span></label>
            <select
              required
              value={form.clientId}
              onChange={(e) => set("clientId", e.target.value)}
              className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Admin: status (edit only) */}
        {isAdmin && isEdit && (
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <label className={labelClass}>Status</label>
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value as ServiceStatus)}
              className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SERVICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {/* Product */}
        <div>
          <label className={labelClass}>Product <span className="text-red-500">*</span></label>
          <select
            value={form.productId}
            onChange={(e) => set("productId", e.target.value)}
            className={inputClass}
            disabled={!canEdit}
          >
            <option value="">Select product…</option>
            {activeProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
            ))}
          </select>
          {selectedProduct && (
            <p className="mt-1.5 text-[12px] text-gray-500">
              Available:{" "}
              <span className={`font-semibold ${selectedProduct.available === 0 ? "text-red-600" : "text-gray-800"}`}>
                {selectedProduct.available.toLocaleString()}
              </span>{" "}
              units
            </p>
          )}
        </div>

        {/* Quantity */}
        <div>
          <label className={labelClass}>Quantity <span className="text-red-500">*</span></label>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="number"
              min="1"
              value={effectiveQuantity || ""}
              onChange={(e) => { set("quantity", Number(e.target.value)); set("useAllAvailable", false) }}
              placeholder="0"
              className="w-32 px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
              disabled={!canEdit || form.useAllAvailable}
            />
            {selectedProduct && (
              <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.useAllAvailable}
                  onChange={(e) => set("useAllAvailable", e.target.checked)}
                  className="rounded border-gray-300 text-blue-600"
                  disabled={!canEdit}
                />
                Use all available ({selectedProduct.available.toLocaleString()} units)
              </label>
            )}
          </div>
        </div>

        {/* Services */}
        <div>
          <label className={labelClass}>Services <span className="text-red-500">*</span></label>
          <div className="space-y-2">
            {form.services.map((row, idx) => {
              const rowPrice = computeRowPrice(row.serviceName, row.serviceTypeId, effectiveQuantity, availServiceTypes)
              const otherSelectedNames = new Set(
                form.services.filter((_, i) => i !== idx).map((s) => s.serviceName).filter(Boolean)
              )
              return (
                <div key={row.rowId}>
                  <div className="flex items-center gap-2">
                    <select
                      value={row.serviceName}
                      onChange={(e) => updateServiceRowName(idx, e.target.value)}
                      className={inputClass}
                      disabled={!canEdit || (availServiceTypes.length === 0 && !isMockMode)}
                    >
                      <option value="">
                        {availServiceTypes.length === 0 && !isMockMode ? "Loading…" : "Select service…"}
                      </option>
                      {availServiceTypes.map((s) => (
                        <option key={s.id} value={s.name} disabled={otherSelectedNames.has(s.name)}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {form.services.length > 1 && canEdit && (
                      <button
                        type="button"
                        onClick={() => removeServiceRow(idx)}
                        className="p-1.5 text-gray-400 hover:text-red-500 shrink-0 rounded-md hover:bg-red-50 transition-colors"
                        title="Remove service"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  {row.serviceName && effectiveQuantity > 0 && !isMockMode && (
                    <p className="mt-1 text-[12px]">
                      {rowPrice !== null ? (
                        <span className="text-blue-600 font-medium">
                          {row.serviceName}: {effectiveQuantity.toLocaleString()} × ${(rowPrice / effectiveQuantity).toFixed(2)} = ${rowPrice.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-400">
                          No pricing rule found — price will be set by admin.
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={addServiceRow}
              className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Plus className="size-3.5" />
              Add Another Service
            </button>
          )}
        </div>

        {/* Total estimate */}
        {showEstimate && (
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className={labelClass}>Estimate</p>
            <div className="space-y-1">
              {pricedRows.map((r) => {
                if (!r.price) return null
                return (
                  <div key={r.name} className="flex items-center justify-between text-[12px] text-gray-600">
                    <span>{r.name}</span>
                    <span className="tabular-nums">
                      {effectiveQuantity.toLocaleString()} × ${(r.price / effectiveQuantity).toFixed(2)} = ${r.price.toFixed(2)}
                    </span>
                  </div>
                )
              })}
              {pricedCount > 1 && (
                <div className="flex items-center justify-between text-[12px] font-semibold text-gray-800 border-t border-gray-200 mt-1.5 pt-1.5">
                  <span>Total estimate</span>
                  <span className="tabular-nums">${totalEstimate.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Service-specific fields */}
        {hasServiceFields && (
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-4">
            {needsLabels && (
              <div className="space-y-3">
                <p className={labelClass}>Labels &amp; Prep</p>
                <div className="flex flex-wrap gap-2">
                  <UploadBtn label="Upload FNSKU Label" onAdd={addFiles} />
                  <UploadBtn label="Upload Box Label" onAdd={addFiles} optional />
                </div>
                {selectedServiceNames.has("FBA Prep") && (
                  <div>
                    <label className={labelClass}>Prep Notes</label>
                    <textarea rows={2} value={form.prepNotes}
                      onChange={(e) => set("prepNotes", e.target.value)}
                      placeholder="e.g. poly bag, bubble wrap, desiccant…"
                      className={textareaClass} disabled={!canEdit} />
                  </div>
                )}
                {selectedServiceNames.has("Labeling") && (
                  <div>
                    <label className={labelClass}>Label Placement Notes</label>
                    <textarea rows={2} value={form.placementNotes}
                      onChange={(e) => set("placementNotes", e.target.value)}
                      placeholder="e.g. apply on bottom, avoid seams…"
                      className={textareaClass} disabled={!canEdit} />
                  </div>
                )}
              </div>
            )}

            {needsFBM && (
              <div className="space-y-3">
                <p className={labelClass}>FBM Details</p>
                <UploadBtn label="Upload Shipping Label" onAdd={addFiles} />
                <div>
                  <label className={labelClass}>Order / Recipient Notes</label>
                  <textarea rows={2} value={form.orderNotes}
                    onChange={(e) => set("orderNotes", e.target.value)}
                    placeholder="Recipient name, special instructions…"
                    className={textareaClass} disabled={!canEdit} />
                </div>
              </div>
            )}

            {needsBundling && (
              <div className="space-y-3">
                <p className={labelClass}>Bundling Details</p>
                <div>
                  <label className={labelClass}>Bundle Instructions</label>
                  <textarea rows={2} value={form.bundleInstructions}
                    onChange={(e) => set("bundleInstructions", e.target.value)}
                    placeholder="How should units be bundled?"
                    className={textareaClass} disabled={!canEdit} />
                </div>
                <div>
                  <label className={labelClass}>Units per Bundle</label>
                  <input type="number" min="1" value={form.unitsPerBundle}
                    onChange={(e) => set("unitsPerBundle", Number(e.target.value))}
                    className="w-28 px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!canEdit} />
                </div>
              </div>
            )}

            {needsOther && (
              <div>
                <label className={labelClass}>Service Description <span className="text-red-500">*</span></label>
                <textarea rows={3} value={form.serviceDescription}
                  onChange={(e) => set("serviceDescription", e.target.value)}
                  placeholder="Describe the service needed in detail…"
                  className={textareaClass} disabled={!canEdit} />
              </div>
            )}
          </div>
        )}

        {/* Attachments */}
        <div>
          <label className={labelClass}>
            Attachments
            {totalFileCount > 0 && (
              <span className="ml-1.5 text-[10px] font-normal text-gray-400 normal-case tracking-normal">
                ({totalFileCount} file{totalFileCount !== 1 ? "s" : ""})
              </span>
            )}
          </label>

          {/* Already-uploaded files (edit mode, Supabase) */}
          {existingUploadedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {existingUploadedFiles.map((f) => (
                <ExistingFileRow key={f.id} file={f} />
              ))}
            </div>
          )}

          {/* Pending new files with preview */}
          {form.files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {form.files.map((f) => (
                <FileCard key={f.id} file={f} onRemove={removeFile} />
              ))}
            </div>
          )}

          {/* Upload button */}
          {canEdit && (
            <UploadBtn label="Add files" onAdd={addFiles} />
          )}
          {totalFileCount === 0 && !canEdit && (
            <p className="text-[12px] text-gray-400 italic">No files attached</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Optional notes…"
            className={textareaClass}
            disabled={!canEdit}
          />
        </div>

        {/* Save error */}
        {saveError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
            <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-red-600 leading-snug whitespace-pre-wrap">{saveError}</p>
          </div>
        )}

      </form>
    </Modal>
  )
}

export type { FormState as RequestFormData }
