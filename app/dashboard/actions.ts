"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"

export type ActivityEntry = {
  id: string
  message: string
  action: string
  entityType: string
  createdAt: string
}

/**
 * Fetch the most recent activity_log entries.
 * RLS-filtered: admins see all; clients see their own.
 * Swallows errors and returns [] so the dashboard never hard-fails.
 */
export async function listRecentActivity(limit = 10): Promise<ActivityEntry[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from("activity_log")
      .select("id, message, action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) return []
    return (data ?? []).map((row) => ({
      id:         row.id,
      message:    row.message,
      action:     row.action,
      entityType: row.entity_type,
      createdAt:  row.created_at,
    }))
  } catch {
    return []
  }
}
