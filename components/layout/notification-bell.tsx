"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck, ExternalLink } from "lucide-react"
import type { AppNotification } from "@/app/notifications/actions"

type Props = {
  isMockMode: boolean
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return "just now"
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const d = Math.floor(s / 86400)
  return d === 1 ? "yesterday" : `${d}d ago`
}

export function NotificationBell({ isMockMode }: Props) {
  const router = useRouter()
  const [open,        setOpen]        = useState(false)
  const [unread,      setUnread]      = useState(0)
  const [notifs,      setNotifs]      = useState<AppNotification[]>([])
  const [loading,     setLoading]     = useState(false)
  const [markingAll,  setMarkingAll]  = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load unread count
  const loadCount = useCallback(async () => {
    if (isMockMode) return
    try {
      const { getUnreadCount } = await import("@/app/notifications/actions")
      const count = await getUnreadCount()
      setUnread(count)
    } catch { /* silent */ }
  }, [isMockMode])

  // Initial + polling every 60 s
  useEffect(() => {
    void loadCount()
    if (isMockMode) return
    const id = setInterval(() => void loadCount(), 60_000)
    return () => clearInterval(id)
  }, [loadCount, isMockMode])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  async function handleOpen() {
    if (isMockMode) return
    setOpen((p) => !p)
    if (!open) {
      setLoading(true)
      try {
        const { listNotifications } = await import("@/app/notifications/actions")
        const data = await listNotifications(20)
        setNotifs(data)
      } catch { /* silent */ }
      finally { setLoading(false) }
    }
  }

  async function handleClickNotif(n: AppNotification) {
    setOpen(false)
    if (!n.readAt) {
      setNotifs((p) => p.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
      setUnread((c) => Math.max(0, c - 1))
      try {
        const { markNotificationRead } = await import("@/app/notifications/actions")
        await markNotificationRead(n.id)
      } catch { /* silent */ }
    }
    if (n.linkUrl) router.push(n.linkUrl)
  }

  async function handleMarkAll() {
    setMarkingAll(true)
    setNotifs((p) => p.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    setUnread(0)
    try {
      const { markAllNotificationsRead } = await import("@/app/notifications/actions")
      await markAllNotificationsRead()
    } catch { /* silent */ }
    finally { setMarkingAll(false) }
  }

  if (isMockMode) {
    return (
      <button className="relative flex size-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
        <Bell className="size-[16px]" />
      </button>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="relative flex size-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="size-[16px]" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[340px] rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-[13px] font-semibold text-gray-900">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                disabled={markingAll}
                className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 transition-colors"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="size-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              </div>
            ) : notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-6">
                <Bell className="size-7 text-gray-200" />
                <p className="text-[13px] text-gray-400">No notifications yet</p>
              </div>
            ) : (
              notifs.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotif(n)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${!n.readAt ? "bg-blue-50/40" : ""}`}
                >
                  {/* Unread dot */}
                  <span className={`mt-1.5 size-2 rounded-full shrink-0 ${!n.readAt ? "bg-blue-500" : "bg-transparent"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] leading-snug ${!n.readAt ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                      {n.title}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {n.linkUrl && <ExternalLink className="size-3 text-gray-300 shrink-0 mt-1" />}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2.5">
            <button
              onClick={() => { setOpen(false); router.push("/notifications") }}
              className="text-[12px] text-blue-600 hover:text-blue-700 font-medium w-full text-center transition-colors"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
