"use client"

import Image from "next/image"
import { useState } from "react"
import { Pencil, Download, Plus, Trash2, Box, CheckCircle, AlertCircle } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import type { Invoice, InvoiceLineItem, InvoiceStatus } from "@/lib/types"

const EDITABLE_STATUSES: InvoiceStatus[] = ["Unpaid", "Paid", "Overdue", "Void"]

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

function lineTotal(item: InvoiceLineItem) {
  return item.quantity * item.unitPrice
}

function invoiceTotal(items: InvoiceLineItem[]) {
  return items.reduce((s, i) => s + lineTotal(i), 0)
}

// ── Parse old description format into product + service ──────
// Old invoices stored "Service – Product (N units)" in the description field.
// New invoices have product_name and service_name stored separately.
function parseLineItem(item: InvoiceLineItem): { product: string; service: string } {
  if (item.productName || item.serviceName) {
    return { product: item.productName || "", service: item.serviceName || "" }
  }
  // Try to match: "Service – Product (N units)" or "Service – Product"
  const m = item.description.match(/^(.+?)\s*[–—\-]\s*(.+?)(?:\s*\(\d.*\))?$/)
  if (m) return { service: m[1].trim(), product: m[2].trim() }
  return { product: item.description, service: "" }
}

function escHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export type InvoiceCompanyInfo = {
  name:                string
  logoUrl:             string | null
  invoiceLogoUrl:      string | null
  address:             string | null
  email:               string | null
  phone:               string | null
  website:             string | null
  paymentInstructions: string | null
}

// ── PDF generation ────────────────────────────────────────────

