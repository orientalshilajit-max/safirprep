"use client"

import { useState, useRef, useEffect } from "react"
import { Paperclip, X, Download, AlertCircle, CheckCircle2 } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { StatusBadge } from "@/components/ui/status-badge"
import { isSupabaseConfigured, createBrowserClient } from "@/lib/supabase"
import type { SupportTicket, TicketMessage, TicketStatus, TicketAttachment } from "@/lib/types"

const ALLOWED_TYPES = [
  "image/jpeg","image/jpg","image/png","image/webp",
  "application/pdf","application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]
const MAX_SIZE = 10 * 1024 * 1024
const ACCEPT   = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx"

const ADMIN_STATUSES: TicketStatus[] = [
  "Open", "Waiting for Client", "Waiting for Admin", "Resolved", "Archived",
]

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 ** 2).toFixed(1)} MB`
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)   return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400)return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function isImage(type: string) {
  return ["image/jpeg","image/jpg","image/png","image/webp"].includes(type)
}

type Props = {
  ticket:   SupportTicket | null
  messages: TicketMessage[]
  isAdmin:  boolean
  onClose:  () => void
  onReplied:  (newMsg: TicketMessage, emailSent: boolean, emailError?: string) => void
  onStatusChanged: (id: string, status: TicketStatus) => void
  onArchived:  (id: string) => void
  onRestored:  (id: string) => void
}

export function TicketDetailModal({
  ticket, messages, isAdmin,
  onClose, onReplied, onStatusChanged, onArchived, onRestored,
}: Props) {
  const [replyText,  setReplyText]  = useState("")
  const [files,      setFiles]      = useState<{ file: File; id: string }[]>([])
  const [sending,    setSending]    = useState(false)
  const [error,      setError]      = useState("")
  const [notice,     setNotice]     = useState("")
  const fileRef      = useRef<HTMLInputElement>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  if (!ticket) return null
  // Capture in a const so TypeScript knows it's non-null inside callbacks
  const t = ticket

  const isArchived = !!t.archivedAt
  const isResolved = t.status === "Resolved" || isArchived

  function addFiles(list: FileList) {
    const next: { file: File; id: string }[] = []
    for (const f of Array.from(list)) {
      if (!ALLOWED_TYPES.includes(f.type)) { setError(`"${f.name}" type not allowed.`); continue }
      if (f.size > MAX_SIZE)               { setError(`"${f.name}" exceeds 10 MB.`); continue }
      next.push({ file: f, id: crypto.randomUUID() })
    }
    setFiles((p) => [...p, ...next])
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleReply() {
    if (!replyText.trim()) { setError("Reply cannot be empty."); return }
    setError(""); setSending(true)
    try {
      const attachments: TicketAttachment[] = []
      if (files.length > 0 && isSupabaseConfigured()) {
        const supabase = createBrowserClient()
        for (const { file } of files) {
          const ext  = file.name.split(".").pop()?.toLowerCase() ?? ""
          const path = `uploads/${crypto.randomUUID()}.${ext}`
          const { error: upErr } = await supabase.storage
            .from("support-attachments")
            .upload(path, file, { contentType: file.type })
          if (upErr) { setError(`Upload failed: ${upErr.message}`); setSending(false); return }
          attachments.push({ name: file.name, path, size: file.size, type: file.type })
        }
      }

      const { replyToTicket } = await import("@/app/help/actions")
      const { message: newMsg, emailSent, emailError } = await replyToTicket({
        ticketId: t.id,
        message: replyText.trim(),
        attachments,
      })

      setReplyText(""); setFiles([])
      if (emailError === "not-configured") {
        setNotice("Reply saved. Email provider is not configured.")
      } else {
        setNotice("")
      }
      onReplied(newMsg, emailSent, emailError)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply.")
    } finally {
      setSending(false)
    }
  }

  async function handleStatusChange(status: TicketStatus) {
    try {
      const { updateTicketStatus } = await import("@/app/help/actions")
      await updateTicketStatus(t.id, status)
      onStatusChanged(t.id, status)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.")
    }
  }

  async function handleArchive() {
    try {
      const { archiveTicket } = await import("@/app/help/actions")
      await archiveTicket(t.id)
      onArchived(t.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive.")
    }
  }

  async function handleRestore() {
    try {
      const { restoreTicket } = await import("@/app/help/actions")
      await restoreTicket(t.id)
      onRestored(t.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore.")
    }
  }

  return (
    <Modal
      isOpen={!!ticket}
      onClose={onClose}
      title={t.ticketNumber}
      size="xl"
      zIndex={55}
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <select
                value={t.status}
                onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
              >
                {ADMIN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {isResolved && !isArchived && (
              <button onClick={handleArchive}
                className="px-3 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Archive
              </button>
            )}
            {isArchived && isAdmin && (
              <button onClick={handleRestore}
                className="px-3 py-1.5 text-[12px] font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                Reopen Ticket
              </button>
            )}
          </div>
          <button onClick={onClose}
            className="px-3 py-1.5 text-[12px] font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Ticket meta */}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Status</p>
            <StatusBadge status={t.status} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Category</p>
            <p className="text-[12px] text-gray-700 font-medium">{t.category}</p>
          </div>
          {isAdmin && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Client</p>
              <p className="text-[12px] text-gray-700 font-medium">{t.clientName}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Created</p>
            <p className="text-[12px] text-gray-700">{timeAgo(t.createdAt)}</p>
          </div>
        </div>

        {/* Subject */}
        <div>
          <p className="text-[15px] font-semibold text-gray-900">{t.subject}</p>
        </div>

        {/* Messages */}
        <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
          {messages.map((msg) => {
            const isAdminMsg = msg.senderRole === "admin"
            return (
              <div key={msg.id} className={`flex ${isAdminMsg ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                  isAdminMsg
                    ? "bg-white border border-gray-200 text-gray-800"
                    : "bg-blue-600 text-white"
                }`}>
                  <div className={`flex items-center gap-2 mb-1 ${isAdminMsg ? "" : "flex-row-reverse"}`}>
                    <span className={`text-[11px] font-semibold ${isAdminMsg ? "text-gray-500" : "text-blue-200"}`}>
                      {msg.senderName}
                    </span>
                    <span className={`text-[10px] ${isAdminMsg ? "text-gray-400" : "text-blue-300"}`}>
                      {timeAgo(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                  {msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.attachments.map((att, i) => (
                        <div key={i} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                          isAdminMsg ? "bg-gray-50 border border-gray-100" : "bg-blue-500/30"
                        }`}>
                          {isImage(att.type) && att.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={att.url} alt={att.name}
                              className="max-h-32 max-w-[200px] rounded object-contain cursor-pointer"
                              onClick={() => att.url && window.open(att.url, "_blank")}
                            />
                          ) : (
                            <>
                              <span className={`text-[11px] truncate max-w-[160px] ${isAdminMsg ? "text-gray-600" : "text-white"}`}>
                                {att.name}
                              </span>
                              <span className={`text-[10px] shrink-0 ${isAdminMsg ? "text-gray-400" : "text-blue-200"}`}>
                                {fmtBytes(att.size)}
                              </span>
                              {att.url && (
                                <a href={att.url} target="_blank" rel="noreferrer" download={att.name}
                                  className={`shrink-0 ${isAdminMsg ? "text-gray-400 hover:text-blue-600" : "text-blue-200 hover:text-white"} transition-colors`}>
                                  <Download className="size-3.5" />
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Reply box (hidden when archived) */}
        {!isArchived && (
          <div className="border-t border-gray-100 pt-4 space-y-2">
            {notice && (
              <div className="flex items-center gap-2 text-[12px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                <AlertCircle className="size-3.5 shrink-0" />{notice}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-[12px] text-red-600">
                <AlertCircle className="size-3.5 shrink-0" />{error}
              </div>
            )}
            <textarea
              value={replyText}
              onChange={(e) => { setReplyText(e.target.value); setError("") }}
              rows={3}
              placeholder="Write a reply…"
              className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
            />
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map(({ file, id }) => (
                  <li key={id} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-1.5 text-[12px]">
                    <span className="truncate max-w-[240px] text-gray-700">{file.name}</span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-gray-400">{fmtBytes(file.size)}</span>
                      <button type="button" onClick={() => setFiles((p) => p.filter((f) => f.id !== id))}
                        className="text-gray-300 hover:text-red-500 transition-colors">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden"
                  onChange={(e) => e.target.files && addFiles(e.target.files)} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <Paperclip className="size-3.5" /> Attach
                </button>
              </div>
              <button onClick={handleReply} disabled={sending || !replyText.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60">
                <CheckCircle2 className="size-3.5" />
                {sending ? "Sending…" : "Send Reply"}
              </button>
            </div>
          </div>
        )}

        {isArchived && (
          <p className="text-center text-[12px] text-gray-400 pt-2">
            This ticket is archived. {isAdmin ? "Use \"Reopen Ticket\" to restore it." : "Contact support to reopen."}
          </p>
        )}
      </div>
    </Modal>
  )
}
