"use client"

import { useEffect, useRef, useState } from "react"
import { FileText, Upload, X } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { useProducts, useRole } from "@/components/layout/app-shell"
import { SERVICE_TYPES } from "@/lib/types"
import type { ServiceFile, ServiceRequest, ServiceStatus, ServiceType } from "@/lib/types"

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

/* ── Reusable upload button ─────────────────────────────── */
function UploadBtn({
  label,
  onAdd,
  optional = false,
}: {
  label: string
  onAdd: (files: ServiceFile[]) => void
  optional?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []).map((f) => ({
      id: uid(),
      name: f.name,
      type: f.name.split(".").pop()?.toLowerCase() || "file",
      size: formatSize(f.size),
    }))
    if (picked.length) onAdd(picked)
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

/* ── File chip ──────────────────────────────────────────── */
function FileChip({ file, onRemove }: { file: ServiceFile; onRemove: (id: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-gray-700 bg-gray-100 rounded-full max-w-[200px]">
      <FileText className="size-3 shrink-0 text-gray-400" />
      <span className="truncate">{file.name}</span>
      <span className="text-gray-400 shrink-0">· {file.size}</span>
      <button
        type="button"
        onClick={() => onRemove(file.id)}
        className="ml-0.5 text-gray-400 hover:text-red-500 shrink-0"
      >
        <X className="size-2.5" />
      </button>
    </div>
  )
}

/* ── Form state ─────────────────────────────────────────── */
type FormState = {
  productId: string
  quantity: number
  useAllAvailable: boolean
  service: ServiceType | ""
  files: ServiceFile[]
  notes: string
  status: ServiceStatus
  // service-specific text fields
  prepNotes: string
  orderNotes: string
  placementNotes: string
  bundleInstructions: string
  unitsPerBundle: number
  serviceDescription: string
}

const emptyForm = (): FormState => ({
  productId: "",
  quantity: 0,
  useAllAvailable: false,
  service: "",
  files: [],
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
  onSave: (form: FormState) => void
  request?: ServiceRequest | null
}

export function RequestModal({ isOpen, onClose, onSave, request }: RequestModalProps) {
  const { role } = useRole()
  const { products } = useProducts()
  const [form, setForm] = useState<FormState>(emptyForm())
  const [error, setError] = useState("")

  const isEdit = !!request
  const isAdmin = role === "admin"
  const activeProducts = products.filter((p) => p.status === "Active")
  const selectedProduct = activeProducts.find((p) => p.id === form.productId)
    ?? products.find((p) => p.id === form.productId) // include if archived but in existing request

  /* ── Init ───────────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return
    if (request) {
      setForm({
        productId: request.productId,
        quantity: request.quantity,
        useAllAvailable: false,
        service: request.service,
        files: [...request.files],
        notes: request.notes,
        status: request.status,
        prepNotes: request.serviceDetails.prepNotes ?? "",
        orderNotes: request.serviceDetails.orderNotes ?? "",
        placementNotes: request.serviceDetails.placementNotes ?? "",
        bundleInstructions: request.serviceDetails.bundleInstructions ?? "",
        unitsPerBundle: request.serviceDetails.unitsPerBundle ?? 1,
        serviceDescription: request.serviceDetails.serviceDescription ?? "",
      })
    } else {
      setForm(emptyForm())
    }
    setError("")
  }, [isOpen, request])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /* ── Use all available ──────────────────────────────── */
  useEffect(() => {
    if (form.useAllAvailable && selectedProduct) {
      setForm((f) => ({ ...f, quantity: selectedProduct.available }))
    }
  }, [form.useAllAvailable, form.productId, selectedProduct?.available]) // eslint-disable-line

  /* ── Files ──────────────────────────────────────────── */
  function addFiles(newFiles: ServiceFile[]) {
    setForm((f) => ({ ...f, files: [...f.files, ...newFiles] }))
  }
  function removeFile(id: string) {
    setForm((f) => ({ ...f, files: f.files.filter((x) => x.id !== id) }))
  }

  /* ── Submit ─────────────────────────────────────────── */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.productId) { setError("Select a product."); return }
    if (!form.service)   { setError("Select a service type."); return }
    if (form.quantity <= 0) { setError("Enter a quantity greater than 0."); return }
    setError("")
    onSave(form)
  }

  /* ── Readonly for clients editing non-New requests ── */
  const canEdit = isAdmin || !isEdit || request?.status === "New"

  /* ── Conditional service fields ─────────────────────── */
  function ServiceFields() {
    const sectionClass = "mt-3 p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-3"

    if (form.service === "FBA Prep") return (
      <div className={sectionClass}>
        <p className={labelClass}>FBA Prep Details</p>
        <div className="flex flex-wrap gap-2">
          <UploadBtn label="Upload FNSKU Label" onAdd={addFiles} />
          <UploadBtn label="Upload Box Label" onAdd={addFiles} optional />
        </div>
        <div>
          <label className={labelClass}>Prep Notes</label>
          <textarea rows={2} value={form.prepNotes} onChange={(e) => set("prepNotes", e.target.value)}
            placeholder="e.g. poly bag, bubble wrap, desiccant…" className={textareaClass} disabled={!canEdit} />
        </div>
      </div>
    )

    if (form.service === "FBM Fulfillment") return (
      <div className={sectionClass}>
        <p className={labelClass}>FBM Details</p>
        <UploadBtn label="Upload Shipping Label" onAdd={addFiles} />
        <div className="mt-2">
          <label className={labelClass}>Order / Recipient Notes</label>
          <textarea rows={2} value={form.orderNotes} onChange={(e) => set("orderNotes", e.target.value)}
            placeholder="Recipient name, special instructions…" className={textareaClass} disabled={!canEdit} />
        </div>
      </div>
    )

    if (form.service === "Labeling") return (
      <div className={sectionClass}>
        <p className={labelClass}>Labeling Details</p>
        <UploadBtn label="Upload Label File" onAdd={addFiles} />
        <div className="mt-2">
          <label className={labelClass}>Label Placement Notes</label>
          <textarea rows={2} value={form.placementNotes} onChange={(e) => set("placementNotes", e.target.value)}
            placeholder="e.g. apply on bottom, avoid seams…" className={textareaClass} disabled={!canEdit} />
        </div>
      </div>
    )

    if (form.service === "Bundling") return (
      <div className={sectionClass}>
        <p className={labelClass}>Bundling Details</p>
        <div>
          <label className={labelClass}>Bundle Instructions</label>
          <textarea rows={2} value={form.bundleInstructions} onChange={(e) => set("bundleInstructions", e.target.value)}
            placeholder="How should units be bundled?" className={textareaClass} disabled={!canEdit} />
        </div>
        <div>
          <label className={labelClass}>Units per Bundle</label>
          <input type="number" min="1" value={form.unitsPerBundle}
            onChange={(e) => set("unitsPerBundle", Number(e.target.value))}
            className="w-28 px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!canEdit} />
        </div>
      </div>
    )

    if (form.service === "Other") return (
      <div className={sectionClass}>
        <label className={labelClass}>Service Description <span className="text-red-500">*</span></label>
        <textarea rows={3} value={form.serviceDescription} onChange={(e) => set("serviceDescription", e.target.value)}
          placeholder="Describe the service needed in detail…" className={textareaClass} disabled={!canEdit} />
      </div>
    )

    return null
  }

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
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
            {canEdit && (
              <button form="request-form" type="submit"
                className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                {isEdit ? "Save Changes" : "Submit Request"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <form id="request-form" onSubmit={handleSubmit} className="space-y-5">

        {/* Admin: status */}
        {isAdmin && isEdit && (
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <label className={labelClass}>Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value as ServiceStatus)}
              className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {SERVICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {/* Product */}
        <div>
          <label className={labelClass}>Product <span className="text-red-500">*</span></label>
          <select value={form.productId}
            onChange={(e) => set("productId", e.target.value)}
            className={inputClass} disabled={!canEdit}>
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
              type="number" min="1"
              value={form.quantity || ""}
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

        {/* Service */}
        <div>
          <label className={labelClass}>Service Type <span className="text-red-500">*</span></label>
          <select value={form.service}
            onChange={(e) => set("service", e.target.value as ServiceType | "")}
            className={inputClass} disabled={!canEdit}>
            <option value="">Select service…</option>
            {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {form.service && <ServiceFields />}
        </div>

        {/* Attachments */}
        <div>
          <label className={labelClass}>Attachments</label>
          <div className="flex items-start gap-3 flex-wrap">
            {canEdit && <UploadBtn label="Add files" onAdd={addFiles} />}
            {form.files.length === 0 && (
              <p className="text-[12px] text-gray-400 italic py-1.5">No files attached</p>
            )}
          </div>
          {form.files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {form.files.map((f) => <FileChip key={f.id} file={f} onRemove={removeFile} />)}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes</label>
          <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)}
            placeholder="Optional notes…" className={textareaClass} disabled={!canEdit} />
        </div>

      </form>
    </Modal>
  )
}

export type { FormState as RequestFormData }
