"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createServerAdminClient }     from "@/lib/supabase"
import type { Client, ClientStatus, LoginStatus } from "@/lib/types"

// ── Status mapping ────────────────────────────────────────────

const STATUS_TO_DB: Record<ClientStatus, "pending" | "active" | "inactive"> = {
  Pending:  "pending",
  Active:   "active",
  Inactive: "inactive",
}

const STATUS_FROM_DB: Record<string, ClientStatus> = {
  pending:  "Pending",
  active:   "Active",
  inactive: "Inactive",
}

const LOGIN_FROM_DB: Record<string, LoginStatus> = {
  no_login: "No Login",
  invited:  "Invite Sent",
  active:   "Active",
  disabled: "Disabled",
}

// ── Row mapper ────────────────────────────────────────────────

type DbClientRow = {
  id:                  string
  auth_user_id:        string | null
  company_name:        string
  contact_name:        string
  email:               string
  phone:               string | null
  status:              string
  login_status:        string
  notes:               string | null
  invited_at:          string | null
  last_invite_sent_at: string | null
  invite_count:        number
  updated_at:          string
  deleted_at:          string | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

function mapRow(row: DbClientRow): Client {
  return {
    id:               row.id,
    companyName:      row.company_name,
    contactName:      row.contact_name,
    email:            row.email,
    phone:            row.phone ?? "",
    status:           STATUS_FROM_DB[row.status]      ?? "Pending",
    loginStatus:      LOGIN_FROM_DB[row.login_status] ?? "No Login",
    lastActivity:     fmtDate(row.updated_at),
    notes:            row.notes ?? "",
    isArchived:       row.deleted_at != null,
    invitedAt:        row.invited_at          ? fmtDate(row.invited_at)          : undefined,
    lastInviteSentAt: row.last_invite_sent_at ? fmtDate(row.last_invite_sent_at) : undefined,
    inviteCount:      row.invite_count ?? 0,
  }
}

const CLIENT_SELECT = `
  id, auth_user_id, company_name, contact_name, email, phone,
  status, login_status, notes, invited_at, last_invite_sent_at, invite_count,
  updated_at, deleted_at
` as const

// ── Guard: require admin ──────────────────────────────────────

async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "admin") {
    throw new Error("Admin access required.")
  }
  return { supabase, user }
}

// ── listClients ───────────────────────────────────────────────

export async function listClients(): Promise<Client[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => mapRow(r as unknown as DbClientRow))
}

// ── createClient ──────────────────────────────────────────────

type ClientInput = {
  companyName: string
  contactName: string
  email:       string
  phone:       string
  notes:       string
  status:      ClientStatus
}

export async function createClient(input: ClientInput): Promise<Client> {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from("clients")
    .insert({
      company_name: input.companyName.trim(),
      contact_name: input.contactName.trim(),
      email:        input.email.trim().toLowerCase(),
      phone:        input.phone.trim() || null,
      notes:        input.notes.trim() || null,
      status:       STATUS_TO_DB[input.status],
      login_status: "no_login",
    })
    .select(CLIENT_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as unknown as DbClientRow)
}

// ── updateClient ──────────────────────────────────────────────

export async function updateClient(id: string, input: ClientInput): Promise<Client> {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from("clients")
    .update({
      company_name: input.companyName.trim(),
      contact_name: input.contactName.trim(),
      email:        input.email.trim().toLowerCase(),
      phone:        input.phone.trim() || null,
      notes:        input.notes.trim() || null,
      status:       STATUS_TO_DB[input.status],
    })
    .eq("id", id)
    .select(CLIENT_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as unknown as DbClientRow)
}

// ── archiveClient ─────────────────────────────────────────────

export async function archiveClient(id: string): Promise<void> {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
}

// ── listArchivedClients ───────────────────────────────────────

export async function listArchivedClients(): Promise<Client[]> {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => mapRow(r as unknown as DbClientRow))
}

// ── restoreClient ─────────────────────────────────────────────

