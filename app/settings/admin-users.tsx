"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, AlertCircle, CheckCircle2, UserCog } from "lucide-react"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { Modal } from "@/components/ui/modal"
import { cn } from "@/lib/utils"
import {
  listAdminUsers,
  createAdminUser,
  updateAdminDisplayName,
  removeAdminUser,
  type AdminUser,
} from "./actions"

// ── Helpers ───────────────────────────────────────────────────

function initials(name: string, email: string) {
  const src = name.trim() || email
  return src.split(/[\s@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")
}

const inputCls =
  "w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-gray-400"

// ── Add Admin Modal ───────────────────────────────────────────

function AddAdminModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [name,       setName]       = useState("")
  const [email,      setEmail]      = useState("")
  const [password,   setPassword]   = useState("")
  const [sendInvite, setSendInvite] = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState(false)

  async function handleSubmit() {
    setError(null)
    setSaving(true)
    try {
      await createAdminUser({ email, name, password, sendInvite })
      setSuccess(true)
      setTimeout(() => { onCreated(); onClose() }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create admin user.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Admin User"
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || success}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors disabled:opacity-60"
          >
            {success ? (
              <><CheckCircle2 className="size-3.5" /> Added!</>
            ) : saving ? "Adding…" : "Add Admin"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Display Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jane Smith"
            className={inputCls}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className={inputCls}
          />
        </div>

        {/* Method */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-2 uppercase tracking-wide">
            Setup Method
          </label>
          <div className="space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="method"
                checked={sendInvite}
                onChange={() => setSendInvite(true)}
                className="mt-0.5 accent-blue-600"
              />
              <div>
                <p className="text-[13px] font-medium text-gray-800">Send invite email</p>
                <p className="text-[11px] text-gray-400">User sets their own password via a secure link.</p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="method"
                checked={!sendInvite}
                onChange={() => setSendInvite(false)}
                className="mt-0.5 accent-blue-600"
              />
              <div>
                <p className="text-[13px] font-medium text-gray-800">Set temporary password</p>
                <p className="text-[11px] text-gray-400">Share credentials directly. User can reset later.</p>
              </div>
            </label>
          </div>
        </div>

        {!sendInvite && (
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Temporary Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className={inputCls}
            />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
            <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-red-600 leading-snug">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Edit Admin Modal ──────────────────────────────────────────

function EditAdminModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name,    setName]    = useState(user?.name ?? "")
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSave() {
    if (!user) return
    setError(null); setSaving(true)
    try {
      await updateAdminDisplayName(user.id, name)
      setSaved(true)
      setTimeout(() => { onSaved(); onClose() }, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={!!user}
      onClose={onClose}
      title="Edit Admin User"
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || saved}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors disabled:opacity-60">
            {saved ? <><CheckCircle2 className="size-3.5" /> Saved!</> : saving ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Display Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1 uppercase tracking-wide">
            Email
          </label>
          <p className="text-[13px] text-gray-500 font-mono">{user?.email}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            To change email, create a new admin account and remove this one.
          </p>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
            <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-[12px] text-red-600 leading-snug">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Main section ──────────────────────────────────────────────

export function AdminUsersSection({
  isMockMode,
  currentUserId,
}: {
  isMockMode: boolean
  currentUserId?: string
}) {
  const [users,         setUsers]         = useState<AdminUser[]>([])
  const [loading,       setLoading]       = useState(!isMockMode)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)
  const [addOpen,       setAddOpen]       = useState(false)
  const [editingUser,   setEditingUser]   = useState<AdminUser | null>(null)
  const [removeTarget,  setRemoveTarget]  = useState<AdminUser | null>(null)
  const [removing,      setRemoving]      = useState(false)

  // Refresh called from event handlers (add/remove/edit) — safe to setState synchronously.
  function refresh() {
    setLoading(true)
    listAdminUsers()
      .then((u) => { setUsers(u); setLoadError(null) })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load admin users."))
      .finally(() => setLoading(false))
  }

  // Initial load: setState only inside .then/.catch/.finally callbacks
  // so the effect body itself never calls setState synchronously.
  useEffect(() => {
    if (isMockMode) return
    listAdminUsers()
      .then(setUsers)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load admin users."))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleRemoveConfirm() {
    if (!removeTarget) return
    const targetId = removeTarget.id
    setRemoving(true)
    let err: string | null = null
    try {
      await removeAdminUser(targetId)
      refresh()
    } catch (e) {
      err = e instanceof Error ? e.message : "Failed to remove admin."
    }
    setRemoveTarget(null)
    setActionError(err)
    setRemoving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <div className="size-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        <p className="text-[13px] text-gray-400">Loading admin users…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
        <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
        <p className="text-[12px] text-red-600">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {isMockMode ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center">
          <UserCog className="size-8 text-gray-300 mx-auto mb-2" />
          <p className="text-[13px] text-gray-500 font-medium">Admin user management</p>
          <p className="text-[12px] text-gray-400 mt-0.5">Available in Supabase mode. Configure Supabase to manage admin users.</p>
        </div>
      ) : (
        <>
          {actionError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
              <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
              <p className="text-[12px] text-red-600">{actionError}</p>
            </div>
          )}

          <div className={cn("rounded-lg border border-gray-100 overflow-hidden", users.length === 0 && "hidden")}>
            {users.map((u) => {
              const isSelf = u.id === currentUserId
              const displayName = u.name || u.email.split("@")[0]
              return (
                <div key={u.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold select-none">
                      {initials(u.name, u.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">
                        {displayName}
                        {isSelf && <span className="ml-1.5 text-[10px] text-blue-500 font-semibold">(you)</span>}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                      Admin
                    </span>
                    <button
                      onClick={() => setEditingUser(u)}
                      className="flex size-7 items-center justify-center rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {!isSelf && (
                      <button
                        onClick={() => setRemoveTarget(u)}
                        className="flex size-7 items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove admin access"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {users.length === 0 && (
            <p className="text-[13px] text-gray-400 py-2">No admin users found.</p>
          )}

          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Plus className="size-3.5" />
            Add Admin User
          </button>
        </>
      )}

      {/* key forces remount on open/close, clearing all form state */}
      <AddAdminModal
        key={addOpen ? "add-open" : "add-closed"}
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={refresh}
      />

      <EditAdminModal
        key={editingUser?.id ?? "edit-none"}
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSaved={refresh}
      />

      <ConfirmModal
        isOpen={!!removeTarget}
        onClose={() => !removing && setRemoveTarget(null)}
        onConfirm={handleRemoveConfirm}
        title="Remove admin access?"
        message={`${removeTarget?.name || removeTarget?.email} will lose admin access. Their account will remain but they will not be able to log in as an admin.`}
        confirmLabel={removing ? "Removing…" : "Remove Admin"}
        variant="danger"
      />
    </div>
  )
}
