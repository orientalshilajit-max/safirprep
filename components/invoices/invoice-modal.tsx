"use client"

import { useState } from "react"
import { Pencil, Download, X, Plus, Trash2, Box, CheckCircle, AlertCircle } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import type { Invoice, InvoiceLineItem, InvoiceStatus } from "@/lib/types"

const STATUSES: InvoiceStatus[] = ["Unpaid", "Paid", "Overdue", "Void"]

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

function lineTotal(item: InvoiceLineItem) {
  return item.quantity * item.unitPrice
}

function invoiceTotal(items: InvoiceLineItem[]) {
  return items.reduce((s, i) => s + lineTotal(i), 0)
}

/* ── Editable line item row ─────────────────────────────── */
function EditableRow({
  item,
  onChange,
  onRemove,
}: {
  item: InvoiceLineItem
  onChange: (updated: InvoiceLineItem) => void
  onRemove: () => void
}) {
  return (
    <tr className="border-b border-gray-100 group">
      <td className="py-2 pr-3">
        <input
          value={item.description}
          onChange={(e) => onChange({ ...item, description: e.target.value })}
          className="w-full text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </td>
      <td className="py-2 pr-3 w-20">
        <input
          type="number"
          min={1}
          value={item.quantity}
          onChange={(e) => onChange({ ...item, quantity: Math.max(1, Number(e.target.value)) })}
          className="w-full text-[13px] text-right text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </td>
      <td className="py-2 pr-3 w-28">
        <input
          type="number"
          min={0}
          step={0.01}
          value={item.unitPrice}
          onChange={(e) => onChange({ ...item, unitPrice: Math.max(0, Number(e.target.value)) })}
          className="w-full text-[13px] text-right text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </td>
      <td className="py-2 text-right w-24">
        <span className="text-[13px] font-semibold text-gray-800">{fmt(lineTotal(item))}</span>
      </td>
      <td className="py-2 pl-2 w-8">
        <button
          type="button"
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 flex size-6 items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
        >
          <Trash2 className="size-3.5" />
        </button>
      </td>
    </tr>
  )
}

/* ── View line item row ─────────────────────────────────── */
function ViewRow({ item }: { item: InvoiceLineItem }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-2.5 pr-3 text-[13px] text-gray-700">{item.description}</td>
      <td className="py-2.5 pr-3 w-20 text-right text-[13px] text-gray-600 tabular-nums">{item.quantity.toLocaleString()}</td>
      <td className="py-2.5 pr-3 w-28 text-right text-[13px] text-gray-600 tabular-nums">{fmt(item.unitPrice)}</td>
      <td className="py-2.5 w-24 text-right text-[13px] font-semibold text-gray-800 tabular-nums">{fmt(lineTotal(item))}</td>
    </tr>
  )
}

/* ── Main modal ─────────────────────────────────────────── */
type InvoiceModalProps = {
  invoice: Invoice | null
  role: "admin" | "client"
  onClose: () => void
  /** May return a Promise; modal shows loading state while it resolves. */
  onSave: (updated: Invoice) => void | Promise<void>
}

