"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"

export type AppNotification = {
  id:         string
  type:       string
  title:      string
  message:    string
  entityType: string | null
  entityId:   string | null
  linkUrl:    string | null
  readAt:     string | null
  createdAt:  string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): AppNotification {
  return {
    id:         row.id,
    type:       row.type,
    title:      row.title,
    message:    row.message,
    entityType: row.entity_type ?? null,
    entityId:   row.entity_id   ?? null,
    linkUrl:    row.link_url    ?? null,
    readAt:     row.read_at     ?? null,
    createdAt:  row.created_at,
  }
}

export async function listNotifications(limit = 50): Promise<AppNotification[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createSupabaseServerClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, entity_type, entity_id, link_url, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[listNotifications] error:", error.message)
    return []
  }
  return (data ?? []).map(mapRow)
}

export async function getUnreadCount(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createSupabaseServerClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)

  if (error) return 0
  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createSupabaseServerClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null)
}

export async function markAllNotificationsRead(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createSupabaseServerClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
}
