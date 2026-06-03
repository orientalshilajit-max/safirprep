import { type NextRequest } from "next/server"
import { jsPDF } from "jspdf"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createServerAdminClient } from "@/lib/supabase"

// ── Local DB row types ────────────────────────────────────────

type InvRow = {
  id:             string
  client_id:      string
  invoice_number: string
  status:         string
  due_date:       string | null
  notes:          string | null
  created_at:     string
  clients:        { company_name: string; email: string } | null
  invoice_items:  {
    description:  string
    quantity:     number
    unit_price:   number | string
    product_name: string | null
    service_name: string | null
  }[]
  service_requests: { request_number: string } | null
}

// invoice_logo_url and invoice_payment_notes were added in later migrations
// and are not yet in the generated Database types — access via cast.
type CsRow = {
  company_name:          string
  address:               string | null
  email:                 string | null
  website:               string | null
  logo_url:              string | null
  invoice_logo_url:      string | null  // migration 20260602000002
  invoice_payment_notes: string | null
}

// ── PDF builder ───────────────────────────────────────────────

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

async function fetchImageAsDataUrl(url: string): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const mime = res.headers.get("content-type") ?? ""
    const format: "PNG" | "JPEG" = mime.includes("png") ? "PNG" : "JPEG"
    const buf = await res.arrayBuffer()
    const b64 = Buffer.from(buf).toString("base64")
    return { dataUrl: `data:${mime};base64,${b64}`, format }
  } catch {
    return null
  }
}

