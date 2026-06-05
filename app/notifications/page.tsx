"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck, AlertCircle, RefreshCw } from "lucide-react"
import { useIsMockMode } from "@/components/layout/app-shell"
import type { AppNotification } from "@/app/notifications/actions"

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return "just now"
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const d = Math.floor(s / 86400)
  if (d < 30)   return `${d}d ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function NotificationsPage() {
  const router      = useRouter()
  const isMockMode  = useIsMockMode()

  const [notifs,      setNotifs]      = useState<AppNotification[]>([])
  const [loading,     setLoading]     = useState(!isMockMode)
  const [filter,      setFilter]      = useState<"all" | "unread">("all")
  const [markingAll,  setMarkingAll]  = useState(false)

  const load = useCallback(async () => {
    if (isMockMode) return
    setLoading(true)
    try {
      const { listNotifications } = await import("@/app/notifications/actions")
      const data = await listNotifications(100)
      setNotifs(data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [isMockMode])

  useEffect(() => {
    if (isMockMode) return
    import("@/app/notifications/actions")
      .then(({ listNotifications }) => listNotifications(100))
      .then(setNotifs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isMockMode])

  async function handleRead(n: AppNotification) {
    if (n.readAt) {
      if (n.linkUrl) router.push(n.linkUrl)
      return
    }
    setNotifs((p) => p.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
    try {
      const { markNotificationRead } = await import("@/app/notifications/actions")
      await markNotificationRead(n.id)
    } catch { /* silent */ }
    if (n.linkUrl) router.push(n.linkUrl)
  }

  async function handleMarkAll() {
    setMarkingAll(true)
    setNotifs((p) => p.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    try {
      const { markAllNotificationsRead } = await import("@/app/notifications/actions")
      await markAllNotificationsRead()
    } catch { /* silent */ }
    finally { setMarkingAll(false) }
  }

  const shown    = filter === "unread" ? notifs.filter((n) => !n.readAt) : notifs
  const unreadCt = notifs.filter((n) => !n.readAt).length

  return (
    <div className="flex flex-col gap-4 h-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900 leading-tight">Notifications</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {unreadCt > 0 ? `${unreadCt} unread` : "All caught up"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {unreadCt > 0 && (
            <button
              onClick={handleMarkAll}
              disabled={markingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-[13px] font-medium capitalize border-b-2 transition-colors ${
              filter === f
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {f === "all" ? "All" : `Unread${unreadCt > 0 ? ` (${unreadCt})` : ""}`}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1">
        {isMockMode ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-8">
            <div className="flex size-12 items-center justify-center rounded-full bg-blue-50">
              <Bell className="size-6 text-blue-400" />
            </div>
            <p className="text-[14px] font-semibold text-gray-700">Notifications require Supabase</p>
            <p className="text-[13px] text-gray-400 max-w-xs">
              Connect Supabase to enable in-app notifications.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="size-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-gray-50">
              <Bell className="size-6 text-gray-300" />
            </div>
            <p className="text-[14px] font-semibold text-gray-500">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {shown.map((n) => (
              <button
                key={n.id}
                onClick={() => handleRead(n)}
                className={`w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors ${!n.readAt ? "bg-blue-50/30" : ""}`}
              >
                <span className={`mt-2 size-2 rounded-full shrink-0 ${!n.readAt ? "bg-blue-500" : "bg-gray-200"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`text-[13px] leading-snug ${!n.readAt ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                      {n.title}
                    </p>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                </div>
                {n.linkUrl && (
                  <AlertCircle className="size-3.5 text-gray-300 shrink-0 mt-1.5" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
