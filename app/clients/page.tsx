"use client"

import { useState, useMemo } from "react"
import {
  Search, Plus, Pencil, Trash2,
  Mail, MailCheck, KeyRound, UserMinus,
  Users, UserCheck, UserX, UserPlus,
  ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle, Archive, ArchiveRestore,
} from "lucide-react"
import { useRole, useClients, useIsMockMode } from "@/components/layout/app-shell"
import { DataTable } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { IconButton } from "@/components/ui/icon-button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatCard } from "@/components/ui/stat-card"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { ClientModal, type ClientFormData } from "@/components/clients/client-modal"
import {
  createClient,
  updateClient,
  archiveClient,
  listArchivedClients,
  restoreClient,
  deleteClientPermanently,
  sendInvite,
  resendInvite,
  resetPassword,
  disableLogin,
  enableLogin,
  listClients,
} from "@/app/clients/actions"
import type { Client, ClientStatus, DataTableColumn } from "@/lib/types"

const PAGE_SIZE = 8

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-amber-600",
  "bg-indigo-500",
]

function avatarColor(id: string) {
  const n = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")
}

export default function ClientsPage() {
  const { role }   = useRole()
  const isMockMode = useIsMockMode()
  const { clients, setClients } = useClients()

  const [search,       setSearch]       = useState("")
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all")
  const [page,         setPage]         = useState(1)
  const [activeTab,    setActiveTab]    = useState<"active" | "archived">("active")
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editing,      setEditing]      = useState<Client | null>(null)
  const [archiveTarget,         setArchiveTarget]         = useState<Client | null>(null)
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Client | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError,   setActionError]  = useState<string | null>(null)
  // Tracks which button is currently loading: "<clientId>:<action>"
  const [loadingKey,    setLoadingKey]   = useState<string | null>(null)

  // Archived clients — loaded lazily in Supabase mode
  const [archivedClients, setArchivedClients] = useState<Client[]>([])
  const [archivedLoaded,  setArchivedLoaded]  = useState(false)
  const [archivedLoading, setArchivedLoading] = useState(false)

  // Active clients = non-archived entries in context
  const visible = clients.filter((c) => !c.isArchived)

  // Data for the current tab
  const currentTabData = activeTab === "active"
    ? visible
    : isMockMode
      ? clients.filter((c) => c.isArchived)
      : archivedClients

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return currentTabData.filter((c) => {
      const matchSearch =
        !q ||
        c.companyName.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      const matchStatus = statusFilter === "all" || c.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [currentTabData, search, statusFilter])

  /* Non-admin gate — after all hooks */
  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-gray-100">
          <Users className="size-6 text-gray-400" />
        </div>
        <p className="text-[15px] font-semibold text-gray-700">Admin access only</p>
        <p className="text-[13px] text-gray-400">Switch to Admin view to manage clients.</p>
      </div>
    )
  }

  /* ── Stat counts (always based on active clients) ─────────── */
  const counts = {
    active:   visible.filter((c) => c.status === "Active").length,
    pending:  visible.filter((c) => c.status === "Pending").length,
    inactive: visible.filter((c) => c.status === "Inactive").length,
    invited:  visible.filter((c) => c.loginStatus === "Invite Sent").length,
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* ── Helpers ──────────────────────────────────────────────── */
  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(c: Client) { setEditing(c); setModalOpen(true) }

  function flashError(msg: string) {
    setActionError(msg)
    setActionSuccess(null)
    setTimeout(() => setActionError(null), 6000)
  }

  function flashSuccess(msg: string) {
    setActionSuccess(msg)
    setActionError(null)
    setTimeout(() => setActionSuccess(null), 5000)
  }

  /* ── Tab switch ───────────────────────────────────────────── */
  async function handleTabChange(tab: "active" | "archived") {
    setActiveTab(tab)
    setPage(1)
    if (tab === "archived" && !archivedLoaded && !isMockMode) {
      setArchivedLoading(true)
      try {
        const data = await listArchivedClients()
        setArchivedClients(data)
        setArchivedLoaded(true)
      } catch (err) {
        flashError(err instanceof Error ? err.message : "Failed to load archived clients.")
      } finally {
        setArchivedLoading(false)
      }
    }
  }

  /* ── Save ─────────────────────────────────────────────────── */
  async function handleSave(data: ClientFormData) {
    if (isMockMode) {
      if (editing) {
        setClients((prev) => prev.map((c) => c.id === editing.id ? { ...c, ...data } : c))
      } else {
        const newClient: Client = {
          id:          `c${Date.now()}`,
          companyName: data.companyName,
          contactName: data.contactName,
          email:       data.email,
          phone:       data.phone,
          notes:       data.notes,
          status:      data.status,
          loginStatus: "No Login",
          lastActivity: null,
        }
        setClients((prev) => [newClient, ...prev])
      }
      setModalOpen(false)
      return
    }

    if (editing) {
      await updateClient(editing.id, data)
    } else {
      await createClient(data)
    }
    setClients(await listClients())
    setModalOpen(false)
  }

  /* ── Archive ──────────────────────────────────────────────── */
  async function handleArchive(c: Client) {
    if (isMockMode) {
      setClients((prev) => prev.map((x) => x.id === c.id ? { ...x, isArchived: true } : x))
      setArchiveTarget(null)
      return
    }
    try {
      await archiveClient(c.id)
      setClients(await listClients())
      setArchivedLoaded(false)
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Failed to archive client.")
    }
    setArchiveTarget(null)
  }

  /* ── Restore ──────────────────────────────────────────────── */
  async function handleRestore(c: Client) {
    if (isMockMode) {
      setClients((prev) => prev.map((x) => x.id === c.id ? { ...x, isArchived: false } : x))
      return
    }
    try {
      await restoreClient(c.id)
      setArchivedClients((prev) => prev.filter((x) => x.id !== c.id))
      setClients(await listClients())
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Failed to restore client.")
    }
  }

  /* ── Permanent delete ─────────────────────────────────────── */
  async function handlePermanentDelete(c: Client) {
    if (isMockMode) {
      setClients((prev) => prev.filter((x) => x.id !== c.id))
      setPermanentDeleteTarget(null)
      return
    }
    try {
      await deleteClientPermanently(c.id)
      setArchivedClients((prev) => prev.filter((x) => x.id !== c.id))
      setClients(await listClients())
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Failed to delete client.")
    }
    setPermanentDeleteTarget(null)
  }

  /* ── Send / resend invite ─────────────────────────────────── */
  async function handleSendInvite(c: Client) {
    const key = `${c.id}:invite`
    if (isMockMode) {
      const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      setClients((prev) =>
        prev.map((x) =>
          x.id === c.id
            ? { ...x, loginStatus: "Invite Sent", invitedAt: x.invitedAt ?? now,
                lastInviteSentAt: now, inviteCount: (x.inviteCount ?? 0) + 1 }
            : x
        )
      )
      flashSuccess("Invite sent successfully.")
      return
    }
    setLoadingKey(key)
    try {
      const updated = await sendInvite(c.id)
      setClients((prev) => prev.map((x) => x.id === updated.id ? updated : x))
      flashSuccess("Invite sent successfully.")
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Could not send invite.")
    } finally {
      setLoadingKey(null)
    }
  }

  /* ── Resend invite (dedicated — uses resendInvite action) ─── */
  async function handleResendInvite(c: Client) {
    const key = `${c.id}:invite`
    if (isMockMode) {
      const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      setClients((prev) =>
        prev.map((x) =>
          x.id === c.id
            ? { ...x, loginStatus: "Invite Sent", invitedAt: x.invitedAt ?? now,
                lastInviteSentAt: now, inviteCount: (x.inviteCount ?? 0) + 1 }
            : x
        )
      )
      flashSuccess("Setup link sent successfully.")
      return
    }
    setLoadingKey(key)
    try {
      const result = await resendInvite(c.id)
      if (!result.ok) { flashError(result.error); return }
      setClients((prev) => prev.map((x) => x.id === result.client.id ? result.client : x))
      flashSuccess("Setup link sent successfully.")
    } finally {
      setLoadingKey(null)
    }
  }

  /* ── Reset password ───────────────────────────────────────── */
  async function handleResetPassword(c: Client) {
    const key = `${c.id}:reset`
    if (isMockMode) { flashSuccess("Password reset email sent successfully."); return }
    setLoadingKey(key)
    try {
      const result = await resetPassword(c.id)
      if (!result.ok) { flashError(result.error); return }
      flashSuccess("Password reset email sent successfully.")
    } finally {
      setLoadingKey(null)
    }
  }

  /* ── Disable login ────────────────────────────────────────── */
  async function handleDisableLogin(c: Client) {
    const key = `${c.id}:disable`
    if (isMockMode) {
      setClients((prev) => prev.map((x) => x.id === c.id ? { ...x, loginStatus: "Disabled" } : x))
      return
    }
    setLoadingKey(key)
    try {
      const updated = await disableLogin(c.id)
      setClients((prev) => prev.map((x) => x.id === updated.id ? updated : x))
      flashSuccess("Login disabled.")
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Failed to disable login.")
    } finally {
      setLoadingKey(null)
    }
  }

  /* ── Enable login ─────────────────────────────────────────── */
  async function handleEnableLogin(c: Client) {
    const key = `${c.id}:enable`
    if (isMockMode) {
      setClients((prev) => prev.map((x) => x.id === c.id ? { ...x, loginStatus: "Active" } : x))
      flashSuccess("Login enabled.")
      return
    }
    setLoadingKey(key)
    try {
      const updated = await enableLogin(c.id)
      setClients((prev) => prev.map((x) => x.id === updated.id ? updated : x))
      flashSuccess("Login enabled.")
    } catch (err) {
      flashError(err instanceof Error ? err.message : "Failed to enable login.")
    } finally {
      setLoadingKey(null)
    }
  }

  function handleStatClick(s: ClientStatus) {
    setStatusFilter((prev) => (prev === s ? "all" : s))
    setPage(1)
  }

  const clientInfoColumns: DataTableColumn<Client>[] = [
    {
      id: "client",
      header: "Client",
      cell: (row) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`flex size-8 shrink-0 items-center justify-center rounded-full text-white text-[11px] font-bold select-none ${avatarColor(row.id)}`}
          >
            {initials(row.companyName)}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-900 truncate max-w-[160px]">
              {row.companyName}
            </p>
            {row.notes && (
              <p className="text-[11px] text-gray-400 truncate max-w-[160px]">{row.notes}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact Name",
      cell: (row) => <span className="text-[13px] text-gray-700">{row.contactName}</span>,
    },
    {
      id: "email",
      header: "Email",
      cell: (row) => (
        <a
          href={`mailto:${row.email}`}
          className="text-[12px] text-blue-600 hover:underline truncate block max-w-[180px]"
        >
          {row.email}
        </a>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      cell: (row) => (
        <span className="text-[12px] text-gray-500 whitespace-nowrap">
          {row.phone || <span className="text-gray-300">—</span>}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      id: "loginStatus",
      header: "Login",
      cell: (row) => (
        <div>
          <StatusBadge status={row.loginStatus} />
          {(row.inviteCount ?? 0) > 0 && (
            <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
              {row.inviteCount} invite{row.inviteCount !== 1 ? "s" : ""}
              {row.lastInviteSentAt && <> · {row.lastInviteSentAt}</>}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "lastActivity",
      header: "Last Activity",
      cell: (row) => (
        <span className="text-[12px] text-gray-400 whitespace-nowrap">
          {row.lastActivity ?? <span className="text-gray-300">Never</span>}
        </span>
      ),
    },
  ]

  /* ── Active tab columns ───────────────────────────────────── */
  const activeColumns: DataTableColumn<Client>[] = [
    ...clientInfoColumns,
    {
      id: "actions",
      header: "Actions",
      headerClassName: "text-right w-36",
      className: "text-right w-36",
      cell: (row) => {
        const ls             = row.loginStatus
        const inviteLoading  = loadingKey === `${row.id}:invite`
        const resetLoading   = loadingKey === `${row.id}:reset`
        const disableLoading = loadingKey === `${row.id}:disable`
        const enableLoading  = loadingKey === `${row.id}:enable`
        const rowBusy        = inviteLoading || resetLoading || disableLoading || enableLoading

        function Spinner() {
          return <div className="size-3 rounded-full border border-current border-t-transparent animate-spin" />
        }

        return (
          // Keep visible while loading so the spinner stays in view
          <div className={`flex items-center justify-end gap-0.5 transition-opacity ${
            rowBusy ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}>
            <IconButton variant="primary" title="Edit Client"
              disabled={rowBusy} onClick={() => openEdit(row)}>
              <Pencil className="size-3.5" />
            </IconButton>

            {/* No Login → Send Invite */}
            {ls === "No Login" && (
              <IconButton variant="primary" title="Send Invite"
                disabled={rowBusy} onClick={() => handleSendInvite(row)}>
                {inviteLoading ? <Spinner /> : <Mail className="size-3.5" />}
              </IconButton>
            )}

            {/* Invite Sent → Resend | Password Reset | Disable */}
            {ls === "Invite Sent" && (<>
              <IconButton variant="primary"
                title={`Resend Invite${row.lastInviteSentAt ? ` (last: ${row.lastInviteSentAt})` : ""}`}
                disabled={rowBusy} onClick={() => handleResendInvite(row)}>
                {inviteLoading ? <Spinner /> : <MailCheck className="size-3.5" />}
              </IconButton>
              <IconButton variant="default" title="Send Password Reset"
                disabled={rowBusy} onClick={() => handleResetPassword(row)}>
                {resetLoading ? <Spinner /> : <KeyRound className="size-3.5" />}
              </IconButton>
              <IconButton variant="danger" title="Disable Login"
                disabled={rowBusy} onClick={() => handleDisableLogin(row)}>
                {disableLoading ? <Spinner /> : <UserMinus className="size-3.5" />}
              </IconButton>
            </>)}

            {/* Active → Password Reset | Disable */}
            {ls === "Active" && (<>
              <IconButton variant="default" title="Send Password Reset"
                disabled={rowBusy} onClick={() => handleResetPassword(row)}>
                {resetLoading ? <Spinner /> : <KeyRound className="size-3.5" />}
              </IconButton>
              <IconButton variant="danger" title="Disable Login"
                disabled={rowBusy} onClick={() => handleDisableLogin(row)}>
                {disableLoading ? <Spinner /> : <UserMinus className="size-3.5" />}
              </IconButton>
            </>)}

            {/* Disabled → Enable | Send Invite Again */}
            {ls === "Disabled" && (<>
              <IconButton variant="primary" title="Enable Login"
                disabled={rowBusy} onClick={() => handleEnableLogin(row)}>
                {enableLoading ? <Spinner /> : <UserCheck className="size-3.5" />}
              </IconButton>
              <IconButton variant="primary" title="Send Invite Again"
                disabled={rowBusy} onClick={() => handleResendInvite(row)}>
                {inviteLoading ? <Spinner /> : <Mail className="size-3.5" />}
              </IconButton>
            </>)}

            <IconButton variant="danger" title="Archive Client"
              disabled={rowBusy} onClick={() => setArchiveTarget(row)}>
              <Archive className="size-3.5" />
            </IconButton>
          </div>
        )
      },
    },
  ]

  /* ── Archived tab columns ─────────────────────────────────── */
  const archivedColumns: DataTableColumn<Client>[] = [
    ...clientInfoColumns,
    {
      id: "actions",
      header: "Actions",
      headerClassName: "text-right w-24",
      className: "text-right w-24",
      cell: (row) => (
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton variant="primary" title="Restore Client" onClick={() => handleRestore(row)}>
            <ArchiveRestore className="size-3.5" />
          </IconButton>
          <IconButton
            variant="danger"
            title="Delete Permanently"
            onClick={() => setPermanentDeleteTarget(row)}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      ),
    },
  ]

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900 leading-tight">Clients</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            Manage client accounts and portal access
          </p>
        </div>
        {activeTab === "active" && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors shadow-sm shrink-0"
          >
            <Plus className="size-4" />
            Add Client
          </button>
        )}
      </div>

      {/* Action success banner */}
      {actionSuccess && (
        <div className="flex items-start gap-2 rounded-lg border border-green-100 bg-green-50 px-4 py-3">
          <CheckCircle className="size-4 text-green-600 mt-0.5 shrink-0" />
          <p className="text-[13px] text-green-700 flex-1">{actionSuccess}</p>
          <button onClick={() => setActionSuccess(null)} className="text-gray-400 hover:text-gray-600 text-[12px] ml-auto shrink-0">✕</button>
        </div>
      )}

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
          <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-[13px] text-red-600 flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-gray-400 hover:text-gray-600 text-[12px] ml-auto shrink-0">✕</button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Active Clients"
          value={counts.active}
          icon={UserCheck}
          iconClass="bg-green-50 text-green-600"
          active={statusFilter === "Active"}
          onClick={() => handleStatClick("Active")}
        />
        <StatCard
          label="Pending"
          value={counts.pending}
          icon={Users}
          iconClass="bg-yellow-50 text-yellow-600"
          active={statusFilter === "Pending"}
          onClick={() => handleStatClick("Pending")}
        />
        <StatCard
          label="Inactive"
          value={counts.inactive}
          icon={UserX}
          iconClass="bg-slate-100 text-slate-500"
          active={statusFilter === "Inactive"}
          onClick={() => handleStatClick("Inactive")}
        />
        <StatCard
          label="Invited Users"
          value={counts.invited}
          icon={UserPlus}
          iconClass="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4">
          <button
            onClick={() => handleTabChange("active")}
            className={`py-3 px-1 mr-4 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "active"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => handleTabChange("archived")}
            className={`py-3 px-1 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "archived"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Archived
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search…"
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 bg-gray-50"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as ClientStatus | "all"); setPage(1) }}
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {archivedLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="size-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            </div>
          ) : (
            <DataTable
              columns={activeTab === "active" ? activeColumns : archivedColumns}
              data={paginated}
              keyExtractor={(c) => c.id}
              mobileCard={(c) => activeTab === "active" ? (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-white text-[11px] font-bold select-none ${avatarColor(c.id)}`}>
                    {initials(c.companyName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-gray-900 truncate max-w-[160px]">{c.companyName}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-[12px] text-gray-500 truncate">{c.contactName}</p>
                    <p className="text-[11px] text-gray-400 truncate">{c.email}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {(() => {
                      const busy = loadingKey?.startsWith(`${c.id}:`) ?? false
                      function Sp() { return <div className="size-3 rounded-full border border-current border-t-transparent animate-spin" /> }
                      return (<>
                        <IconButton variant="primary" title="Edit Client" disabled={busy} onClick={() => openEdit(c)}>
                          <Pencil className="size-3.5" />
                        </IconButton>
                        {c.loginStatus === "No Login" && (
                          <IconButton variant="primary" title="Send Invite" disabled={busy} onClick={() => handleSendInvite(c)}>
                            {loadingKey === `${c.id}:invite` ? <Sp /> : <Mail className="size-3.5" />}
                          </IconButton>
                        )}
                        {c.loginStatus === "Invite Sent" && (
                          <IconButton variant="primary" title="Resend Invite" disabled={busy} onClick={() => handleResendInvite(c)}>
                            {loadingKey === `${c.id}:invite` ? <Sp /> : <MailCheck className="size-3.5" />}
                          </IconButton>
                        )}
                        {(c.loginStatus === "Active" || c.loginStatus === "Invite Sent") && (
                          <IconButton variant="default" title="Reset Password" disabled={busy} onClick={() => handleResetPassword(c)}>
                            {loadingKey === `${c.id}:reset` ? <Sp /> : <KeyRound className="size-3.5" />}
                          </IconButton>
                        )}
                        {(c.loginStatus === "Active" || c.loginStatus === "Invite Sent") && (
                          <IconButton variant="danger" title="Disable Login" disabled={busy} onClick={() => handleDisableLogin(c)}>
                            {loadingKey === `${c.id}:disable` ? <Sp /> : <UserMinus className="size-3.5" />}
                          </IconButton>
                        )}
                        {c.loginStatus === "Disabled" && (
                          <IconButton variant="primary" title="Enable Login" disabled={busy} onClick={() => handleEnableLogin(c)}>
                            {loadingKey === `${c.id}:enable` ? <Sp /> : <UserCheck className="size-3.5" />}
                          </IconButton>
                        )}
                        <IconButton variant="danger" title="Archive" disabled={busy} onClick={() => setArchiveTarget(c)}>
                          <Archive className="size-3.5" />
                        </IconButton>
                      </>)
                    })()}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-white text-[11px] font-bold select-none ${avatarColor(c.id)}`}>
                    {initials(c.companyName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{c.companyName}</p>
                    <p className="text-[12px] text-gray-500 truncate">{c.contactName}</p>
                    <p className="text-[11px] text-gray-400 truncate">{c.email}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <IconButton variant="primary" title="Restore" onClick={() => handleRestore(c)}>
                      <ArchiveRestore className="size-3.5" />
                    </IconButton>
                    <IconButton variant="danger" title="Delete Permanently" onClick={() => setPermanentDeleteTarget(c)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                </div>
              )}
              emptyState={
                <EmptyState
                  title={activeTab === "active" ? "No clients found" : "No archived clients"}
                  description={
                    search || statusFilter !== "all"
                      ? "Try adjusting your search or filters."
                      : activeTab === "active"
                        ? "Add your first client to get started."
                        : "Archived clients will appear here."
                  }
                  action={
                    activeTab === "active" && !search && statusFilter === "all" ? (
                      <button
                        onClick={openCreate}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="size-4" />
                        Add Client
                      </button>
                    ) : undefined
                  }
                />
              }
            />
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50 shrink-0">
          <p className="text-[12px] text-gray-500">
            Showing{" "}
            <span className="font-medium text-gray-700">
              {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium text-gray-700">
              {Math.min(safePage * PAGE_SIZE, filtered.length)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-gray-700">{filtered.length}</span>{" "}
            clients
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="flex size-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
              .reduce<(number | "…")[]>((acc, n, i, arr) => {
                if (i > 0 && (arr[i - 1] as number) !== n - 1) acc.push("…")
                acc.push(n)
                return acc
              }, [])
              .map((n, i) =>
                n === "…" ? (
                  <span key={`e${i}`} className="px-1 text-[12px] text-gray-400">…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n as number)}
                    className={`flex size-7 items-center justify-center rounded-md text-[12px] font-medium transition-colors ${
                      safePage === n
                        ? "bg-blue-600 text-white"
                        : "border border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {n}
                  </button>
                )
              )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="flex size-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit modal */}
      <ClientModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        client={editing}
      />

      {/* Archive confirm */}
      <ConfirmModal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => { if (archiveTarget) handleArchive(archiveTarget) }}
        title="Archive client?"
        message="This client will be moved to Archive. Their history will be preserved."
        confirmLabel="Archive Client"
        variant="danger"
      />

      {/* Permanent delete confirm */}
      <ConfirmModal
        isOpen={!!permanentDeleteTarget}
        onClose={() => setPermanentDeleteTarget(null)}
        onConfirm={() => { if (permanentDeleteTarget) handlePermanentDelete(permanentDeleteTarget) }}
        title="Delete client permanently?"
        message="This will permanently delete the client from Supabase. This action cannot be undone. The email can be used again for a new client account."
        confirmLabel="Delete Permanently"
        variant="danger"
      />
    </div>
  )
}
