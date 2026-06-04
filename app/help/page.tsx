"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Mail, Phone, MapPin, Globe, Plus, RefreshCw,
  MessageSquare, Clock, CheckCircle, AlertCircle,
  Tag, Archive, RotateCcw,
} from "lucide-react"
import { useRole, useAuthUser, useIsMockMode, useCompanyBranding, useClients } from "@/components/layout/app-shell"
import { NewTicketModal }    from "@/components/help/new-ticket-modal"
import { TicketDetailModal } from "@/components/help/ticket-detail-modal"
import type { SupportTicket, TicketMessage, TicketStatus } from "@/lib/types"
import {
  listTickets,
  getTicketWithMessages,
  archiveTicket,
  restoreTicket,
} from "@/app/help/actions"

// ── Helpers ───────────────────────────────────────────────────

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return "just now"
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function statusColor(status: TicketStatus): string {
  switch (status) {
    case "Open":                return "bg-blue-50 text-blue-700 border-blue-200"
    case "Waiting for Client":  return "bg-amber-50 text-amber-700 border-amber-200"
    case "Waiting for Admin":   return "bg-violet-50 text-violet-700 border-violet-200"
    case "Resolved":            return "bg-green-50 text-green-700 border-green-200"
    case "Archived":            return "bg-gray-50 text-gray-500 border-gray-200"
  }
}