async function buildPdf(inv: InvRow, cs: CsRow | null): Promise<ArrayBuffer> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })

  const L  = 20   // left margin x
  const R  = 190  // right edge x
  const W  = 170  // usable width
  let   y  = 20   // current y cursor

  // ── Colour helpers ──────────────────────────────────────────
  type RGB = [number, number, number]
  const DARK:   RGB = [17,  24,  39]
  const GRAY:   RGB = [107, 114, 128]
  const LGRAY:  RGB = [156, 163, 175]
  const BLUE:   RGB = [59,  130, 246]
  const BGGRAY: RGB = [249, 250, 251]
  const BORDER: RGB = [229, 231, 235]

  const tc = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const dc = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])
  const fc = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])

  // ── 1. Header: logo / company name + invoice number ─────────
  const logoUrl = cs?.invoice_logo_url ?? cs?.logo_url ?? null
  let logoH = 0

  if (logoUrl) {
    const img = await fetchImageAsDataUrl(logoUrl)
    if (img) {
      doc.addImage(img.dataUrl, img.format, L, y, 50, 14)
      logoH = 17
    }
  }

  if (!logoH) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(15)
    tc(DARK)
    doc.text(cs?.company_name ?? "Invoice", L, y + 8)
    logoH = 12
  }

  // Invoice number (top-right)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  tc(DARK)
  doc.text(inv.invoice_number, R, y + 8, { align: "right" })

  // Status pill (below invoice number)
  const isPaid   = inv.status === "paid"
  const isVoid   = inv.status === "void"
  const pillBg:   RGB = isPaid ? [240, 253, 244] : isVoid ? [243, 244, 246] : [255, 251, 235]
  const pillTxt:  RGB = isPaid ? [21,  128, 61]  : isVoid ? [75,  85,  99]  : [146, 64,  14]
  const pillBd:   RGB = isPaid ? [187, 247, 208] : isVoid ? [209, 213, 219] : [253, 230, 138]
  const statusLabel = inv.status.charAt(0).toUpperCase() + inv.status.slice(1)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  const pillW = doc.getTextWidth(statusLabel) + 8
  const pillX = R - pillW
  const pillY = y + 12
  fc(pillBg); dc(pillBd)
  doc.roundedRect(pillX, pillY, pillW, 5.5, 2, 2, "FD")
  tc(pillTxt)
  doc.text(statusLabel, pillX + pillW / 2, pillY + 3.8, { align: "center" })

  y += logoH

  // ── 2. Company contact info ──────────────────────────────────
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)

  if (cs?.address) {
    tc(GRAY)
    for (const line of cs.address.split("\n")) {
      const t = line.trim()
      if (t) { doc.text(t, L, y); y += 4 }
    }
  }
  if (cs?.email)   { tc(GRAY); doc.text(cs.email,   L, y); y += 4 }
  if (cs?.website) { tc(BLUE); doc.text(cs.website, L, y); y += 4 }

  y += 4

  // ── 3. Divider ───────────────────────────────────────────────
  dc(BORDER); doc.setLineWidth(0.3)
  doc.line(L, y, R, y)
  y += 8

  // ── 4. Meta grid: Bill To (left) | Invoice details (right) ──
  const col2X    = L + W / 2 + 10
  const metaTopY = y

  // Left: Bill To
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); tc(LGRAY)
  doc.text("BILL TO", L, y)
  y += 5

  const client = inv.clients
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); tc(DARK)
  doc.text(client?.company_name ?? "—", L, y)
  y += 5

  if (client?.email) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); tc(GRAY)
    doc.text(client.email, L, y)
    y += 4
  }

  // Right: invoice details (aligned to metaTopY)
  const sr = inv.service_requests
  const pairs: [string, string][] = []
  if (sr?.request_number) pairs.push(["SERVICE REQUEST", sr.request_number])
  pairs.push(["INVOICE DATE", fmtDate(inv.created_at)])
  if (inv.due_date) pairs.push(["DUE DATE", fmtDate(inv.due_date)])

  let ry = metaTopY
  for (const [label, value] of pairs) {
    doc.setFont("helvetica", "bold");  doc.setFontSize(8);  tc(LGRAY)
    doc.text(label, col2X, ry)
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); tc(DARK)
    doc.text(value, R, ry, { align: "right" })
    ry += 6
  }

  y = Math.max(y, ry) + 4

  // ── 5. Divider ───────────────────────────────────────────────
  dc(BORDER)
  doc.line(L, y, R, y)
  y += 6

  // ── 6. Line-items table ──────────────────────────────────────
  // Column layout (total = W = 170mm)
  const COL = {
    product:   { x: L,        w: 58 },
    service:   { x: L + 58,   w: 48 },
    qty:       { x: L + 106,  w: 18 },
    unitPrice: { x: L + 124,  w: 28 },
    total:     { x: L + 152,  w: 18 },
  } as const

  // Header row
  const tHdrH = 8
  fc(BGGRAY); dc(BORDER); doc.setLineWidth(0.3)
  doc.rect(L, y, W, tHdrH, "FD")

  doc.setFont("helvetica", "bold"); doc.setFontSize(8); tc(GRAY)
  doc.text("PRODUCT",    COL.product.x   + 2,                 y + 5.5)
  doc.text("SERVICE",    COL.service.x   + 2,                 y + 5.5)
  doc.text("QTY",        COL.qty.x       + COL.qty.w,        y + 5.5, { align: "right" })
  doc.text("UNIT PRICE", COL.unitPrice.x + COL.unitPrice.w,  y + 5.5, { align: "right" })
  doc.text("TOTAL",      COL.total.x     + COL.total.w,      y + 5.5, { align: "right" })
  y += tHdrH

  // Data rows
  const rowH = 7
  for (const item of inv.invoice_items) {
    const unitP     = typeof item.unit_price === "string" ? parseFloat(item.unit_price) : item.unit_price
    const rowTotal  = item.quantity * unitP
    const product   = item.product_name || item.description || ""
    const service   = item.service_name ?? ""

    // Row bottom separator
    dc(BORDER); doc.setLineWidth(0.2)
    doc.line(L, y + rowH, R, y + rowH)

    const prodText = doc.splitTextToSize(product, COL.product.w - 3)[0] ?? ""
    const svcText  = doc.splitTextToSize(service,  COL.service.w - 3)[0] ?? ""

    doc.setFont("helvetica", "normal"); doc.setFontSize(10); tc(DARK)
    doc.text(prodText, COL.product.x + 2, y + 5)

    doc.setFontSize(9); tc(GRAY)
    doc.text(svcText, COL.service.x + 2, y + 5)

    doc.setFontSize(10); tc(DARK)
    doc.text(item.quantity.toLocaleString(), COL.qty.x + COL.qty.w, y + 5, { align: "right" })
    doc.text(USD.format(unitP),              COL.unitPrice.x + COL.unitPrice.w, y + 5, { align: "right" })
    doc.setFont("helvetica", "bold")
    doc.text(USD.format(rowTotal),           COL.total.x + COL.total.w, y + 5, { align: "right" })

    y += rowH
  }

  // Table bottom border
  dc(BORDER); doc.setLineWidth(0.3)
  doc.line(L, y, R, y)
  y += 8

  // ── 7. Totals ────────────────────────────────────────────────
  const grandTotal = inv.invoice_items.reduce((s, item) => {
    const p = typeof item.unit_price === "string" ? parseFloat(item.unit_price) : item.unit_price
    return s + item.quantity * p
  }, 0)

  const totX = R - 65

  doc.setFont("helvetica", "normal"); doc.setFontSize(10); tc(GRAY)
  doc.text("Subtotal", totX, y)
  doc.text(USD.format(grandTotal), R, y, { align: "right" })
  y += 5

  tc(LGRAY)
  doc.text("Tax", totX, y)
  doc.text("—", R, y, { align: "right" })
  y += 4

  dc(BORDER); doc.setLineWidth(0.3)
  doc.line(totX, y, R, y)
  y += 5

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); tc(DARK)
  doc.text("Total", totX, y)
  doc.text(USD.format(grandTotal), R, y, { align: "right" })
  y += 10

  // ── 8. Notes ─────────────────────────────────────────────────
  if (inv.notes?.trim()) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); tc(LGRAY)
    doc.text("NOTES", L, y)
    y += 5
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); tc(DARK)
    for (const line of doc.splitTextToSize(inv.notes.trim(), W)) {
      doc.text(line as string, L, y); y += 5
    }
    y += 4
  }

  // ── 9. Payment instructions ───────────────────────────────────
  const payNotes = cs?.invoice_payment_notes ?? null
  const showPay  = payNotes && !["paid", "void", "combined"].includes(inv.status)
  if (showPay) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); tc(BLUE)
    doc.text("PAYMENT INSTRUCTIONS", L, y)
    y += 5
    doc.setFont("helvetica", "normal"); doc.setFontSize(10)
    doc.setTextColor(29, 78, 216)
    for (const line of doc.splitTextToSize(payNotes!, W)) {
      doc.text(line as string, L, y); y += 5
    }
  }

  return doc.output("arraybuffer")
}

