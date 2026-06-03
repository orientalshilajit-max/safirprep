"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import type { Invoice, InvoiceStatus, InvoiceLineItem } from "@/lib/types"

// ── Status mapping ────────────────────────────────────────────

const TO_DB: Record<InvoiceStatus, string> = {
  Unpaid:   "unpaid",
  Paid:     "paid",
  Overdue:  "overdue",
  Void:     "void",
  Combined: "combined",
}

const FROM_DB: Record<string, InvoiceStatus> = {
  unpaid:   "Unpaid",
  paid:     "Paid",
  overdue:  "Overdue",
  void:     "Void",
  combined: "Combined",
}

// ── Row type ──────────────────────────────────────────────────

type DbLineItem = {
  id:           string
  description:  string
  quantity:     number
  unit_price:   number | string
  product_name: string | null
  service_name: string | null
}

type DbInvoiceRow = {
  id:                        string
  client_id:                 string
  request_id:                string | null
  invoice_number:            string
  status:                    string
  amount:                    number
  due_date:                  string | null
  notes:                     string | null
  created_at:                string
  combined_into_invoice_id:  string | null
  clients:                   { company_name: string; email: string } | null
  invoice_items:             DbLineItem[]
  service_requests:          { request_number: string } | null
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
    clientAddress:  "",
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
      productName: li.product_name ?? undefined,
      serviceName: li.service_name ?? undefined,
    })),
    notes:                   row.notes ?? "",
    relatedRequestNumber:    row.service_requests?.request_number ?? undefined,
    combinedIntoInvoiceId:   row.combined_into_invoice_id ?? undefined,
    createdAt:               row.created_at,
  }
}

const INVOICE_SELECT = `
  id, client_id, request_id, invoice_number, status, amount, due_date, notes, created_at,
  combined_into_invoice_id,
  clients (company_name, email),
  invoice_items (id, description, quantity, unit_price, product_name, service_name),
  service_requests (request_number)
` as const

// ── Date helper ───────────────────────────────────────────────

function toIsoDate(str: string): string | null {
  if (!str) return null
  const d = new Date(str)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split("T")[0]
}

// ── Type alias for invoice_items inserts ─────────────────────
// product_name / service_name were added in migration 20260602000001.
// Until Supabase types are regenerated after applying the migration, cast inserts
// to the known columns so RejectExcessProperties doesn't block compilation.
// The JS client still serialises all runtime keys, so the new columns are saved.
type InvoiceItemInsert = {
  invoice_id:  string
  description: string
  quantity:    number
  unit_price:  number
}

// ── Auth helpers ──────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "admin") throw new Error("Admin only.")
  return { supabase, user }
}

// ── Invoice number generator ──────────────────────────────────

async function nextInvoiceNumber(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: recent } = await supabase
    .from("invoices")
    .select("invoice_number")
    .order("created_at", { ascending: false })
    .limit(50)
  let maxNum = 41
  for (const row of recent ?? []) {
    const n = parseInt(row.invoice_number.replace("INV-", "")) || 0
    if (n > maxNum) maxNum = n
  }
  return `INV-${(maxNum + 1).toString().padStart(4, "0")}`
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

type CreateInput = {
  clientId:   string
  requestId?: string | null
  lineItems:  { description: string; quantity: number; unitPrice: number; productName?: string; serviceName?: string }[]
  dueDate?:   string
  notes?:     string
}

