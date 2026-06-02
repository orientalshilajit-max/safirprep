"use client"

import { useState } from "react"
import { AlertCircle } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import type { Client, ClientStatus } from "@/lib/types"

const CLIENT_STATUSES: ClientStatus[] = ["Active", "Pending", "Inactive"]

export type ClientFormData = {
  companyName: string
  contactName: string
  email: string
  phone: string
  notes: string
  status: ClientStatus
}

type ClientModalProps = {
  isOpen: boolean
  onClose: () => void
  /** May return a Promise; modal shows loading state while it resolves. */
  onSave: (data: ClientFormData) => void | Promise<void>
  client?: Client | null
}

const empty: ClientFormData = {
  companyName: "",
  contactName: "",
  email:       "",
  phone:       "",
  notes:       "",
  status:      "Active",
}

export function ClientModal({ isOpen, onClose, onSave, client }: ClientModalProps) {
  const [prevKey, setPrevKey] = useState<string>("")
  const currentKey = `${isOpen}|${client?.id ?? "__new__"}`

  const [form,      setForm]      = useState<ClientFormData>(empty)
  const [errors,    setErrors]    = useState<Partial<Record<keyof ClientFormData, string>>>({})
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState("")

  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
    if (isOpen) {
      setForm(
        client
          ? {
              companyName: client.companyName,
              contactName: client.contactName,
              email:       client.email,
              phone:       client.phone,
              notes:       client.notes,
              status:      client.status,
            }
          : empty
      )
      setErrors({})
      setSaveError("")
      setSaving(false)
    }
  }

  function set<K extends keyof ClientFormData>(key: K, val: ClientFormData[K]) {
    setForm((f) => ({ ...f, [key]: val }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate(): boolean {
    const e: typeof errors = {}
    if (!form.companyName.trim()) e.companyName = "Required"
    if (!form.contactName.trim()) e.contactName = "Required"
    if (!form.email.trim())       e.email       = "Required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email"
    if (Object.keys(e).length) { setErrors(e); return false }
    return true
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!validate()) return
    setSaveError("")
    setSaving(true)
    try {
      await onSave(form)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save client.")
    } finally {
      setSaving(false)
    }
  }

  const isEdit = !!client

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Client" : "Add Client"}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="client-form"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Client"}
          </button>
        </div>
      }
    >
      <form id="client-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Company + Contact row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="Acme Corp."
              className={`w-full px-3 py-2 text-[13px] border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 ${
                errors.companyName ? "border-red-400" : "border-gray-200"
              }`}
            />
            {errors.companyName && (
              <p className="mt-1 text-[11px] text-red-500">{errors.companyName}</p>
            )}
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
              Contact Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              placeholder="Jane Smith"
              className={`w-full px-3 py-2 text-[13px] border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 ${
                errors.contactName ? "border-red-400" : "border-gray-200"
              }`}
            />
            {errors.contactName && (
              <p className="mt-1 text-[11px] text-red-500">{errors.contactName}</p>
            )}
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="billing@company.com"
            className={`w-full px-3 py-2 text-[13px] border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 ${
              errors.email ? "border-red-400" : "border-gray-200"
            }`}
          />
          {errors.email && (
            <p className="mt-1 text-[11px] text-red-500">{errors.email}</p>
          )}
        </div>

        {/* Phone + Status row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="(310) 555-0000"
              className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Status</label>
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value as ClientStatus)}
              className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            >
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
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
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            placeholder="Any internal notes about this client..."
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 resize-none"
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