// ── Route handler ─────────────────────────────────────────────

type Ctx = { params: Promise<{ id: string }> }

function jsonErr(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params

  // ── Auth ──────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (!user || authErr) return jsonErr("Unauthorized", 401)

  const isAdmin      = user.app_metadata?.role === "admin"
  const userClientId = user.app_metadata?.client_id as string | undefined

  // ── Fetch invoice (admin client bypasses RLS; we check manually) ──
  const admin = createServerAdminClient()

  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .select(`
      id, client_id, invoice_number, status, due_date, notes, created_at,
      clients (company_name, email),
      invoice_items (description, quantity, unit_price, product_name, service_name),
      service_requests (request_number)
    `)
    .eq("id", id)
    .single()

  if (invErr || !inv) return jsonErr("Invoice not found", 404)

  // ── Permission check ──────────────────────────────────────
  if (!isAdmin && inv.client_id !== userClientId) {
    return jsonErr("You do not have access to this invoice.", 403)
  }

  // ── Company settings ──────────────────────────────────────
  const { data: cs } = await admin
    .from("company_settings")
    .select("company_name, address, email, website, logo_url, invoice_logo_url, invoice_payment_notes")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // ── Generate PDF ──────────────────────────────────────────
  try {
    const pdfBuf = await buildPdf(inv as unknown as InvRow, cs as unknown as CsRow | null)
    return new Response(pdfBuf, {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${inv.invoice_number}.pdf"`,
        "Cache-Control":       "no-store",
      },
    })
  } catch (err) {
    console.error("[GET /api/invoices/[id]/pdf] generation failed", { id, error: err })
    return jsonErr("PDF generation failed.", 500)
  }
}