export async function createInvoice(input: CreateInput): Promise<Invoice> {
  const { supabase } = await requireAdmin()
  const invoiceNumber = await nextInvoiceNumber(supabase)
  const amount        = input.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const dueDateIso    = toIsoDate(input.dueDate ?? "")

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
      input.lineItems.map((li) => {
        const row: InvoiceItemInsert = {
          invoice_id:  inv.id,
          description: li.productName || li.description,
          quantity:    li.quantity,
          unit_price:  li.unitPrice,
        }
        // Assign new columns at runtime without TypeScript type widening
        const r = row as Record<string, unknown>
        r.product_name = li.productName ?? null
        r.service_name = li.serviceName ?? null
        return row
      })
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

type UpdateInput = {
  status:    InvoiceStatus
  dueDate:   string
  notes:     string
  lineItems: InvoiceLineItem[]
}

export async function updateInvoice(id: string, input: UpdateInput): Promise<Invoice> {
  const { supabase } = await requireAdmin()
  const amount     = input.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const dueDateIso = toIsoDate(input.dueDate)

  const { error: uErr } = await supabase
    .from("invoices")
    .update({
      status:   TO_DB[input.status] as "unpaid" | "paid" | "overdue" | "void",
      due_date: dueDateIso,
      notes:    input.notes.trim() || null,
      amount,
    })
    .eq("id", id)
  if (uErr) throw new Error(uErr.message)

  const { error: dErr } = await supabase.from("invoice_items").delete().eq("invoice_id", id)
  if (dErr) throw new Error(dErr.message)

  if (input.lineItems.length > 0) {
    const { error: insErr } = await supabase.from("invoice_items").insert(
      input.lineItems.map((li) => {
        const row: InvoiceItemInsert = {
          invoice_id:  id,
          description: li.productName || li.description,
          quantity:    li.quantity,
          unit_price:  li.unitPrice,
        }
        const r = row as Record<string, unknown>
        r.product_name = li.productName ?? null
        r.service_name = li.serviceName ?? null
        return row
      })
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

// ── updateInvoiceStatus ───────────────────────────────────────

export async function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from("invoices")
    .update({ status: TO_DB[status] as "unpaid" | "paid" | "overdue" | "void" })
    .eq("id", id)
  if (error) throw new Error(error.message)

  const { data, error: fErr } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(data as unknown as DbInvoiceRow)
}

// ── combineInvoices ───────────────────────────────────────────

export async function combineInvoices(invoiceIds: string[]): Promise<Invoice> {
  if (invoiceIds.length < 2) throw new Error("Select at least 2 invoices to combine.")

  const { supabase } = await requireAdmin()

  // Load the selected invoices
  const { data: rows, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .in("id", invoiceIds)
  if (error) throw new Error(error.message)

  const selected = (rows ?? []).map((r) => mapRow(r as unknown as DbInvoiceRow))
  if (selected.length !== invoiceIds.length) throw new Error("One or more invoices could not be found.")

  // Validate: all same client
  const clientIds = [...new Set(selected.map((inv) => inv.clientId))]
  if (clientIds.length > 1) throw new Error("Only invoices from the same client can be combined.")

  // Validate: none are Paid, Void, or already Combined
  const blocked = selected.filter((inv) => ["Paid", "Void", "Combined"].includes(inv.status))
  if (blocked.length > 0) {
    throw new Error(
      `Cannot combine Paid, Void, or already Combined invoices: ${blocked.map((i) => i.invoiceNumber).join(", ")}`
    )
  }

  const clientId       = clientIds[0]
  const allLineItems   = selected.flatMap((inv) => inv.lineItems)
  const amount         = allLineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0)
  const invoiceNumbers = selected.map((inv) => inv.invoiceNumber).sort().join(", ")
  const dueDateIso     = new Date(Date.now() + 14 * 86_400_000).toISOString().split("T")[0]
  const invoiceNumber  = await nextInvoiceNumber(supabase)

  const { data: newInv, error: createErr } = await supabase
    .from("invoices")
    .insert({
      client_id:      clientId,
      invoice_number: invoiceNumber,
      status:         "unpaid",
      amount,
      due_date:       dueDateIso,
      notes:          `Combined invoice from ${invoiceNumbers}`,
    })
    .select("id")
    .single()
  if (createErr) throw new Error(createErr.message)

  if (allLineItems.length > 0) {
    const { error: liErr } = await supabase.from("invoice_items").insert(
      allLineItems.map((li) => {
        const row: InvoiceItemInsert = {
          invoice_id:  newInv.id,
          description: li.productName || li.description,
          quantity:    li.quantity,
          unit_price:  li.unitPrice,
        }
        const r = row as Record<string, unknown>
        r.product_name = li.productName ?? null
        r.service_name = li.serviceName ?? null
        return row
      })
    )
    if (liErr) throw new Error(liErr.message)
  }

  // Mark old invoices as combined — new columns cast until types regenerated
  const { error: voidErr } = await supabase
    .from("invoices")
    .update({
      status: "combined" as "unpaid" | "paid" | "overdue" | "void",
      ...({ combined_into_invoice_id: newInv.id } as object),
    })
    .in("id", invoiceIds)
  if (voidErr) throw new Error(voidErr.message)

  const { data: full, error: fErr } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", newInv.id)
    .single()
  if (fErr) throw new Error(fErr.message)
  return mapRow(full as unknown as DbInvoiceRow)
}