function StatusChip({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor(status)}`}>
      {status}
    </span>
  )
}

// ── Contact info card ─────────────────────────────────────────

function ContactCard() {
  const b = useCompanyBranding()
  const items = [
    b.companyEmail   && { icon: Mail,   label: "Email",   value: b.companyEmail,   href: `mailto:${b.companyEmail}` },
    b.companyPhone   && { icon: Phone,  label: "Phone",   value: b.companyPhone,   href: `tel:${b.companyPhone}` },
    b.companyAddress && { icon: MapPin, label: "Address", value: b.companyAddress, href: undefined },
    b.companyWebsite && { icon: Globe,  label: "Website", value: b.companyWebsite, href: b.companyWebsite },
  ].filter(Boolean) as { icon: typeof Mail; label: string; value: string; href?: string }[]

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-[15px] font-semibold text-gray-900 mb-1">
        Contact {b.companyName}
      </h2>
      <p className="text-[13px] text-gray-500 mb-4">
        You can contact us directly by email or phone, or create a support ticket below.
      </p>
      {items.length === 0 ? (
        <p className="text-[12px] text-gray-400 italic">Contact information not configured.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map(({ icon: Icon, label, value, href }) => (
            <div key={label} className="flex items-start gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-3.5 py-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <Icon className="size-3.5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                {href ? (
                  <a href={href} target={label === "Website" ? "_blank" : undefined} rel="noreferrer"
                    className="text-[13px] text-blue-600 hover:underline break-all leading-snug mt-0.5 block">
                    {value}
                  </a>
                ) : (
                  <p className="text-[13px] text-gray-700 whitespace-pre-line leading-snug mt-0.5">{value}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function HelpPage() {
  const { role }     = useRole()
  const authUser     = useAuthUser()
  const isMockMode   = useIsMockMode()
  const { clients }  = useClients()

  const isAdmin = role === "admin"

  const [tickets,      setTickets]      = useState<SupportTicket[]>([])
  // loading starts true in Supabase mode (first fetch pending), false in mock mode
  const [loading,      setLoading]      = useState(!isMockMode)
  const [loadError,    setLoadError]    = useState("")
  const [newOpen,      setNewOpen]      = useState(false)
  const [detailTicket, setDetailTicket] = useState<SupportTicket | null>(null)
  const [detailMsgs,   setDetailMsgs]   = useState<TicketMessage[]>([])
  const [detailLoading,setDetailLoading]= useState(false)
  const [flashMsg,     setFlashMsg]     = useState<{ text: string; warn?: boolean } | null>(null)
  // Default to "Open" so users land on actionable tickets
  const [filterStatus, setFilterStatus] = useState<TicketStatus | "all">("Open")
  const [filterClient, setFilterClient] = useState("")

  function flash(text: string, warn = false) {
    setFlashMsg({ text, warn })
    if (!warn) setTimeout(() => setFlashMsg(null), 3500)
  }

  // All setState calls happen AFTER the first await so the effect that calls
  // load() never triggers synchronous setState (satisfies react-hooks/set-state-in-effect).
  const load = useCallback(async () => {
    try {
      const data = await listTickets()
      setLoadError("")
      setTickets(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load tickets.")
    } finally {
      setLoading(false)
    }
  }, [])

  // Only runs in Supabase mode; mock mode needs no fetch.
  // setState inside load() is called only after await (async boundary), so this is safe.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!isMockMode) void load() }, [load, isMockMode])

  async function openTicket(t: SupportTicket) {
    setDetailTicket(t); setDetailMsgs([]); setDetailLoading(true)
    try {
      const { ticket, messages } = await getTicketWithMessages(t.id)
      setDetailTicket(ticket)
      setDetailMsgs(messages)
    } catch {
      // keep existing ticket, no messages
    } finally {
      setDetailLoading(false)
    }
  }

  function handleReplied(newMsg: TicketMessage, emailSent: boolean, emailError?: string) {
    setDetailMsgs((p) => [...p, newMsg])
    if (emailError === "not-configured") flash("Reply saved. Email provider is not configured.", true)
    else flash("Reply sent.")
    // Refresh list
    void load()
  }

  function handleStatusChanged(id: string, status: TicketStatus) {
    setTickets((p) => p.map((t) => t.id === id ? { ...t, status } : t))
    if (detailTicket?.id === id) setDetailTicket((t) => t ? { ...t, status } : t)
  }

  function handleArchived(id: string) {
    setTickets((p) => p.map((t) => t.id === id
      ? { ...t, status: "Archived" as TicketStatus, archivedAt: new Date().toISOString() }
      : t))
    flash("Ticket archived.")
  }

  function handleRestored(id: string) {
    setTickets((p) => p.map((t) => t.id === id
      ? { ...t, status: "Open" as TicketStatus, archivedAt: null }
      : t))
    flash("Ticket reopened.")
  }

  async function quickArchive(id: string) {
    try { await archiveTicket(id); handleArchived(id) }
    catch (err) { flash(err instanceof Error ? err.message : "Failed.", true) }
  }

  async function quickRestore(id: string) {
    try { await restoreTicket(id); handleRestored(id) }
    catch (err) { flash(err instanceof Error ? err.message : "Failed.", true) }
  }

  // Filtered list
  const shown = tickets.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false
    if (isAdmin && filterClient && t.clientId !== filterClient) return false
    return true
  })

  // Admin clients for New Ticket modal
  const adminClients = isAdmin
    ? clients.map((c) => ({ id: c.id, name: c.companyName ?? "" }))
    : undefined

  const STATUSES: TicketStatus[] = [
    "Open", "Waiting for Admin", "Waiting for Client", "Resolved", "Archived",
  ]

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900 leading-tight">Help & Support</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {isAdmin ? "Manage support tickets from all clients" : "Contact us or view your support tickets"}
          </p>
        </div>
        <button onClick={() => setNewOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors shadow-sm shrink-0">
          <Plus className="size-4" />
          New Ticket
        </button>
      </div>

      {/* Flash */}
      {flashMsg && (
        <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 ${
          flashMsg.warn ? "border-amber-100 bg-amber-50" : "border-green-100 bg-green-50"}`}>
          <AlertCircle className={`size-4 mt-0.5 shrink-0 ${flashMsg.warn ? "text-amber-500" : "text-green-600"}`} />
          <p className={`text-[13px] flex-1 ${flashMsg.warn ? "text-amber-700" : "text-green-700"}`}>{flashMsg.text}</p>
          <button onClick={() => setFlashMsg(null)} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* Contact info */}
      <ContactCard />

      {/* Tickets section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200">
          {/* Status filter */}
          <select value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TicketStatus | "all")}
            className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="all">All Statuses</option>
          </select>

          {/* Client filter (admin) */}
          {isAdmin && clients.length > 0 && (
            <select value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600">
              <option value="">All Clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
          )}

          <button onClick={() => { setLoading(true); void load() }} disabled={loading}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 text-[12px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {isMockMode ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-8">
              <div className="flex size-12 items-center justify-center rounded-full bg-blue-50">
                <MessageSquare className="size-6 text-blue-400" />
              </div>
              <p className="text-[14px] font-semibold text-gray-700">Tickets require Supabase</p>
              <p className="text-[13px] text-gray-400 max-w-xs">
                Support tickets are stored in the database. Connect Supabase to enable this feature.
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="size-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center py-16 gap-2 text-red-500">
              <AlertCircle className="size-4" />
              <p className="text-[13px]">{loadError}</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-gray-50">
                <MessageSquare className="size-6 text-gray-300" />
              </div>
              <p className="text-[14px] font-semibold text-gray-500">
                {filterStatus === "all" ? "No tickets" : `No ${filterStatus.toLowerCase()} tickets`}
              </p>
              {filterStatus === "Open" && (
                <p className="text-[13px] text-gray-400">
                  Need help? Click <strong>New Ticket</strong> to get in touch.
                </p>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ticket</th>
                  {isAdmin && <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Client</th>}
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Messages</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Updated</th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id}
                    onClick={() => openTicket(t)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer group transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-[12px] font-semibold text-blue-600 group-hover:underline">
                        {t.ticketNumber}
                      </p>
                      <p className="text-[12px] text-gray-700 mt-0.5 max-w-[200px] truncate">{t.subject}</p>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-[12px] text-gray-500">{t.clientName}</td>
                    )}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                        <Tag className="size-3 shrink-0" />{t.category}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusChip status={t.status} /></td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-[12px] text-gray-500">
                        <MessageSquare className="size-3" />{t.messageCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-400 whitespace-nowrap">
                      {timeAgo(t.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {t.status === "Resolved" && (
                        <button onClick={() => quickArchive(t.id)}
                          title="Archive"
                          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                          <Archive className="size-3.5" />
                        </button>
                      )}
                      {t.status === "Archived" && isAdmin && (
                        <button onClick={() => quickRestore(t.id)}
                          title="Reopen"
                          className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                          <RotateCcw className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer counts */}
        {!isMockMode && !loading && shown.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50/50 flex items-center gap-4 text-[12px] text-gray-500">
            <span className="flex items-center gap-1.5"><Clock className="size-3" />
              {shown.filter(t => t.status === "Open").length} Open
            </span>
            <span className="flex items-center gap-1.5"><CheckCircle className="size-3" />
              {shown.filter(t => t.status === "Resolved").length} Resolved
            </span>
            <span className="ml-auto text-gray-400">{shown.length} ticket{shown.length !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* New Ticket modal */}
      <NewTicketModal
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(_ticketId, emailSent, emailError) => {
          setNewOpen(false)
          if (emailError === "not-configured") flash("Ticket created. Email provider is not configured.", true)
          else flash("Ticket created successfully.")
          void load()
        }}
        adminClients={adminClients}
        defaultClientId={!isAdmin ? (authUser?.clientId ?? "") : ""}
        isAdmin={isAdmin}
      />

      {/* Ticket detail modal */}
      <TicketDetailModal
        ticket={detailTicket}
        messages={detailLoading ? [] : detailMsgs}
        isAdmin={isAdmin}
        onClose={() => { setDetailTicket(null); setDetailMsgs([]) }}
        onReplied={handleReplied}
        onStatusChanged={handleStatusChanged}
        onArchived={handleArchived}
        onRestored={handleRestored}
      />
    </div>
  )
}
