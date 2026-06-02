"use client"

import { useRef, useState, useEffect } from "react"
import { FileText, Upload, X, AlertCircle } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { useProducts, useRole, useIsMockMode } from "@/components/layout/app-shell"
import { lookupPricingRule } from "@/app/settings/actions"
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
  /** Admin-only when creating in Supabase mode */
  clientId: string
  productId: string
  quantity: number
  useAllAvailable: boolean
  service: ServiceType | ""
  files: ServiceFile[]
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

/* ── ServiceFields ──────────────────────────────────────── */
type ServiceFieldsProps = {
  service: ServiceType | ""
  form: FormState
  onSet: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  onAddFiles: (files: ServiceFile[]) => void
  canEdit: boolean
}

function ServiceFields({ service, form, onSet, onAddFiles, canEdit }: ServiceFieldsProps) {
  const sectionClass = "mt-3 p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-3"

  if (service === "FBA Prep") return (
    <div className={sectionClass}>
      <p className={labelClass}>FBA Prep Details</p>
      <div className="flex flex-wrap gap-2">
        <UploadBtn label="Upload FNSKU Label" onAdd={onAddFiles} />
        <UploadBtn label="Upload Box Label" onAdd={onAddFiles} optional />
      </div>
      <div>
        <label className={labelClass}>Prep Notes</label>
        <textarea rows={2} value={form.prepNotes} onChange={(e) => onSet("prepNotes", e.target.value)}
          placeholder="e.g. poly bag, bubble wrap, desiccant…" className={textareaClass} disabled={!canEdit} />
      </div>
    </div>
  )

  if (service === "FBM Fulfillment") return (
    <div className={sectionClass}>
      <p className={labelClass}>FBM Details</p>
      <UploadBtn label="Upload Shipping Label" onAdd={onAddFiles} />
      <div className="mt-2">
        <label className={labelClass}>Order / Recipient Notes</label>
        <textarea rows={2} value={form.orderNotes} onChange={(e) => onSet("orderNotes", e.target.value)}
          placeholder="Recipient name, special instructions…" className={textareaClass} disabled={!canEdit} />
      </div>
    </div>
  )

  if (service === "Labeling") return (
    <div className={sectionClass}>
      <p className={labelClass}>Labeling Details</p>
      <UploadBtn label="Upload Label File" onAdd={onAddFiles} />
      <div className="mt-2">
        <label className={labelClass}>Label Placement Notes</label>
        <textarea rows={2} value={form.placementNotes} onChange={(e) => onSet("placementNotes", e.target.value)}
          placeholder="e.g. apply on bottom, avoid seams…" className={textareaClass} disabled={!canEdit} />
      </div>
    </div>
  )

  if (service === "Bundling") return (
    <div className={sectionClass}>
      <p className={labelClass}>Bundling Details</p>
      <div>
        <label className={labelClass}>Bundle Instructions</label>
        <textarea rows={2} value={form.bundleInstructions} onChange={(e) => onSet("bundleInstructions", e.target.value)}
          placeholder="How should units be bundled?" className={textareaClass} disabled={!canEdit} />
      </div>
      <div>
        <label className={labelClass}>Units per Bundle</label>
        <input type="number" min="1" value={form.unitsPerBundle}
          onChange={(e) => onSet("unitsPerBundle", Number(e.target.value))}
          className="w-28 px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={!canEdit} />
      </div>
    </div>
  )

  if (service === "Other") return (
    <div className={sectionClass}>
      <label className={labelClass}>Service Description <span className="text-red-500">*</span></label>
      <textarea rows={3} value={form.serviceDescription} onChange={(e) => onSet("serviceDescription", e.target.value)}
        placeholder="Describe the service needed in detail…" className={textareaClass} disabled={!canEdit} />
    </div>
  )

  return null
}

/* ── Props ──────────────────────────────────────────────── */
type RequestModalProps = {
  isOpen: boolean
  onClose: () => void
  /** May return a Promise; modal shows loading state while it resolves. */
  onSave: (form: FormState) => void | Promise<void>
  request?: ServiceRequest | null
  /** Admin-only: list of clients for the "assign to client" selector. */
  clients?: { id: string; name: string }[]
}

export function RequestModal({ isOpen, onClose, onSave, request, clients = [] }: RequestModalProps) {
  const { role }   = useRole()
  const { products } = useProducts()
  const isMockMode   = useIsMockMode()

  const [form,           setFormState]    = useState<FormState>(emptyForm())
  const [error,          setError]        = useState("")
  const [saveError,      setSaveError]    = useState("")
  const [saving,         setSaving]       = useState(false)
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null)

  const [prevKey, setPrevKey] = useState<string>("")
  const currentKey = `${isOpen}|${request?.id ?? "__new__"}`

  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
    if (isOpen) {
      setEstimatedPrice(null)
      setFormState(request ? {
        clientId:           "",
        productId:          request.productId,
        quantity:           request.quantity,
        useAllAvailable:    false,
        service:            request.service,
        files:              [...request.files],
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

  const isEdit    = !!request
  const isAdmin   = role === "admin"
  const activeProducts   = products.filter((p) => p.status === "Active")
  const selectedProduct  = activeProducts.find((p) => p.id === form.productId)
    ?? products.find((p) => p.id === form.productId)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (key === "service" || key === "quantity" || key === "useAllAvailable") {
      setEstimatedPrice(null)
    }
    setFormState((f) => ({ ...f, [key]: value }))
  }

  const effectiveQuantity =
    form.useAllAvailable && selectedProduct
      ? selectedProduct.available
      : form.quantity

  // Look up pricing rule whenever service + quantity are both set
  useEffect(() => {
    if (!form.service || effectiveQuantity <= 0 || isMockMode) return
    lookupPricingRule(form.service, effectiveQuantity)
      .then((r) => setEstimatedPrice(r ? parseFloat((r.pricePerUnit * effectiveQuantity).toFixed(2)) : null))
      .catch(() => setEstimatedPrice(null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.service, effectiveQuantity])

  function addFiles(newFiles: ServiceFile[]) {
    setFormState((f) => ({ ...f, files: [...f.files, ...newFiles] }))
  }
  function removeFile(id: string) {
    setFormState((f) => ({ ...f, files: f.files.filter((x) => x.id !== id) }))
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!form.productId)        { setError("Select a product."); return }
    if (!form.service)          { setError("Select a service type."); return }
    if (effectiveQuantity <= 0) { setError("Enter a quantity greater than 0."); return }
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

        {/* Service */}
        <div>
          <label className={labelClass}>Service Type <span className="text-red-500">*</span></label>
          <select
            value={form.service}
            onChange={(e) => set("service", e.target.value as ServiceType | "")}
            className={inputClass}
            disabled={!canEdit}
          >
            <option value="">Select service…</option>
            {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {estimatedPrice !== null && (
            <p className="mt-1.5 text-[12px] font-medium text-blue-600">
              Estimated: ${estimatedPrice.toFixed(2)}
            </p>
          )}
          {estimatedPrice === null && form.service && effectiveQuantity > 0 && !isMockMode && (
            <p className="mt-1.5 text-[12px] text-gray-400">
              No pricing rule found — price will be set by admin.
            </p>
          )}
          {form.service && (
            <ServiceFields
              service={form.service}
              form={form}
              onSet={set}
              onAddFiles={addFiles}
              canEdit={canEdit}
            />
          )}
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
            <p className="text-[12px] text-red-600 leading-snug">{saveError}</p>
          </div>
        )}

      </form>
    </Modal>
  )
}

export type { FormState as RequestFormData }
