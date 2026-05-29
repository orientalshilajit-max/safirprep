"use client"

import { useState, useRef } from "react"
import { Upload, X } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { FILE_CATEGORIES } from "@/lib/types"
import type { FileCategory, FileDoc } from "@/lib/types"
import type { Product, Shipment, ServiceRequest } from "@/lib/types"

type UploadFormData = {
  file: File | null
  category: FileCategory
  relatedProductId: string
  relatedShipmentId: string
  relatedRequestId: string
  notes: string
}

type UploadModalProps = {
  isOpen: boolean
  onClose: () => void
  onUpload: (doc: FileDoc) => void
  products: Product[]
  shipments: Shipment[]
  requests: ServiceRequest[]
  clientId: string
  clientName: string
  role: "admin" | "client"
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getRelatedLabel(
  form: UploadFormData,
  products: Product[],
  shipments: Shipment[],
  requests: ServiceRequest[]
): { relatedTo: string; relatedType: FileDoc["relatedType"]; relatedId: string } {
  if (form.relatedProductId) {
    const p = products.find((x) => x.id === form.relatedProductId)
    return { relatedTo: p?.name ?? form.relatedProductId, relatedType: "product", relatedId: form.relatedProductId }
  }
  if (form.relatedShipmentId) {
    const s = shipments.find((x) => x.id === form.relatedShipmentId)
    return { relatedTo: s?.shipmentNumber ?? form.relatedShipmentId, relatedType: "shipment", relatedId: form.relatedShipmentId }
  }
  if (form.relatedRequestId) {
    const r = requests.find((x) => x.id === form.relatedRequestId)
    return { relatedTo: r?.requestNumber ?? form.relatedRequestId, relatedType: "service-request", relatedId: form.relatedRequestId }
  }
  return { relatedTo: "General", relatedType: "general", relatedId: "" }
}

export function UploadModal({
  isOpen,
  onClose,
  onUpload,
  products,
  shipments,
  requests,
  clientId,
  clientName,
  role,
}: UploadModalProps) {
  const [form, setForm] = useState<UploadFormData>({
    file: null,
    category: "Other",
    relatedProductId: "",
    relatedShipmentId: "",
    relatedRequestId: "",
    notes: "",
  })
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setForm({ file: null, category: "Other", relatedProductId: "", relatedShipmentId: "", relatedRequestId: "", notes: "" })
    setDragOver(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFile(f: File | null) {
    setForm((prev) => ({ ...prev, file: f }))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.file) return

    const ext = form.file.name.split(".").pop()?.toLowerCase() ?? "bin"
    const related = getRelatedLabel(form, products, shipments, requests)
    const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

    const doc: FileDoc = {
      id: `fd${Date.now()}`,
      name: form.file.name,
      ext,
      size: formatBytes(form.file.size),
      category: form.category,
      ...related,
      clientId,
      clientName,
      uploadedBy: role === "admin" ? "Safir WMS" : clientName,
      uploadedAt: now,
      notes: form.notes || undefined,
    }

    onUpload(doc)
    handleClose()
  }

  const visibleProducts = role === "admin" ? products : products.filter((p) => p.clientId === clientId)
  const visibleShipments = role === "admin" ? shipments : shipments.filter((s) => s.clientId === clientId)
  const visibleRequests = role === "admin" ? requests : requests.filter((r) => r.clientId === clientId)

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload File"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="upload-form"
            disabled={!form.file}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="size-3.5" />
            Upload
          </button>
        </div>
      }
    >
      <form id="upload-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 px-4 cursor-pointer transition-colors ${
            dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <Upload className="size-6 text-gray-400" />
          {form.file ? (
            <div className="text-center">
              <p className="text-[13px] font-medium text-gray-800">{form.file.name}</p>
              <p className="text-[11px] text-gray-400">{formatBytes(form.file.size)}</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleFile(null) }}
                className="mt-1 text-[11px] text-red-500 hover:underline flex items-center gap-0.5 mx-auto"
              >
                <X className="size-3" /> Remove
              </button>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-[13px] font-medium text-gray-700">Drop a file or click to browse</p>
              <p className="text-[11px] text-gray-400 mt-0.5">PDF, DOCX, XLSX, images, ZIP and more</p>
            </div>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as FileCategory }))}
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
          >
            {FILE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Related fields */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
              Related Product <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={form.relatedProductId}
              onChange={(e) => setForm((p) => ({ ...p, relatedProductId: e.target.value, relatedShipmentId: "", relatedRequestId: "" }))}
              className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            >
              <option value="">— None —</option>
              {visibleProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
              Related Shipment <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={form.relatedShipmentId}
              onChange={(e) => setForm((p) => ({ ...p, relatedShipmentId: e.target.value, relatedProductId: "", relatedRequestId: "" }))}
              className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            >
              <option value="">— None —</option>
              {visibleShipments.map((s) => (
                <option key={s.id} value={s.id}>{s.shipmentNumber} — {s.clientName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
              Related Service Request <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={form.relatedRequestId}
              onChange={(e) => setForm((p) => ({ ...p, relatedRequestId: e.target.value, relatedProductId: "", relatedShipmentId: "" }))}
              className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            >
              <option value="">— None —</option>
              {visibleRequests.map((r) => (
                <option key={r.id} value={r.id}>{r.requestNumber} — {r.productName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
            Notes <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={2}
            placeholder="Any additional context..."
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 resize-none"
          />
        </div>
      </form>
    </Modal>
  )
}
