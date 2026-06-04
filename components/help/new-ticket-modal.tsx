"use client"

import { useState, useRef } from "react"
import { Paperclip, X, AlertCircle } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { isSupabaseConfigured, createBrowserClient } from "@/lib/supabase"
import { TICKET_CATEGORIES } from "@/lib/types"
import type { TicketCategory, TicketAttachment } from "@/lib/types"

const ALLOWED_TYPES = [
  "image/jpeg","image/jpg","image/png","image/webp",
  "application/pdf","application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx"

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 ** 2).toFixed(1)} MB`
}

type PendingFile = { file: File; id: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: (ticketId: string, emailSent: boolean, emailError?: string) => void
  /** Admin only — list of clients to choose from. Omit for client role. */
  adminClients?: { id: string; name: string }[]
  /** Pre-selected client (for client role — pass client_id from auth). */
  defaultClientId?: string
  isAdmin: boolean
}

export function NewTicketModal({
  isOpen, onClose, onCreated, adminClients, defaultClientId, isAdmin,
}: Props) {
  const [clientId,   setClientId]   = useState(defaultClientId ?? "")
  const [subject,    setSubject]    = useState("")
  const [category,   setCategory]   = useState<TicketCategory | "">("")
  const [message,    setMessage]    = useState("")
  const [files,      setFiles]      = useState<PendingFile[]>([])
  const [uploading,  setUploading]  = useState(false)
  const [error,      setError]      = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setClientId(defaultClientId ?? "")
    setSubject(""); setCategory(""); setMessage(""); setFiles([]); setError("")
  }

  function handleClose() { reset(); onClose() }

  function addFiles(fileList: FileList) {
    const next: PendingFile[] = []
    for (const f of Array.from(fileList)) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setError(`"${f.name}" is not an allowed file type.`)
        continue
      }
      if (f.size > MAX_SIZE) {
        setError(`"${f.name}" exceeds the 10 MB size limit.`)
        continue
      }
      next.push({ file: f, id: crypto.randomUUID() })
    }
    setFiles((prev) => [...prev, ...next])
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleSubmit() {
    if (isAdmin && !clientId) { setError("Please select a client."); return }
    if (!subject.trim())      { setError("Subject is required."); return }
    if (!category)            { setError("Please select a category."); return }
    if (!message.trim())      { setError("Message is required."); return }

    setError(""); setUploading(true)

    try {
      // Upload attachments from browser if any
      const attachments: TicketAttachment[] = []
      if (files.length > 0 && isSupabaseConfigured()) {
        const supabase = createBrowserClient()
        for (const { file } of files) {
          const ext  = file.name.split(".").pop()?.toLowerCase() ?? ""
          const path = `uploads/${crypto.randomUUID()}.${ext}`
          const { error: upErr } = await supabase.storage
            .from("support-attachments")
            .upload(path, file, { contentType: file.type })
          if (upErr) { setError(`Upload failed: ${upErr.message}`); setUploading(false); return }
          attachments.push({ name: file.name, path, size: file.size, type: file.type })
        }
      }

      // Lazy-import server action to avoid bundling it on the client
      const { createTicket } = await import("@/app/help/actions")
      const { ticket, emailSent, emailError } = await createTicket({
        clientId: clientId || (defaultClientId ?? ""),
        subject: subject.trim(),
        category: category as TicketCategory,
        message: message.trim(),
        attachments,
      })

      reset()
      onCreated(ticket.id, emailSent, emailError)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket.")
    } finally {
      setUploading(false)
    }
  }

  const inputCls = "w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Support Ticket"
      size="md"
      zIndex={55}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <div className="flex items-center gap-2 text-[12px] text-red-600">
              <AlertCircle className="size-3.5 shrink-0" />{error}
            </div>
          )}
          <div className="flex justify-between">
            <button onClick={handleClose} disabled={uploading}
              className="px-3 py-1.5 text-[13px] font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={uploading}
              className="px-5 py-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60">
              {uploading ? "Submitting…" : "Submit Ticket"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Client (admin only) */}
        {isAdmin && adminClients && (
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Client <span className="text-red-400">*</span>
            </label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
              <option value="">Select client…</option>
              {adminClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Subject */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Subject <span className="text-red-400">*</span>
          </label>
          <input
            value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief description of your issue"
            className={inputCls}
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Category <span className="text-red-400">*</span>
          </label>
          <select value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)} className={inputCls}>
            <option value="">Select category…</option>
            {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Message */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Message <span className="text-red-400">*</span>
          </label>
          <textarea
            value={message} onChange={(e) => setMessage(e.target.value)}
            rows={5} placeholder="Describe your issue in detail…"
            className={`${inputCls} resize-none`}
          />
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Attachments <span className="text-gray-300 font-normal normal-case">(optional, max 10 MB each)</span>
          </label>
          <input
            ref={fileRef} type="file" multiple accept={ACCEPT}
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition-colors w-full justify-center">
            <Paperclip className="size-3.5" />
            Attach files
          </button>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map(({ file, id }) => (
                <li key={id} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5 text-[12px]">
                  <span className="truncate text-gray-700 max-w-[240px]">{file.name}</span>
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
        </div>
      </div>
    </Modal>
  )
}
