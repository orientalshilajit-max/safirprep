import { createServerAdminClient } from "@/lib/supabase"

export type NotificationInput = {
  recipientUserId?:   string
  recipientRole?:     "admin" | "client"
  recipientClientId?: string
  actorUserId?:       string
  actorRole?:         "admin" | "client"
  type:               string
  title:              string
  message:            string
  entityType?:        string
  entityId?:          string
  linkUrl?:           string
}

export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createServerAdminClient() as any
    const { error } = await admin.from("notifications").insert({
      recipient_user_id:   input.recipientUserId   ?? null,
      recipient_role:      input.recipientRole      ?? null,
      recipient_client_id: input.recipientClientId  ?? null,
      actor_user_id:       input.actorUserId        ?? null,
      actor_role:          input.actorRole          ?? null,
      type:                input.type,
      title:               input.title,
      message:             input.message,
      entity_type:         input.entityType  ?? null,
      entity_id:           input.entityId    ?? null,
      link_url:            input.linkUrl     ?? null,
    })
    if (error) console.error("[notifications] insert failed:", error.message)
  } catch (err) {
    console.error("[notifications] unexpected error:", err)
  }
}
