"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createServerAdminClient }    from "@/lib/supabase"
import type {
  SupportTicket, TicketMessage, TicketCategory, TicketStatus, TicketAttachment,
} from "@/lib/types"

// ── Email helper (Resend – graceful fallback) ─────────────────

async function sendSupportEmail(opts: {
  to: string
  subject: string
  html: string
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey   = process.env.RESEND_API_KEY
  const fromAddr = process.env.EMAIL_FROM ?? "support@noreply.safir"
  if (!apiKey) return { sent: false, error: "not-configured" }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddr, to: opts.to, subject: opts.subject, html: opts.html }),
    })
    if (!res.ok) return { sent: false, error: await res.text() }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: String(err) }
  }
}

function emailHtml(title: string, body: string, ticketNumber: string, subject: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const link   = appUrl ? `${appUrl}/help` : ""
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px;color:#111">${title}</h2>
      <p style="color:#6b7280;margin:0 0 16px">Ticket: <strong>${ticketNumber}</strong> – ${subject}</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;white-space:pre-wrap;color:#374151">${body}</div>
      ${link ? `<p style="margin-top:16px"><a href="${link}" style="color:#2563eb">View in app →</a></p>` : ""}
    </div>`
}

// ── Auth helpers ──────────────────────────────────────────────

async function getAuthContext() {
  const supabaseTyped = await createSupabaseServerClient()
  const { data: { user } } = await supabaseTyped.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const isAdmin  = user.app_metadata?.role === "admin"
  const clientId = user.app_metadata?.client_id as string | undefined
  // Cast to any because support_tickets / support_ticket_messages are new tables
  // not yet present in the generated Supabase TypeScript types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseTyped as any
  return { supabase, user, isAdmin, clientId }
}

// ── Row mappers ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTicket(row: any): SupportTicket {
  return {
    id:           row.id,
    ticketNumber: row.ticket_number,
    clientId:     row.client_id,
    clientName:   row.clients?.company_name ?? "",
    subject:      row.subject,
    category:     row.category as TicketCategory,
    status:       row.status   as TicketStatus,
    assignedTo:   row.assigned_to ?? null,
    createdBy:    row.created_by,
    archivedAt:   row.archived_at ?? null,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    messageCount: row.message_count ?? 0,
  }
}

async function resolveAttachmentUrls(
  attachments: TicketAttachment[] | null,
): Promise<TicketAttachment[]> {
  if (!attachments || attachments.length === 0) return []
  const admin = createServerAdminClient()
  return Promise.all(
    attachments.map(async (att) => {
      const { data } = await admin.storage
        .from("support-attachments")
        .createSignedUrl(att.path, 3600)
      return { ...att, url: data?.signedUrl ?? "" }
    }),
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mapMessage(row: any, clientName: string): Promise<TicketMessage> {
  const attachments = await resolveAttachmentUrls(
    (row.attachments as TicketAttachment[] | null) ?? [],
  )
  return {
    id:            row.id,
    ticketId:      row.ticket_id,
    senderUserId:  row.sender_user_id,
    senderRole:    row.sender_role as "admin" | "client",
    senderName:    row.sender_role === "admin" ? "Support Team" : clientName,
    message:       row.message,
    attachments,
    createdAt:     row.created_at,
  }
}

// ── listTickets ───────────────────────────────────────────────

export async function listTickets(archived = false): Promise<SupportTicket[]> {
  const { supabase } = await getAuthContext()
  const { data, error } = await supabase
    .from("support_tickets")
    .select(`
      id, ticket_number, client_id, subject, category, status, assigned_to,
      created_by, archived_at, created_at, updated_at,
      clients (company_name),
      message_count:support_ticket_messages(count)
    `)
    .is("archived_at", archived ? null : null) // always fetch; filter below
    .order("updated_at", { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((r: any) => archived ? r.archived_at != null : r.archived_at == null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => ({
      ...mapTicket(r),
      messageCount: Array.isArray(r.message_count) ? (r.message_count[0]?.count ?? 0) : 0,
    }))
}

// ── getTicketWithMessages ─────────────────────────────────────

export async function getTicketWithMessages(
  ticketId: string,
): Promise<{ ticket: SupportTicket; messages: TicketMessage[] }> {
  const { supabase } = await getAuthContext()

  const { data: tRow, error: tErr } = await supabase
    .from("support_tickets")
    .select(`
      id, ticket_number, client_id, subject, category, status, assigned_to,
      created_by, archived_at, created_at, updated_at,
      clients (company_name),
      message_count:support_ticket_messages(count)
    `)
    .eq("id", ticketId)
    .single()

  if (tErr) throw new Error(tErr.message)

  const { data: msgRows, error: mErr } = await supabase
    .from("support_ticket_messages")
    .select("id, ticket_id, sender_user_id, sender_role, message, attachments, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })

  if (mErr) throw new Error(mErr.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tRow as any
  const clientName = t.clients?.company_name ?? ""
  const ticket = {
    ...mapTicket(t),
    messageCount: Array.isArray(t.message_count) ? (t.message_count[0]?.count ?? 0) : 0,
  }
  const messages = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (msgRows ?? []).map((m: any) => mapMessage(m, clientName)),
  )

  return { ticket, messages }
}

// ── createTicket ──────────────────────────────────────────────

type CreateTicketInput = {
  clientId:    string
  subject:     string
  category:    TicketCategory
  message:     string
  attachments: TicketAttachment[]
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<{ ticket: SupportTicket; emailSent: boolean; emailError?: string }> {
  const { supabase, user, isAdmin, clientId: jwtClientId } = await getAuthContext()

  // Resolve which client this ticket belongs to
  const effectiveClientId = isAdmin ? input.clientId : (jwtClientId ?? input.clientId)
  if (!effectiveClientId) throw new Error("Client ID required.")

  // Create the ticket
  const { data: tRow, error: tErr } = await supabase
    .from("support_tickets")
    .insert({
      client_id:  effectiveClientId,
      subject:    input.subject.trim(),
      category:   input.category,
      status:     "Open",
      created_by: user.id,
    })
    .select(`
      id, ticket_number, client_id, subject, category, status, assigned_to,
      created_by, archived_at, created_at, updated_at,
      clients (company_name)
    `)
    .single()

  if (tErr) throw new Error(tErr.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ticket: SupportTicket = { ...mapTicket(tRow as any), messageCount: 1 }

  // Create the first message
  const { error: mErr } = await supabase
    .from("support_ticket_messages")
    .insert({
      ticket_id:      ticket.id,
      sender_user_id: user.id,
      sender_role:    isAdmin ? "admin" : "client",
      message:        input.message.trim(),
      attachments:    input.attachments.length > 0 ? input.attachments : [],
    })

  if (mErr) throw new Error(mErr.message)

  // Send email notification to admin
  let emailSent = false
  let emailError: string | undefined

  const admin = createServerAdminClient()
  const { data: settings } = await admin
    .from("company_settings")
    .select("email, company_name")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const adminEmail = (settings as Record<string, unknown> | null)?.email as string | undefined
  if (adminEmail && !isAdmin) {
    const result = await sendSupportEmail({
      to: adminEmail,
      subject: `New Support Ticket: ${ticket.ticketNumber} – ${ticket.subject}`,
      html: emailHtml(
        "New support ticket submitted",
        input.message,
        ticket.ticketNumber,
        ticket.subject,
      ),
    })
    emailSent  = result.sent
    emailError = result.error
  } else {
    emailSent = true // admin creating on behalf → skip notification
  }

  return { ticket, emailSent, emailError }
}

// ── replyToTicket ─────────────────────────────────────────────

type ReplyInput = {
  ticketId:    string
  message:     string
  attachments: TicketAttachment[]
  newStatus?:  TicketStatus
}

export async function replyToTicket(
  input: ReplyInput,
): Promise<{ message: TicketMessage; emailSent: boolean; emailError?: string }> {
  const { supabase, user, isAdmin } = await getAuthContext()

  // Verify access + get ticket details
  const { data: tRow, error: tErr } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, subject, client_id, status, clients(company_name, email:clients_email)")
    .eq("id", input.ticketId)
    .single()

  if (tErr || !tRow) throw new Error("Ticket not found or access denied.")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tRow as any

  // Insert message
  const { data: mRow, error: mErr } = await supabase
    .from("support_ticket_messages")
    .insert({
      ticket_id:      input.ticketId,
      sender_user_id: user.id,
      sender_role:    isAdmin ? "admin" : "client",
      message:        input.message.trim(),
      attachments:    input.attachments.length > 0 ? input.attachments : [],
    })
    .select("id, ticket_id, sender_user_id, sender_role, message, attachments, created_at")
    .single()

  if (mErr) throw new Error(mErr.message)

  // Update ticket status
  const nextStatus: TicketStatus = input.newStatus ?? (isAdmin ? "Waiting for Client" : "Waiting for Admin")
  await supabase
    .from("support_tickets")
    .update({ status: nextStatus })
    .eq("id", input.ticketId)

  const message = await mapMessage(mRow, t.clients?.company_name ?? "")

  // Email notification
  let emailSent = false
  let emailError: string | undefined

  if (isAdmin) {
    // Notify client
    const adminRows = await createServerAdminClient()
      .from("clients")
      .select("email")
      .eq("id", t.client_id)
      .maybeSingle()
    const clientEmail = (adminRows.data as Record<string, unknown> | null)?.email as string | undefined
    if (clientEmail) {
      const result = await sendSupportEmail({
        to: clientEmail,
        subject: `Reply on Ticket ${t.ticket_number}: ${t.subject}`,
        html: emailHtml("Support replied to your ticket", input.message, t.ticket_number, t.subject),
      })
      emailSent  = result.sent
      emailError = result.error
    } else {
      emailSent = true
    }
  } else {
    // Notify admin
    const { data: settings } = await createServerAdminClient()
      .from("company_settings")
      .select("email")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const adminEmail = (settings as Record<string, unknown> | null)?.email as string | undefined
    if (adminEmail) {
      const result = await sendSupportEmail({
        to: adminEmail,
        subject: `Client replied on Ticket ${t.ticket_number}: ${t.subject}`,
        html: emailHtml("Client replied to a support ticket", input.message, t.ticket_number, t.subject),
      })
      emailSent  = result.sent
      emailError = result.error
    } else {
      emailSent = true
    }
  }

  return { message, emailSent, emailError }
}

// ── updateTicketStatus ────────────────────────────────────────

export async function updateTicketStatus(id: string, status: TicketStatus): Promise<void> {
  const { supabase, isAdmin } = await getAuthContext()
  if (!isAdmin) throw new Error("Admin only.")
  const { error } = await supabase
    .from("support_tickets")
    .update({ status })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

// ── archiveTicket ─────────────────────────────────────────────

export async function archiveTicket(id: string): Promise<void> {
  const { supabase } = await getAuthContext()
  const { error } = await supabase
    .from("support_tickets")
    .update({ archived_at: new Date().toISOString(), status: "Archived" })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

// ── restoreTicket ─────────────────────────────────────────────

export async function restoreTicket(id: string): Promise<void> {
  const { supabase, isAdmin } = await getAuthContext()
  if (!isAdmin) throw new Error("Admin only.")
  const { error } = await supabase
    .from("support_tickets")
    .update({ archived_at: null, status: "Open" })
    .eq("id", id)
  if (error) throw new Error(error.message)
}
