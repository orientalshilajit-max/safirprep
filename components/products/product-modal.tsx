"use client"

import { useState, useRef } from "react"
import { Upload, AlertCircle, X } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { uploadProductImage } from "@/app/products/actions"
import type { Product, ProductStatus, UserRole } from "@/lib/types"

export type ProductFormData = {
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
  /** Populated only for admin creating a new product (Supabase mode). */
  clientId?: string
}

const empty: ProductFormData = {
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

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
const MAX_BYTES     = 5 * 1024 * 1024 // 5 MB

type ProductModalProps = {
  isOpen: boolean
  onClose: () => void
  /** May return a Promise — modal shows a loading state while it resolves. */
  onSave: (data: ProductFormData) => void | Promise<void>
  product?: Product | null
  role: UserRole
  zIndex?: number
  /** Admin-only: list of clients for the "assign to client" selector. */
  clients?: { id: string; name: string }[]
}

export function ProductModal({
  isOpen,
  onClose,
  onSave,
  product,
  role,
  zIndex,
  clients = [],
}: ProductModalProps) {
  const [form,      setForm]      = useState<ProductFormData>(empty)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Image upload state
  const [imageFile,    setImageFile]    = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError,   setImageError]   = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Track the (isOpen, product) pair we last initialised the form for.
  const [prevKey, setPrevKey] = useState<string>("")
  const currentKey = `${isOpen}|${product?.id ?? "__new__"}`

  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
    setSaveError(null)
    setImageFile(null)
    setImagePreview(null)
    setImageError(null)
    if (product) {
      setForm({
        name:      product.name,
        sku:       product.sku,
        asin:      product.asin,
        fnsku:     product.fnsku,
        notes:     product.notes,
        status:    product.status,
        image:     product.image,
        available: product.available,
        incoming:  product.incoming,
        damaged:   product.damaged,
      })
    } else {
      setForm({
        ...empty,
        clientId: role === "admin" && clients.length > 0 ? clients[0].id : undefined,
      })
    }
  }

  function set<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so re-selecting the same file fires onChange
    e.target.value = ""
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setImageError("Only JPG, PNG, and WebP images are allowed.")
      return
    }
    if (file.size > MAX_BYTES) {
      setImageError("Image must be under 5 MB.")
      return
    }

    setImageError(null)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function handleRemoveImage() {
    if (imageFile) {
      // Cancel the pending selection; restore whatever was previously saved
      setImageFile(null)
      setImagePreview(null)
    } else {
      // Remove the existing saved image
      set("image", null)
    }
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      let imageUrl = form.image

      if (imageFile) {
        const fd = new FormData()
        fd.set("file", imageFile)
        // Pass clientId so the server can build the right storage path
        const clientId = form.clientId ?? product?.clientId
        if (clientId) fd.set("clientId", clientId)
        if (product?.id) fd.set("productId", product.id)
        imageUrl = await uploadProductImage(fd)
      }

      await onSave({ ...form, image: imageUrl })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save product.")
    } finally {
      setSaving(false)
    }
  }

  const isEdit = !!product
  const showClientSelector = role === "admin" && !isEdit && clients.length > 0

  // What to show in the image slot
  const displayImage = imagePreview ?? form.image

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
            disabled={saving}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            form="product-form"
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Product"}
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
            {displayImage ? (
              <div className="relative shrink-0">
                <img
                  src={displayImage}
                  alt="Product"
                  className="size-16 rounded-lg object-cover border border-gray-200"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-gray-700 hover:bg-gray-900 text-white"
                  title="Remove image"
                >
                  <X className="size-2.5" />
                </button>
              </div>
            ) : (
              <div className="size-16 shrink-0 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                <Upload className="size-5 text-gray-400" />
              </div>
            )}

            <div className="flex flex-col gap-1 min-w-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="self-start text-[13px] font-medium text-blue-600 hover:text-blue-700"
              >
                {displayImage ? "Change image" : "Upload image"}
              </button>
              {imageFile && (
                <p className="text-[11px] text-gray-400 truncate max-w-[220px]">
                  {imageFile.name}
                </p>
              )}
              {imageError && (
                <p className="text-[11px] text-red-500">{imageError}</p>
              )}
              <p className="text-[11px] text-gray-400">JPG, PNG, WebP · max 5 MB</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
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
              SKU
            </label>
            <input
              type="text"
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

        {/* Admin-only section */}
        {role === "admin" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
            <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wide">
              Admin Only
            </p>

            {showClientSelector && (
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Client <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.clientId ?? ""}
                  onChange={(e) => set("clientId", e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="" disabled>
                    Select a client…
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Inventory
              </p>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    { key: "available", label: "Available" },
                    { key: "incoming",  label: "Incoming" },
                    { key: "damaged",   label: "Damaged" },
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
          </div>
        )}

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