export async function restoreClient(id: string): Promise<Client> {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase
    .from("clients")
    .update({ deleted_at: null })
    .eq("id", id)
    .select(CLIENT_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as unknown as DbClientRow)
}

// ── deleteClientPermanently ───────────────────────────────────

export async function deleteClientPermanently(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const adminClient  = createServerAdminClient()

  const { data: client, error: gErr } = await supabase
    .from("clients")
    .select("id, auth_user_id")
    .eq("id", id)
    .single()
  if (gErr) throw new Error(gErr.message)

  const row = client as { id: string; auth_user_id: string | null }

  if (row.auth_user_id) {
    const { data: authData } = await adminClient.auth.admin.getUserById(row.auth_user_id)
    if (authData?.user) {
      if (authData.user.app_metadata?.role === "admin") {
        throw new Error("Admin users cannot be deleted from Clients.")
      }
      const { error: delAuthErr } = await adminClient.auth.admin.deleteUser(row.auth_user_id)
      if (delAuthErr) throw new Error(delAuthErr.message)
    }
  }

  const { error: delErr } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
  if (delErr) {
    if (delErr.code === "23503") {
      throw new Error("This client has related records and cannot be permanently deleted until related data is removed.")
    }
    throw new Error(delErr.message)
  }
}

// ── sendInvite ────────────────────────────────────────────────
// Creates (or resends) a Supabase Auth invite for the client.
//
// Safety rules enforced server-side:
//   • Caller must be admin.
//   • The email must NOT belong to an existing admin user.
//   • Sets app_metadata.role = "client" + app_metadata.client_id.
//   • Links auth_user_id on the clients row.