export function InvoiceModal({ invoice, role, onClose, onSave }: InvoiceModalProps) {
  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState("")
  const [draft, setDraft] = useState<Invoice | null>(
    () => invoice ? structuredClone(invoice) : null
  )
  // Track the previous invoice reference so we can reset during render
  // when the caller opens the modal for a different invoice.
  const [prevInvoice, setPrevInvoice] = useState(invoice)

  if (prevInvoice !== invoice) {
    setPrevInvoice(invoice)
    setDraft(invoice ? structuredClone(invoice) : null)
    setEditing(false)
    setSaveError("")
  }

  if (!invoice || !draft) return null

  const isAdmin = role === "admin"
  const total = invoiceTotal(draft.lineItems)

  /* ── Line item helpers ── */
  function updateItem(id: string, updated: InvoiceLineItem) {
    setDraft((d) => d ? { ...d, lineItems: d.lineItems.map((li) => li.id === id ? updated : li) } : d)
  }

  function removeItem(id: string) {
    setDraft((d) => d ? { ...d, lineItems: d.lineItems.filter((li) => li.id !== id) } : d)
  }

  function addItem() {
    const newItem: InvoiceLineItem = {
      id: `li${Date.now()}`,
      description: "",
      quantity: 1,
      unitPrice: 0,
    }
    setDraft((d) => d ? { ...d, lineItems: [...d.lineItems, newItem] } : d)
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    setSaveError("")
    try {
      await onSave(draft)
      setEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save invoice.")
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setDraft(structuredClone(invoice))
    setEditing(false)
    setSaveError("")
  }

  const isPaid = draft.status === "Paid"

  return (
    <Modal
      isOpen={!!invoice}
      onClose={onClose}
      title={`Invoice ${invoice.invoiceNumber}`}
      size="xl"
      zIndex={55}
      footer={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isAdmin && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Pencil className="size-3.5" />
                Edit
              </button>
            )}
            {isAdmin && editing && (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  <CheckCircle className="size-3.5" />
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="px-3 py-1.5 text-[13px] font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                {saveError && (
                  <span className="flex items-center gap-1 text-[12px] text-red-600 ml-1">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {saveError}
                  </span>
                )}
              </>
            )}
          </div>
          <button
            onClick={() => {}}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="size-3.5" />
            Download PDF
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── Invoice header ── */}
        <div className="flex items-start justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600 shrink-0">
              <Box className="size-5 text-white" />
            </div>
            <div>
              <p className="text-[15px] font-bold text-gray-900">Safir Logistics</p>
              <p className="text-[11px] text-gray-400">Prep Center & Fulfillment</p>
            </div>
          </div>

          {/* Invoice badge + number */}
          <div className="text-right">
            <p className="text-[22px] font-bold text-gray-900 tracking-tight">{draft.invoiceNumber}</p>
            <div className="mt-1">
              <StatusBadge status={draft.status} />
            </div>
          </div>
        </div>

        {/* ── Meta grid ── */}
        <div className="grid grid-cols-2 gap-4 pt-1">
          {/* Bill To */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Bill To</p>
            <p className="text-[13px] font-semibold text-gray-900">{draft.clientName}</p>
            <p className="text-[12px] text-gray-500 mt-0.5">{draft.clientEmail}</p>
            <p className="text-[12px] text-gray-400 mt-1 whitespace-pre-line leading-relaxed">{draft.clientAddress}</p>
          </div>

          {/* Invoice meta */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3.5 space-y-2">
            {draft.relatedRequestNumber && (
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service Request</span>
                <span className="font-mono text-[12px] text-gray-700">{draft.relatedRequestNumber}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Invoice Date</span>
              <span className="text-[13px] text-gray-700">{draft.date}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Due Date</span>
              {editing ? (
                <input
                  value={draft.dueDate}
                  onChange={(e) => setDraft((d) => d ? { ...d, dueDate: e.target.value } : d)}
                  className="text-[13px] text-gray-800 bg-white border border-gray-200 rounded px-2 py-0.5 w-36 text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              ) : (
                <span className={cn("text-[13px] font-medium", draft.status === "Overdue" ? "text-red-600" : "text-gray-700")}>
                  {draft.dueDate}
                </span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</span>
              {editing ? (
                <select
                  value={draft.status}
                  onChange={(e) => setDraft((d) => d ? { ...d, status: e.target.value as InvoiceStatus } : d)}
                  className="text-[12px] text-gray-800 bg-white border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <StatusBadge status={draft.status} />
              )}
            </div>
          </div>
        </div>

        {/* ── Line items ── */}
        <div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-20">Qty</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-28">Unit Price</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Amount</th>
                  {editing && <th className="w-8" />}
                </tr>
              </thead>
              <tbody className="px-4">
                {draft.lineItems.map((item) =>
                  editing ? (
                    <tr key={item.id} className="border-b border-gray-100 group">
                      <td className="px-4 py-1.5">
                        <input
                          value={item.description}
                          onChange={(e) => updateItem(item.id, { ...item, description: e.target.value })}
                          className="w-full text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-4 py-1.5 w-20">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, { ...item, quantity: Math.max(1, Number(e.target.value)) })}
                          className="w-full text-[13px] text-right text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-4 py-1.5 w-28">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, { ...item, unitPrice: Math.max(0, Number(e.target.value)) })}
                          className="w-full text-[13px] text-right text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-4 py-1.5 w-24 text-right">
                        <span className="text-[13px] font-semibold text-gray-800">{fmt(lineTotal(item))}</span>
                      </td>
                      <td className="py-1.5 pl-1 pr-3 w-8">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="flex size-6 items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="px-4 py-2.5 text-[13px] text-gray-700">{item.description}</td>
                      <td className="px-4 py-2.5 w-20 text-right text-[13px] text-gray-600 tabular-nums">{item.quantity.toLocaleString()}</td>
                      <td className="px-4 py-2.5 w-28 text-right text-[13px] text-gray-600 tabular-nums">{fmt(item.unitPrice)}</td>
                      <td className="px-4 py-2.5 w-24 text-right text-[13px] font-semibold text-gray-800 tabular-nums">{fmt(lineTotal(item))}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>

            {/* Add line item (edit mode) */}
            {editing && (
              <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <Plus className="size-3.5" />
                  Add Line Item
                </button>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="flex justify-end mt-3">
            <div className="w-56 space-y-1.5">
              <div className="flex justify-between text-[13px] text-gray-500">
                <span>Subtotal</span>
                <span className="tabular-nums">{fmt(total)}</span>
              </div>
              <div className="flex justify-between text-[13px] text-gray-400">
                <span>Tax</span>
                <span className="tabular-nums">—</span>
              </div>
              <div className="h-px bg-gray-200 my-1" />
              <div className="flex justify-between text-[15px] font-bold text-gray-900">
                <span>Total</span>
                <span className="tabular-nums">{fmt(total)}</span>
              </div>
              {isPaid && (
                <div className="flex justify-between text-[13px] text-green-600 font-semibold">
                  <span>Amount Paid</span>
                  <span className="tabular-nums">{fmt(total)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3.5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</p>
          {editing ? (
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((d) => d ? { ...d, notes: e.target.value } : d)}
              rows={2}
              placeholder="Add notes..."
              className="w-full text-[13px] text-gray-700 bg-white border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            />
          ) : (
            <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-line">
              {draft.notes || <span className="text-gray-400 italic">No notes.</span>}
            </p>
          )}
        </div>

        {/* ── Payment instructions (placeholder) ── */}
        {!isPaid && draft.status !== "Void" && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3.5">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1.5">Payment Instructions</p>
            <p className="text-[12px] text-blue-700 leading-relaxed">
              Please remit payment via ACH, wire transfer, or check made payable to <strong>Safir Logistics LLC</strong>.
              Reference invoice number <strong>{draft.invoiceNumber}</strong> in your payment details.
              Questions? Contact <strong>billing@safirlogs.com</strong>.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
