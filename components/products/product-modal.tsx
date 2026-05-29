"use client"

import { useState } from "react"
import { Upload } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import type { Product, ProductStatus, UserRole } from "@/lib/types"

type FormData = {
  name: string
  sku: string
  asin: string
  fnsku: string
  notes: string
  status: ProductStatus
  image: string | null
  available: number
  incoming: number
  damaged: number
}

const empty: FormData = {
  name: "",
  sku: "",
  asin: "",
  fnsku: "",
  notes: "",
  status: "Active",
  image: null,
  available: 0,
  incoming: 0,
  damaged: 0,
}

type ProductModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (data: FormData) => void
  product?: Product | null
  role: UserRole
  zIndex?: number
}

export function ProductModal({
  isOpen,
  onClose,
  onSave,
  product,
  role,
  zIndex,
}: ProductModalProps) {
  const [form, setForm] = useState<FormData>(empty)
  // Track the (isOpen, product) pair we last initialised the form for.
  const [prevKey, setPrevKey] = useState<string>("")
  const currentKey = `${isOpen}|${product?.id ?? "__new__"}`

  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku,
        asin: product.asin,
        fnsku: product.fnsku,
        notes: product.notes,
        status: product.status,
        image: product.image,
        available: product.available,
        incoming: product.incoming,
        damaged: product.damaged,
      })
    } else {
      setForm(empty)
    }
  }

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.sku.trim()) return
    onSave(form)
  }

  const isEdit = !!product

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Product" : "Add Product"}
      size="lg"
      zIndex={zIndex}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            form="product-form"
            type="submit"
            className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            {isEdit ? "Save Changes" : "Add Product"}
          </button>
        </div>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Image */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Product Image
          </label>
          <div className="flex items-center gap-4">
            {form.image ? (
              <img
                src={form.image}
                alt="Product"
                className="size-16 rounded-lg object-cover border border-gray-200"
              />
            ) : (
              <div className="size-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                <Upload className="size-5 text-gray-400" />
              </div>
            )}
            <button
              type="button"
              className="text-[13px] font-medium text-blue-600 hover:text-blue-700"
            >
              {form.image ? "Change image" : "Upload image"}
            </button>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Product Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Wireless Earbuds Pro"
            className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        {/* SKU + Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              SKU <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="e.g. WE-1000"
              className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 font-mono"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value as ProductStatus)}
              className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="Active">Active</option>
              <option value="Archived">Archived</option>
            </select>
          </div>
        </div>

        {/* ASIN / UPC */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            ASIN / UPC
          </label>
          <input
            type="text"
            value={form.asin}
            onChange={(e) => set("asin", e.target.value)}
            placeholder="e.g. B09XY21234"
            className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 font-mono"
          />
        </div>

        {/* FNSKU */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            FNSKU
          </label>
          <input
            type="text"
            value={form.fnsku}
            onChange={(e) => set("fnsku", e.target.value)}
            placeholder="e.g. X001234SAB"
            className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 font-mono"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Optional notes about this product..."
            rows={2}
            className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 resize-none"
          />
        </div>

        {/* Admin-only inventory */}
        {role === "admin" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
            <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wide mb-3">
              Inventory — Admin Only
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { key: "available", label: "Available" },
                  { key: "incoming", label: "Incoming" },
                  { key: "damaged", label: "Damaged" },
                ] as { key: "available" | "incoming" | "damaged"; label: string }[]
              ).map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    {label}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form[key]}
                    onChange={(e) => set(key, Number(e.target.value))}
                    className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