export async function sendInvite(clientId: string): Promise<Client> {
  const { supabase } = await requireAdmin()
  const adminClient  = createServerAdminClient()

  // Load the client record
  const { data: client, error: gErr } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("id", clientId)
    .single()
  if (gErr) throw new Error(gErr.message)

  const email = (client as unknown as DbClientRow).email
  const existingAuthUserId = (client as unknown as DbClientRow).auth_user_id

  // ── Check for existing admin accounts ─────────────────────────
  // Fetch a broad user list to detect if this email belongs to an admin.
  // Supabase caps listUsers at 1000 per page; sufficient for a WMS.
  const { data: usersPage } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const allAuthUsers = usersPage?.users ?? []

  const matchingUser = allAuthUsers.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )
  if (matchingUser?.app_metadata?.role === "admin") {
    throw new Error("This email belongs to an admin account. Admins cannot be invited as clients.")
  }

  // ── Send the invite ───────────────────────────────────────────
  // The link in the invite email goes through Supabase, which appends
  // ?code=<PKCE_code> and redirects to this URL.  The callback route
  // exchanges the code for a session and forwards the client to /set-password.
  const redirectTo = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/set-password`
    : undefined

  let authUserId: string

  if (existingAuthUserId) {
    // Re-invite: user record already exists — just resend the email
    await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo })
    authUserId = existingAuthUserId
  } else if (matchingUser) {
    // User exists in Auth but not linked to this client yet.
    // (Could be a previously deleted client or an account created another way.)
    authUserId = matchingUser.id
    // Resend invite so they get the email
    await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo })
  } else {
    // Brand-new user — invite and get the newly-created user ID
    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo }
    )
    if (inviteErr) throw new Error(inviteErr.message)
    authUserId = inviteData.user.id
  }

  // ── Stamp app_metadata ────────────────────────────────────────
  const { error: metaErr } = await adminClient.auth.admin.updateUserById(authUserId, {
    app_metadata: { role: "client", client_id: clientId },
  })
  if (metaErr) throw new Error(metaErr.message)

  // ── Update client record ──────────────────────────────────────
  const clientRow = client as unknown as DbClientRow
  const now       = new Date().toISOString()

  const { data: updated, error: uErr } = await supabase
    .from("clients")
    .update({
      auth_user_id:        authUserId,
      login_status:        "invited",
      // Only stamp invited_at on the first invite; preserve it on resends.
      invited_at:          clientRow.invited_at ?? now,
      last_invite_sent_at: now,
      invite_count:        (clientRow.invite_count ?? 0) + 1,
    })
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single()
  if (uErr) throw new Error(uErr.message)
  return mapRow(updated as unknown as DbClientRow)
}

// ── resetPassword ─────────────────────────────────────────────
// Triggers a password-reset email for an active client user.

export async function resetPassword(clientId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const adminClient  = createServerAdminClient()

  const { data: client, error: gErr } = await supabase
    .from("clients")
    .select("email")
    .eq("id", clientId)
    .single()
  if (gErr) throw new Error(gErr.message)

  const email = (client as { email: string }).email

  // generateLink sends the recovery email via Supabase's configured SMTP.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const { error } = await adminClient.auth.admin.generateLink({
    type:    "recovery",
    email,
    options: {
      redirectTo: appUrl
        ? `${appUrl}/auth/callback?next=/set-password`
        : undefined,
    },
  })
  if (error) throw new Error(error.message)
}

// ── disableLogin ──────────────────────────────────────────────
// Bans the Supabase Auth user (prevents sign-in) and marks the client row
// as "disabled".  If the client has no linked auth user, only the DB field
// is updated — they had no login access anyway.

export async function disableLogin(clientId: string): Promise<Client> {
  const { supabase } = await requireAdmin()
  const adminClient  = createServerAdminClient()

  const { data: client, error: gErr } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("id", clientId)
    .single()
  if (gErr) throw new Error(gErr.message)

  const row = client as unknown as DbClientRow

  // Ban the auth user so they can no longer sign in.
  if (row.auth_user_id) {
    const { error: banErr } = await adminClient.auth.admin.updateUserById(
      row.auth_user_id,
      { ban_duration: "87600h" } // 10 years — effectively permanent
    )
    if (banErr) throw new Error(banErr.message)
  }

  const { data: updated, error: uErr } = await supabase
    .from("clients")
    .update({ login_status: "disabled" })
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single()
  if (uErr) throw new Error(uErr.message)
  return mapRow(updated as unknown as DbClientRow)
}

// ── enableLogin ───────────────────────────────────────────────
// Lifts the Supabase Auth ban and restores the client's login status.
// If an auth user is linked, they become "active" again; otherwise "no_login".

export async function enableLogin(clientId: string): Promise<Client> {
  const { supabase } = await requireAdmin()
  const adminClient  = createServerAdminClient()

  const { data: client, error: gErr } = await supabase
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("id", clientId)
    .single()
  if (gErr) throw new Error(gErr.message)

  const row = client as unknown as DbClientRow

  let restoredStatus: "active" | "no_login" = "no_login"

  if (row.auth_user_id) {
    const { error: unbanErr } = await adminClient.auth.admin.updateUserById(
      row.auth_user_id,
      { ban_duration: "none" }
    )
    if (unbanErr) throw new Error(unbanErr.message)
    restoredStatus = "active"
  }

  const { data: updated, error: uErr } = await supabase
    .from("clients")
    .update({ login_status: restoredStatus })
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single()
  if (uErr) throw new Error(uErr.message)
  return mapRow(updated as unknown as DbClientRow)
}

// ── activateClientLogin ───────────────────────────────────────
// Called from the AppShell when a client user signs in for the
// first time (transitioning from "invited" to "active").
// Uses the admin client so it can write without client-UPDATE RLS.

export async function activateClientLogin(): Promise<void> {
  const supabase     = await createSupabaseServerClient()
  const adminClient  = createServerAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  // Only run for client-role users
  if (user.app_metadata?.role !== "client") return

  await adminClient
    .from("clients")
    .update({ login_status: "active" })
    .eq("auth_user_id", user.id)
    .eq("login_status", "invited")
  // Errors are intentionally swallowed — this is a best-effort status promotion.
}
