"use client"

import { useState, useMemo } from "react"
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Mail,
  MailCheck,
  KeyRound,
  Users,
  UserCheck,
  UserX,
  UserPlus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { useRole, useClients } from "@/components/layout/app-shell"
import { DataTable } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { IconButton } from "@/components/ui/icon-button"
import { EmptyState } from "@/components/ui/empty-state"
import { StatCard } from "@/components/ui/stat-card"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { ClientModal, type ClientFormData } from "@/components/clients/client-modal"
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
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")
}

export default function ClientsPage() {
  const { role } = useRole()
  const { clients, setClients } = useClients()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all")
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [inviteSent, setInviteSent] = useState<string | null>(null)

  /* Redirect non-admins */
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

  const visible = clients.filter((c) => !c.isArchived)

  /* ── Stat counts ─────────────────────────────────── */
  const counts = {
    active: visible.filter((c) => c.status === "Active").length,
    pending: visible.filter((c) => c.status === "Pending").length,
    inactive: visible.filter((c) => c.status === "Inactive").length,
    invited: visible.filter((c) => c.loginStatus === "Invited").length,
  }

  /* ── Filtered + paginated ────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return visible.filter((c) => {
      const matchSearch =
        !q ||
        c.companyName.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      const matchStatus = statusFilter === "all" || c.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [visible, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* ── Actions ─────────────────────────────────────── */
  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(c: Client) {
    setEditing(c)
    setModalOpen(true)
  }

  function handleSave(data: ClientFormData) {
    if (editing) {
      setClients((prev) =>
        prev.map((c) =>
          c.id === editing.id
            ? { ...c, ...data }
            : c
        )
      )
    } else {
      const newClient: Client = {
        id: `c${Date.now()}`,
        companyName: data.companyName,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        notes: data.notes,
        status: data.status,
        loginStatus: "No Login",
        lastActivity: null,
      }
      setClients((prev) => [newClient, ...prev])
    }
    setModalOpen(false)
  }

  function handleDelete(c: Client) {
    setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, isArchived: true } : x)))
    setDeleteTarget(null)
  }

  function handleSendInvite(c: Client) {
    setClients((prev) =>
      prev.map((x) =>
        x.id === c.id
          ? {
              ...x,
              loginStatus: "Invited",
              invitedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            }
          : x
      )
    )
    setInviteSent(c.id)
    setTimeout(() => setInviteSent(null), 2500)
  }

  function handleStatClick(s: ClientStatus) {
    setStatusFilter((prev) => (prev === s ? "all" : s))
    setPage(1)
  }

  /* ── Columns ─────────────────────────────────────── */
  const columns: DataTableColumn<Client>[] = [
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
      cell: (row) => (
        <span className="text-[13px] text-gray-700">{row.contactName}</span>
      ),
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
      header: "Login Status",
      cell: (row) => <StatusBadge status={row.loginStatus} />,
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
    {
      id: "actions",
      header: "Actions",
      headerClassName: "text-right w-32",
      className: "text-right w-32",
      cell: (row) => {
        const justSent = inviteSent === row.id
        return (
          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Edit */}
            <IconButton variant="primary" title="Edit Client" onClick={() => openEdit(row)}>
              <Pencil className="size-3.5" />
            </IconButton>

            {/* Send invite — only if No Login */}
            {row.loginStatus === "No Login" && (
              <IconButton
                variant="primary"
                title="Send Registration Invite"
                onClick={() => handleSendInvite(row)}
                className={justSent ? "text-green-600 bg-green-50" : ""}
              >
                <Mail className="size-3.5" />
              </IconButton>
            )}

            {/* Resend invite — only if Invited */}
            {row.loginStatus === "Invited" && (
              <IconButton
                variant="primary"
                title={`Resend Invite${row.invitedAt ? ` (sent ${row.invitedAt})` : ""}`}
                onClick={() => handleSendInvite(row)}
                className={justSent ? "text-green-600 bg-green-50" : ""}
              >
                <MailCheck className="size-3.5" />
              </IconButton>
            )}

            {/* Reset password — only if Active login */}
            {row.loginStatus === "Active" && (
              <IconButton
                variant="default"
                title="Reset Password"
                onClick={() => {}}
              >
                <KeyRound className="size-3.5" />
              </IconButton>
            )}

            {/* Archive / Delete */}
            <IconButton
              variant="danger"
              title="Remove Client"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        )
      },
    },
  ]

  /* ── Render ──────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900 leading-tight">Clients</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            Manage client accounts and portal access
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors shadow-sm"
        >
          <Plus className="size-4" />
          Add Client
        </button>
      </div>

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
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by company, contact, email…"
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
          <DataTable
            columns={columns}
            data={paginated}
            keyExtractor={(c) => c.id}
            emptyState={
              <EmptyState
                title="No clients found"
                description={
                  search || statusFilter !== "all"
                    ? "Try adjusting your search or filters."
                    : "Add your first client to get started."
                }
                action={
                  !search && statusFilter === "all" ? (
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

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget) }}
        title="Remove Client"
        message={`Remove ${deleteTarget?.companyName}? Their account will be archived and they will lose portal access.`}
        confirmLabel="Remove"
        variant="danger"
      />
    </div>
  )
}
