"use client"

import { useState, useMemo } from "react"
import { Plus, Trash2, RotateCcw } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { SERVICE_TYPES } from "@/lib/types"
import type { Product } from "@/lib/types"

// ── Types ─────────────────────────────────────────────────────

type LineItemDraft = {
  id: string
  productName: string
  customProduct: boolean   // true = free-text entry, not from product list
  serviceName: string
  customService: boolean   // true = "Add Specific Service" free-text entry
  quantity: number
  unitPrice: number
}

export type NewInvoiceFormData = {
  clientId: string
  dueDate: string
  notes: string
  lineItems: {
    productName: string
    serviceName: string
    quantity: number
    unitPrice: number
  }[]
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: NewInvoiceFormData) => Promise<void>
  clients: { id: string; name: string }[]
  products: Product[]
}

// ── Helpers ───────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

function todayIso() {
  return new Date().toISOString().split("T")[0]
}

function blankItem(): LineItemDraft {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productName: "",
    customProduct: false,
    serviceName: "",
    customService: false,
    quantity: 1,
    unitPrice: 0,
  }
}

const INPUT_CLS =
  "w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-300"
const SELECT_CLS =
  "w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700"

// ── Component ─────────────────────────────────────────────────

export function NewInvoiceModal({ isOpen, onClose, onSubmit, clients, products }: Props) {
  const [clientId,    setClientId]    = useState("")
  const [dueDate,     setDueDate]     = useState("")
  const [notes,       setNotes]       = useState("")
  const [items,       setItems]       = useState<LineItemDraft[]>([blankItem()])
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState("")

  // Products for the currently selected client
  const clientProducts = useMemo(
    () => products.filter((p) => p.clientId === clientId && p.status === "Active"),
    [products, clientId],
  )

  function resetForm() {
    setClientId(""); setDueDate(""); setNotes("")
    setItems([blankItem()]); setError("")
  }

  function handleClose() { resetForm(); onClose() }

  // ── Item helpers ──────────────────────────────────────────

  function updateItem(id: string, patch: Partial<LineItemDraft>) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...patch } : it))
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }
  function addItem() {
    setItems((prev) => [...prev, blankItem()])
  }

  // Clear product choices when client changes
  function handleClientChange(id: string) {
    setClientId(id)
    setItems((prev) => prev.map((it) => ({ ...it, productName: "", customProduct: false })))
  }

  // ── Validation ────────────────────────────────────────────

  function validate(): string | null {
    if (!clientId)                    return "Please select a client."
    if (!dueDate)                     return "Please enter a due date."
    if (items.length === 0)           return "Add at least one line item."
    for (const it of items) {
      if (!it.productName.trim())     return "All line items need a product or description."
      if (!it.serviceName.trim())     return "All line items need a service."
      if (it.quantity < 1)            return "Quantity must be at least 1."
      if (it.unitPrice < 0)           return "Unit price cannot be negative."
    }
    return null
  }

  // ── Submit ────────────────────────────────────────────────

  async function handleSubmit() {
    const err = validate()
    if (err) { setError(err); return }
    setError(""); setSubmitting(true)
    try {
      await onSubmit({
        clientId,
        dueDate,
        notes: notes.trim(),
        lineItems: items.map((it) => ({
          productName: it.productName.trim(),
          serviceName: it.serviceName.trim(),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      })
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invoice.")
    } finally {
      setSubmitting(false)
    }
  }

  const grandTotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)

  // ── Render ────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Invoice"
      size="xl"
      zIndex={55}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p className="text-[12px] text-red-600">{error}</p>
          )}
          <div className="flex items-center justify-between">
            <button onClick={handleClose} disabled={submitting}
              className="px-3 py-1.5 text-[13px] font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60">
              {submitting ? "Creating…" : "Create Invoice"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">

        {/* ── Header fields ──────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Client */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Client <span className="text-red-400">*</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Invoice Date (display only — set by server on creation) */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Invoice Date
            </label>
            <div className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg bg-gray-50 text-gray-500">
              {new Date(todayIso()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Due Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={dueDate}
              min={todayIso()}
              onChange={(e) => setDueDate(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
        </div>

        {/* ── Line items ─────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Invoice Items <span className="text-red-400">*</span>
          </p>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_2fr_56px_100px_80px_32px] gap-0 bg-gray-50 border-b border-gray-200 px-3 py-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Product / Description</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Service</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">QTY</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Unit Price</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Total</span>
              <span />
            </div>

            {/* Item rows */}
            <div className="divide-y divide-gray-100">
              {items.map((item) => {
                const lineTotal = item.quantity * item.unitPrice
                return (
                  <div key={item.id} className="grid grid-cols-[2fr_2fr_56px_100px_80px_32px] gap-1.5 items-center px-3 py-2">

                    {/* Product / Description */}
                    <div>
                      {item.customProduct ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={item.productName}
                            onChange={(e) => updateItem(item.id, { productName: e.target.value })}
                            placeholder="Custom description"
                            className={INPUT_CLS}
                            autoFocus
                          />
                          <button
                            type="button"
                            title="Back to product list"
                            onClick={() => updateItem(item.id, { customProduct: false, productName: "" })}
                            className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <RotateCcw className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <select
                          value={item.productName}
                          onChange={(e) => {
                            if (e.target.value === "__custom__") {
                              updateItem(item.id, { customProduct: true, productName: "" })
                            } else {
                              updateItem(item.id, { productName: e.target.value })
                            }
                          }}
                          className={SELECT_CLS}
                          disabled={!clientId}
                        >
                          <option value="">{clientId ? "Select product…" : "Select client first"}</option>
                          {clientProducts.map((p) => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                          <option value="__custom__">Custom description…</option>
                        </select>
                      )}
                    </div>

                    {/* Service */}
                    <div>
                      {item.customService ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={item.serviceName}
                            onChange={(e) => updateItem(item.id, { serviceName: e.target.value })}
                            placeholder="Service name"
                            className={INPUT_CLS}
                            autoFocus
                          />
                          <button
                            type="button"
                            title="Back to service list"
                            onClick={() => updateItem(item.id, { customService: false, serviceName: "" })}
                            className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <RotateCcw className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <select
                          value={item.serviceName}
                          onChange={(e) => {
                            if (e.target.value === "__custom__") {
                              updateItem(item.id, { customService: true, serviceName: "" })
                            } else {
                              updateItem(item.id, { serviceName: e.target.value })
                            }
                          }}
                          className={SELECT_CLS}
                        >
                          <option value="">Select service…</option>
                          {SERVICE_TYPES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                          <option value="__custom__">Add Specific Service…</option>
                        </select>
                      )}
                    </div>

                    {/* QTY */}
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Math.floor(Number(e.target.value))) })}
                      className="w-full px-2 py-1.5 text-[12px] text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />

                    {/* Unit Price */}
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">$</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, { unitPrice: Math.max(0, Number(e.target.value)) })}
                        className="w-full pl-5 pr-2 py-1.5 text-[12px] text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>

                    {/* Total */}
                    <div className="text-right text-[12px] font-semibold text-gray-700 tabular-nums">
                      {fmt(lineTotal)}
                    </div>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={items.length === 1}
                      className="flex items-center justify-center size-6 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Add item row */}
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Plus className="size-3.5" />
                Add Line Item
              </button>
            </div>
          </div>

          {/* Grand total */}
          <div className="flex justify-end mt-3">
            <div className="w-48 space-y-1.5">
              <div className="flex justify-between text-[12px] text-gray-400">
                <span>Tax</span><span>—</span>
              </div>
              <div className="h-px bg-gray-200" />
              <div className="flex justify-between text-[14px] font-bold text-gray-900">
                <span>Total</span>
                <span className="tabular-nums">{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Notes ──────────────────────────────────────── */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Notes <span className="text-gray-300 font-normal normal-case">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Payment instructions, terms, or other notes…"
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none placeholder:text-gray-300"
          />
        </div>

      </div>
    </Modal>
  )
}
