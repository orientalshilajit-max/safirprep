"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createServerAdminClient }    from "@/lib/supabase"
import type {
  SupportTicket, TicketMessage, TicketCategory, TicketStatus, TicketAttachment,
} from "@/lib/types"
import { createNotification } from "@/lib/notifications-server"
import { sendTelegramNotification } from "@/lib/telegram"

// ── Email helper (Resend – graceful fallback) ─────────────────

async function sendSupportEmail(opts: {
  to: string
  subject: string
  html: string
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey   = process.env.RESEND_API_KEY
  const fromAddr = process.env.SUPPORT_FROM_EMAIL
  if (!apiKey || !fromAddr) return { sent: false, error: "not-configured" }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddr, to: opts.to, subject: opts.subject, html: opts.html }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`[support-email] Resend error ${res.status}: ${body}`)
      return { sent: false, error: body }
    }
    return { sent: true }
  } catch (err) {
    console.error("[support-email] Network error:", err)
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

  // Resolve the sender display name at auth time so every message insert can
  // store it directly — no fragile runtime join needed later.
  let senderName: string
  if (isAdmin) {
    senderName = "Support Team"
  } else if (clientId) {
    const admin = createServerAdminClient()
    const { data: clientRow } = await admin
      .from("clients")
      .select("company_name, contact_name")
      .eq("id", clientId)
      .maybeSingle()
    // Prefer the individual contact name; fall back to company name
    const row = clientRow as Record<string, string | null> | null
    senderName = row?.contact_name || row?.company_name || user.email || "Client"
  } else {
    // Non-admin without a client_id claim — use email as display name
    senderName = user.email || "Client"
  }

  // Cast to any: support_tickets / support_ticket_messages are new tables not
  // yet present in the generated Supabase TypeScript types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseTyped as any
  return { supabase, user, isAdmin, clientId, senderName }
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
  attachments: TicketAttachment[],
): Promise<TicketAttachment[]> {
  if (attachments.length === 0) return []
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
async function mapMessage(row: any): Promise<TicketMessage> {
  const rawAttachments = Array.isArray(row.attachments) ? (row.attachments as TicketAttachment[]) : []
  const attachments    = await resolveAttachmentUrls(rawAttachments)
  return {
    id:            row.id,
    ticketId:      row.ticket_id,
    senderUserId:  row.sender_user_id,
    senderRole:    row.sender_role as "admin" | "client",
    // Use the stored sender_name; fall back to role label for legacy rows
    senderName:    row.sender_name || (row.sender_role === "admin" ? "Support Team" : "Client"),
    message:       row.message,
    attachments,
    createdAt:     row.created_at,
  }
}

// ── listTickets ───────────────────────────────────────────────

export async function listTickets(): Promise<SupportTicket[]> {
  const { supabase } = await getAuthContext()
  const { data, error } = await supabase
    .from("support_tickets")
    .select(`
      id, ticket_number, client_id, subject, category, status, assigned_to,
      created_by, archived_at, created_at, updated_at,
      clients (company_name),
      message_count:support_ticket_messages(count)
    `)
    .order("updated_at", { ascending: false })

  if (error) {
    console.error("[listTickets] error:", error.message)
    throw new Error(error.message)
  }

  return (data ?? [])
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

  if (tErr) {
    console.error("[getTicketWithMessages] ticket fetch error:", tErr.message)
    throw new Error(tErr.message)
  }

  const { data: msgRows, error: mErr } = await supabase
    .from("support_ticket_messages")
    .select("id, ticket_id, sender_user_id, sender_role, sender_name, message, attachments, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })

  if (mErr) {
    console.error("[getTicketWithMessages] messages fetch error:", mErr.message)
    throw new Error(mErr.message)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tRow as any
  const ticket = {
    ...mapTicket(t),
    messageCount: Array.isArray(t.message_count) ? (t.message_count[0]?.count ?? 0) : 0,
  }
  const messages = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (msgRows ?? []).map((m: any) => mapMessage(m)),
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
  const { supabase, user, isAdmin, clientId: jwtClientId, senderName } = await getAuthContext()

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

  if (tErr) {
    console.error("[createTicket] ticket insert error:", tErr.message)
    throw new Error(tErr.message)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ticket: SupportTicket = { ...mapTicket(tRow as any), messageCount: 1 }

  // Create the first message.
  // Use the service-role admin client so the insert is not subject to RLS
  // quirks — the creator's identity is already verified above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminDb = createServerAdminClient() as any
  const { error: mErr } = await adminDb
    .from("support_ticket_messages")
    .insert({
      ticket_id:      ticket.id,
      sender_user_id: user.id,
      sender_role:    isAdmin ? "admin" : "client",
      sender_name:    senderName,
      message:        input.message.trim(),
      attachments:    input.attachments.length > 0 ? input.attachments : [],
    })

  if (mErr) {
    console.error("[createTicket] message insert error:", mErr.message)
    throw new Error(mErr.message)
  }

  // Send email notification to admin (skip when admin creates on behalf)
  let emailSent = false
  let emailError: string | undefined

  if (!isAdmin) {
    const admin = createServerAdminClient()
    const { data: settings } = await admin
      .from("company_settings")
      .select("email, company_name")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const adminEmail = (settings as Record<string, unknown> | null)?.email as string | undefined
    if (adminEmail) {
      const result = await sendSupportEmail({
        to: adminEmail,
        subject: `New Support Ticket: ${ticket.ticketNumber} – ${ticket.subject}`,
        html: emailHtml("New support ticket submitted", input.message, ticket.ticketNumber, ticket.subject),
      })
      emailSent  = result.sent
      emailError = result.error
    } else {
      emailSent = true
    }
  } else {
    emailSent = true
  }

  if (!isAdmin) {
    void createNotification({
      recipientRole: "admin",
      actorUserId:   user.id,
      actorRole:     "client",
      type:          "ticket_created",
      title:         "New support ticket",
      message:       `${senderName} created ticket ${ticket.ticketNumber}.`,
      entityType:    "support_ticket",
      entityId:      ticket.id,
      linkUrl:       "/help",
    })
    void sendTelegramNotification(
      `New Support Ticket\nClient: ${ticket.clientName}\nTicket: ${ticket.ticketNumber}\nSubject: ${ticket.subject}\nOpen: https://app.safir-logistics.com/help`
    )
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
  const { supabase, user, isAdmin, senderName } = await getAuthContext()

  // Verify access + get ticket details.
  // Note: select only plain columns from the joined table — no alias tricks.
  const { data: tRow, error: tErr } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, subject, client_id, status, clients(company_name, email)")
    .eq("id", input.ticketId)
    .single()

  if (tErr || !tRow) {
    const msg = tErr?.message ?? "Ticket not found or access denied."
    console.error("[replyToTicket] ticket fetch error:", msg)
    throw new Error(msg)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tRow as any

  // Insert message using the service-role admin client so the insert succeeds
  // regardless of how RLS evaluates for the admin session.
  // The caller's identity has already been verified via getAuthContext().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminDb = createServerAdminClient() as any
  const { data: mRow, error: mErr } = await adminDb
    .from("support_ticket_messages")
    .insert({
      ticket_id:      input.ticketId,
      sender_user_id: user.id,
      sender_role:    isAdmin ? "admin" : "client",
      sender_name:    senderName,
      message:        input.message.trim(),
      attachments:    input.attachments.length > 0 ? input.attachments : [],
    })
    .select("id, ticket_id, sender_user_id, sender_role, sender_name, message, attachments, created_at")
    .single()

  if (mErr) {
    console.error("[replyToTicket] message insert error:", mErr.message)
    throw new Error(mErr.message)
  }

  // Update ticket status via user client (RLS allows ticket participants to update)
  const nextStatus: TicketStatus = input.newStatus ?? (isAdmin ? "Waiting for Client" : "Waiting for Admin")
  const { error: sErr } = await supabase
    .from("support_tickets")
    .update({ status: nextStatus })
    .eq("id", input.ticketId)
  if (sErr) console.error("[replyToTicket] status update error:", sErr.message)

  const message = await mapMessage(mRow)

  // Email notification
  let emailSent = false
  let emailError: string | undefined

  if (isAdmin) {
    // Notify client
    const { data: clientRow } = await createServerAdminClient()
      .from("clients")
      .select("email")
      .eq("id", t.client_id)
      .maybeSingle()
    const clientEmail = (clientRow as Record<string, unknown> | null)?.email as string | undefined
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

  if (isAdmin) {
    void createNotification({
      recipientClientId: t.client_id as string,
      actorRole:         "admin",
      type:              "ticket_reply",
      title:             "Support replied",
      message:           `Support Team replied to ticket ${t.ticket_number as string}.`,
      entityType:        "support_ticket",
      entityId:          input.ticketId,
      linkUrl:           "/help",
    })
  } else {
    void createNotification({
      recipientRole: "admin",
      actorUserId:   user.id,
      actorRole:     "client",
      type:          "ticket_reply",
      title:         "Client replied on ticket",
      message:       `${senderName} replied to ticket ${t.ticket_number as string}.`,
      entityType:    "support_ticket",
      entityId:      input.ticketId,
      linkUrl:       "/help",
    })
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
  if (error) {
    console.error("[updateTicketStatus] error:", error.message)
    throw new Error(error.message)
  }
}

// ── archiveTicket ─────────────────────────────────────────────

export async function archiveTicket(id: string): Promise<void> {
  const { supabase } = await getAuthContext()
  const { error } = await supabase
    .from("support_tickets")
    .update({ archived_at: new Date().toISOString(), status: "Archived" })
    .eq("id", id)
  if (error) {
    console.error("[archiveTicket] error:", error.message)
    throw new Error(error.message)
  }
}

// ── restoreTicket ─────────────────────────────────────────────

export async function restoreTicket(id: string): Promise<void> {
  const { supabase, isAdmin } = await getAuthContext()
  if (!isAdmin) throw new Error("Admin only.")
  const { error } = await supabase
    .from("support_tickets")
    .update({ archived_at: null, status: "Open" })
    .eq("id", id)
  if (error) {
    console.error("[restoreTicket] error:", error.message)
    throw new Error(error.message)
  }
}
