"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import type { Invoice, InvoiceStatus, InvoiceLineItem } from "@/lib/types"

// ── Status mapping ────────────────────────────────────────────

const TO_DB: Record<InvoiceStatus, "unpaid" | "paid" | "overdue" | "void"> = {
  Unpaid:  "unpaid",
  Paid:    "paid",
  Overdue: "overdue",
  Void:    "void",
}

const FROM_DB: Record<string, InvoiceStatus> = {
  unpaid:  "Unpaid",
  paid:    "Paid",
  overdue: "Overdue",
  void:    "Void",
}

// ── Row type ──────────────────────────────────────────────────

type DbInvoiceRow = {
  id:             string
  client_id:      string
  request_id:     string | null
  invoice_number: string
  status:         string
  amount:         number
  due_date:       string | null
  notes:          string | null
  created_at:     string
  clients:              { company_name: string; email: string } | null
  invoice_items:        { id: string; description: string; quantity: number; unit_price: number | string }[]
  service_requests:     { request_number: string } | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

function mapRow(row: DbInvoiceRow): Invoice {
  return {
    id:             row.id,
    invoiceNumber:  row.invoice_number,
    clientId:       row.client_id,
    clientName:     row.clients?.company_name ?? "",
    clientEmail:    row.clients?.email         ?? "",
    clientAddress:  "",   // clients table has no address field — left blank
    date:           fmtDate(row.created_at),
    dueDate:        row.due_date ? fmtDate(row.due_date) : "",
    status:         FROM_DB[row.status] ?? "Unpaid",
    lineItems:      (row.invoice_items ?? []).map((li) => ({
      id:          li.id,
      description: li.description,
      quantity:    li.quantity,
      unitPrice:   typeof li.unit_price === "string"
                     ? parseFloat(li.unit_price)
                     : li.unit_price,
    })),
    notes:                    row.notes ?? "",
    relatedRequestNumber:     row.service_requests?.request_number ?? undefined,
    createdAt:                row.created_at,
  }
}

const INVOICE_SELECT = `
  id, client_id, request_id, invoice_number, status, amount, due_date, notes, created_at,
  clients (company_name, email),
  invoice_items (id, description, quantity, unit_price),
  service_requests (request_number)
` as const

// ── Date helper ───────────────────────────────────────────────
// Converts a locale display string ("Jun 5, 2026") or ISO string to
// a DB-safe date string ("2026-06-05"), or null if unparseable.

function toIsoDate(str: string): string | null {
  if (!str) return null
  const d = new Date(str)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split("T")[0]
}

// ── listInvoices ──────────────────────────────────────────────

export async function listInvoices(): Promise<Invoice[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => mapRow(r as unknown as DbInvoiceRow))
}

// ── createInvoice ─────────────────────────────────────────────
// Admin-only. Called when admin marks a service request as Invoiced,
// or when creating a manual invoice (future).

type CreateInput = {
  clientId:   string
  requestId?: string | null
  lineItems:  { description: string; quantity: number; unitPrice: number }[]
  dueDate?:   string
  notes?:     string
}

export async function createInvoice(input: CreateInput): Promise<Invoice> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "admin") throw new Error("Admin only.")

  // Generate the next invoice number
  const { data: recent } = await supabase
    .from("invoices")
    .select("invoice_number")
    .order("created_at", { ascending: false })
    .limit(20)

  let maxNum = 41
  for (const row of recent ?? []) {
    const n = parseInt(row.invoice_number.replace("INV-", "")) || 0
    if (n > maxNum) maxNum = n
  }
  const invoiceNumber = `INV-${(maxNum + 1).toString().padStart(4, "0")}`

  const amount     = input.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const dueDateIso = toIsoDate(input.dueDate ?? "")

  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .insert({
      client_id:      input.clientId,
      request_id:     input.requestId ?? null,
      invoice_number: invoiceNumber,
      status:         "unpaid",
      amount,
      due_date:       dueDateIso,
      notes:          input.notes?.trim() || null,
    })
    .select("id")
    .single()
  if (iErr) throw new Error(iErr.message)

  if (input.lineItems.length > 0) {
    const { error: liErr } = await supabase.from("invoice_items").insert(
      input.lineItems.map((li) => ({
        invoice_id:  inv.id,
        description: li.description,
        quantity:    li.quantity,
        unit_price:  li.unitPrice,
      }))
    )
    if (liErr) throw new Error(liErr.message)
  }

  const { data: full, error: fErr } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", inv.id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(full as unknown as DbInvoiceRow)
}

// ── updateInvoice ─────────────────────────────────────────────
// Admin-only. Replaces status, due date, notes, and all line items.

type UpdateInput = {
  status:    InvoiceStatus
  dueDate:   string
  notes:     string
  lineItems: InvoiceLineItem[]
}

export async function updateInvoice(id: string, input: UpdateInput): Promise<Invoice> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "admin") throw new Error("Admin only.")

  const amount     = input.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const dueDateIso = toIsoDate(input.dueDate)

  const { error: uErr } = await supabase
    .from("invoices")
    .update({
      status:   TO_DB[input.status],
      due_date: dueDateIso,
      notes:    input.notes.trim() || null,
      amount,
    })
    .eq("id", id)
  if (uErr) throw new Error(uErr.message)

  // Replace line items: delete all then re-insert
  const { error: dErr } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id)
  if (dErr) throw new Error(dErr.message)

  if (input.lineItems.length > 0) {
    const { error: insErr } = await supabase.from("invoice_items").insert(
      input.lineItems.map((li) => ({
        invoice_id:  id,
        description: li.description,
        quantity:    li.quantity,
        unit_price:  li.unitPrice,
      }))
    )
    if (insErr) throw new Error(insErr.message)
  }

  const { data: full, error: fErr } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(full as unknown as DbInvoiceRow)
}