export function buildInvoiceHtml(inv: Invoice, co: InvoiceCompanyInfo, mode: "print" | "pdf" = "print"): string {
  const logoSrc = co.invoiceLogoUrl || co.logoUrl
  const total   = invoiceTotal(inv.lineItems)

  const lineItemsHtml = inv.lineItems.map((item) => {
    const { product, service } = parseLineItem(item)
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#374151">${escHtml(product)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#6b7280">${escHtml(service)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;color:#374151">${item.quantity.toLocaleString()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;color:#374151">${fmt(item.unitPrice)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;font-weight:600;color:#111827">${fmt(lineTotal(item))}</td>
    </tr>`
  }).join("")

  const companyInfoHtml = [
    co.address ? `<p style="margin:2px 0;font-size:11px;color:#6b7280;white-space:pre-line">${escHtml(co.address)}</p>` : "",
    co.email   ? `<p style="margin:2px 0;font-size:11px;color:#6b7280">${escHtml(co.email)}</p>` : "",
    co.website ? `<p style="margin:2px 0;font-size:11px;color:#3b82f6">${escHtml(co.website)}</p>` : "",
  ].filter(Boolean).join("")

  const logoHtml = logoSrc
    ? `<img src="${escHtml(logoSrc)}" alt="${escHtml(co.name)}" style="max-height:56px;width:auto;object-fit:contain;margin-bottom:6px" />`
    : `<p style="font-size:18px;font-weight:700;color:#111827;margin:0 0 4px">${escHtml(co.name)}</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Invoice ${escHtml(inv.invoiceNumber)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111827; }
  @media print {
    @page { margin: 1.5cm; size: A4; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body style="padding:40px;max-width:800px;margin:0 auto">
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
    <div>
      ${logoHtml}
      ${companyInfoHtml}
    </div>
    <div style="text-align:right">
      <p style="font-size:26px;font-weight:700;letter-spacing:-0.5px;color:#111827">${escHtml(inv.invoiceNumber)}</p>
      <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:${inv.status === "Paid" ? "#f0fdf4" : "#fef3c7"};color:${inv.status === "Paid" ? "#15803d" : "#92400e"};border:1px solid ${inv.status === "Paid" ? "#bbf7d0" : "#fde68a"}">${escHtml(inv.status)}</span>
    </div>
  </div>

  <!-- Meta -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px">
    <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:14px">
      <p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Bill To</p>
      <p style="font-size:13px;font-weight:600;color:#111827">${escHtml(inv.clientName)}</p>
      ${inv.clientEmail ? `<p style="font-size:12px;color:#6b7280;margin-top:2px">${escHtml(inv.clientEmail)}</p>` : ""}
    </div>
    <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:14px">
      ${inv.relatedRequestNumber ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em">Service Request</span><span style="font-size:12px;font-family:monospace;color:#374151">${escHtml(inv.relatedRequestNumber)}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em">Invoice Date</span><span style="font-size:13px;color:#374151">${escHtml(inv.date)}</span></div>
      ${inv.dueDate ? `<div style="display:flex;justify-content:space-between"><span style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em">Due Date</span><span style="font-size:13px;color:${inv.status === "Overdue" ? "#dc2626" : "#374151"};font-weight:${inv.status === "Overdue" ? "600" : "400"}">${escHtml(inv.dueDate)}</span></div>` : ""}
    </div>
  </div>

  <!-- Line items -->
  <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
    <thead>
      <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
        <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em">Product</th>
        <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em">Service</th>
        <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;width:60px">QTY</th>
        <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;width:100px">Unit Price</th>
        <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;width:90px">Total</th>
      </tr>
    </thead>
    <tbody>${lineItemsHtml}</tbody>
  </table>

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;margin-top:16px">
    <div style="width:200px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;color:#6b7280">Subtotal</span><span style="font-size:13px;color:#6b7280">${fmt(total)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:13px;color:#9ca3af">Tax</span><span style="font-size:13px;color:#9ca3af">—</span></div>
      <div style="height:1px;background:#e5e7eb;margin:6px 0"></div>
      <div style="display:flex;justify-content:space-between"><span style="font-size:15px;font-weight:700;color:#111827">Total</span><span style="font-size:15px;font-weight:700;color:#111827">${fmt(total)}</span></div>
    </div>
  </div>

  ${inv.notes ? `<div style="margin-top:24px;background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:14px"><p style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Notes</p><p style="font-size:13px;color:#374151;white-space:pre-line">${escHtml(inv.notes)}</p></div>` : ""}
  ${co.paymentInstructions && inv.status !== "Paid" && inv.status !== "Void" && inv.status !== "Combined"
    ? `<div style="margin-top:20px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px"><p style="font-size:10px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Payment Instructions</p><p style="font-size:12px;color:#1d4ed8;white-space:pre-line">${escHtml(co.paymentInstructions)}</p></div>`
    : ""}

${mode === "print" ? `<script>window.onload=function(){setTimeout(function(){window.print();},200);}</script>` : ""}
</body>
</html>`
}

/* ── Main modal ─────────────────────────────────────────── */
type InvoiceModalProps = {
  invoice:      Invoice | null
  role:         "admin" | "client"
  onClose:      () => void
  onSave:       (updated: Invoice) => void | Promise<void>
  companyInfo?: InvoiceCompanyInfo
}

export function InvoiceModal({ invoice, role, onClose, onSave, companyInfo }: InvoiceModalProps) {
  const [editing,    setEditing]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState("")
  const [pdfError,   setPdfError]   = useState("")
  const [pdfLoading, setPdfLoading] = useState(false)
  const [draft, setDraft] = useState<Invoice | null>(
    () => invoice ? structuredClone(invoice) : null
  )
  const [prevInvoice, setPrevInvoice] = useState(invoice)

  if (prevInvoice !== invoice) {
    setPrevInvoice(invoice)
    setDraft(invoice ? structuredClone(invoice) : null)
    setEditing(false)
    setSaveError("")
    setPdfError("")
    setPdfLoading(false)
  }

  if (!invoice || !draft) return null

  const isAdmin    = role === "admin"
  const isCombined = draft.status === "Combined"
  const total      = invoiceTotal(draft.lineItems)

  const co: InvoiceCompanyInfo = companyInfo ?? {
    name: "Safir Logistics", logoUrl: null, invoiceLogoUrl: null,
    address: null, email: null, phone: null, website: null, paymentInstructions: null,
  }

  // Use invoice-specific logo first, then sidebar logo, then text fallback
  const displayLogoUrl = co.invoiceLogoUrl || co.logoUrl

  /* ── Line item helpers ── */
  function updateItem(id: string, patch: Partial<InvoiceLineItem>) {
    setDraft((d) => d ? { ...d, lineItems: d.lineItems.map((li) => li.id === id ? { ...li, ...patch } : li) } : d)
  }

  function removeItem(id: string) {
    setDraft((d) => d ? { ...d, lineItems: d.lineItems.filter((li) => li.id !== id) } : d)
  }

  function addItem() {
    const newItem: InvoiceLineItem = {
      id: `li${Date.now()}`, description: "", quantity: 1, unitPrice: 0, productName: "", serviceName: "",
    }
    setDraft((d) => d ? { ...d, lineItems: [...d.lineItems, newItem] } : d)
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true); setSaveError("")
    try { await onSave(draft); setEditing(false) }
    catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save invoice.") }
    finally { setSaving(false) }
  }

  function handleCancel() {
    setDraft(structuredClone(invoice)); setEditing(false); setSaveError("")
  }

  /* ── PDF download — server-side route, works on all devices ── */
  async function handleDownloadPdf() {
    if (!draft) return
    setPdfError("")
    setPdfLoading(true)
    try {
      const res = await fetch(`/api/invoices/${draft.id}/pdf`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        if (res.status === 403) throw new Error("You do not have access to this invoice.")
        throw new Error(json.error ?? "Unable to download invoice.")
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `invoice-${draft.invoiceNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Unable to download invoice.")
    } finally {
      setPdfLoading(false)
    }
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
        <div className="flex flex-col gap-2">
          {pdfError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
              <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
              <p className="text-[12px] text-red-600 leading-snug">{pdfError}</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isAdmin && !editing && !isCombined && (
                <button onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <Pencil className="size-3.5" /> Edit
                </button>
              )}
              {isAdmin && editing && (
                <>
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60">
                    <CheckCircle className="size-3.5" />
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button onClick={handleCancel} disabled={saving}
                    className="px-3 py-1.5 text-[13px] font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                  {saveError && (
                    <span className="flex items-center gap-1 text-[12px] text-red-600 ml-1">
                      <AlertCircle className="size-3.5 shrink-0" />{saveError}
                    </span>
                  )}
                </>
              )}
            </div>
            <button onClick={handleDownloadPdf} disabled={pdfLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60">
              <Download className="size-3.5" /> {pdfLoading ? "Generating…" : "Download PDF"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── Invoice header — company branding ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {displayLogoUrl ? (
              <Image src={displayLogoUrl} alt={co.name} width={56} height={56} unoptimized
                className="max-h-14 w-auto object-contain shrink-0" />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                <Box className="size-5 text-white" />
              </div>
            )}
            <div className="min-w-0">
              {!displayLogoUrl && (
                <p className="text-[15px] font-bold text-gray-900 leading-tight">{co.name}</p>
              )}
              {co.address && <p className="text-[11px] text-gray-400 mt-0.5 whitespace-pre-line leading-snug">{co.address}</p>}
              {co.email   && <p className="text-[11px] text-gray-400 mt-0.5">{co.email}</p>}
              {co.website && <p className="text-[11px] text-blue-500">{co.website}</p>}
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-[22px] font-bold text-gray-900 tracking-tight">{draft.invoiceNumber}</p>
            <div className="mt-1"><StatusBadge status={draft.status} /></div>
          </div>
        </div>

        {/* ── Meta grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Bill To</p>
            <p className="text-[13px] font-semibold text-gray-900">{draft.clientName}</p>
            <p className="text-[12px] text-gray-500 mt-0.5">{draft.clientEmail}</p>
            {draft.clientAddress && (
              <p className="text-[12px] text-gray-400 mt-1 whitespace-pre-line leading-relaxed">{draft.clientAddress}</p>
            )}
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3.5 space-y-2">
            {draft.relatedRequestNumber && (
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service Request</span>
                <span className="font-mono text-[12px] text-gray-700">{draft.relatedRequestNumber}</span>
              </div>
            )}
            {draft.combinedIntoInvoiceId && (
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Merged Into</span>
                <span className="text-[12px] text-violet-600 font-semibold">Combined Invoice</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Invoice Date</span>
              <span className="text-[13px] text-gray-700">{draft.date}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Due Date</span>
              {editing ? (
                <input value={draft.dueDate}
                  onChange={(e) => setDraft((d) => d ? { ...d, dueDate: e.target.value } : d)}
                  className="text-[13px] text-gray-800 bg-white border border-gray-200 rounded px-2 py-0.5 w-36 text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
              ) : (
                <span className={cn("text-[13px] font-medium", draft.status === "Overdue" ? "text-red-600" : "text-gray-700")}>
                  {draft.dueDate}
                </span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</span>
              {editing ? (
                <select value={draft.status}
                  onChange={(e) => setDraft((d) => d ? { ...d, status: e.target.value as InvoiceStatus } : d)}
                  className="text-[12px] text-gray-800 bg-white border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400">
                  {EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <StatusBadge status={draft.status} />
              )}
            </div>
          </div>
        </div>

        {/* ── Line items: Product / Service / QTY / Unit Price / Total ── */}
        <div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Service</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-16">QTY</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-28">Unit Price</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Total</th>
                  {editing && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {draft.lineItems.map((item) => {
                  const { product, service } = parseLineItem(item)
                  return editing ? (
                    <tr key={item.id} className="border-b border-gray-100 group">
                      <td className="px-4 py-1.5">
                        <input value={item.productName ?? product}
                          onChange={(e) => updateItem(item.id, { productName: e.target.value, description: e.target.value })}
                          placeholder="Product name"
                          className="w-full text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-300" />
                      </td>
                      <td className="px-4 py-1.5">
                        <input value={item.serviceName ?? service}
                          onChange={(e) => updateItem(item.id, { serviceName: e.target.value })}
                          placeholder="Service name"
                          className="w-full text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-300" />
                      </td>
                      <td className="px-4 py-1.5 w-16">
                        <input type="number" min={1} value={item.quantity}
                          onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value)) })}
                          className="w-full text-[13px] text-right text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </td>
                      <td className="px-4 py-1.5 w-28">
                        <input type="number" min={0} step={0.01} value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, { unitPrice: Math.max(0, Number(e.target.value)) })}
                          className="w-full text-[13px] text-right text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </td>
                      <td className="px-4 py-1.5 w-24 text-right">
                        <span className="text-[13px] font-semibold text-gray-800">{fmt(lineTotal(item))}</span>
                      </td>
                      <td className="py-1.5 pl-1 pr-3 w-8">
                        <button type="button" onClick={() => removeItem(item.id)}
                          className="flex size-6 items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="px-4 py-2.5 text-[13px] text-gray-700">{product || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-[12px] text-gray-500">{service || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5 w-16 text-right text-[13px] text-gray-600 tabular-nums">{item.quantity.toLocaleString()}</td>
                      <td className="px-4 py-2.5 w-28 text-right text-[13px] text-gray-600 tabular-nums">{fmt(item.unitPrice)}</td>
                      <td className="px-4 py-2.5 w-24 text-right text-[13px] font-semibold text-gray-800 tabular-nums">{fmt(lineTotal(item))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {editing && (
              <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                <button type="button" onClick={addItem}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors">
                  <Plus className="size-3.5" /> Add Line Item
                </button>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="flex justify-end mt-3">
            <div className="w-56 space-y-1.5">
              <div className="flex justify-between text-[13px] text-gray-500">
                <span>Subtotal</span><span className="tabular-nums">{fmt(total)}</span>
              </div>
              <div className="flex justify-between text-[13px] text-gray-400">
                <span>Tax</span><span className="tabular-nums">—</span>
              </div>
              <div className="h-px bg-gray-200 my-1" />
              <div className="flex justify-between text-[15px] font-bold text-gray-900">
                <span>Total</span><span className="tabular-nums">{fmt(total)}</span>
              </div>
              {isPaid && (
                <div className="flex justify-between text-[13px] text-green-600 font-semibold">
                  <span>Amount Paid</span><span className="tabular-nums">{fmt(total)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        {(draft.notes || editing) && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</p>
            {editing ? (
              <textarea value={draft.notes}
                onChange={(e) => setDraft((d) => d ? { ...d, notes: e.target.value } : d)}
                rows={2} placeholder="Add notes…"
                className="w-full text-[13px] text-gray-700 bg-white border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
            ) : (
              <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-line">{draft.notes}</p>
            )}
          </div>
        )}

        {/* ── Payment instructions ── */}
        {!isPaid && draft.status !== "Void" && draft.status !== "Combined" && co.paymentInstructions && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3.5">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1.5">Payment Instructions</p>
            <p className="text-[12px] text-blue-700 leading-relaxed whitespace-pre-line">{co.paymentInstructions}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
