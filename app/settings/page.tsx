"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  Building2, Truck, Wrench, FileText, Users,
  ChevronUp, ChevronDown, ChevronRight, Pencil, Trash2, Plus, Check, X,
  ImagePlus, GripVertical, Settings, ShieldCheck, Mail,
  KeyRound, Eye, EyeOff, AlertTriangle, AlertCircle, Tag,
} from "lucide-react"
import { useRole, useIsMockMode } from "@/components/layout/app-shell"
import { ConfirmModal }           from "@/components/ui/confirm-modal"
import { cn } from "@/lib/utils"
import {
  fetchSettings,
  saveCompanyInfo,
  uploadLogo,
  upsertCarrier,
  deleteCarrier,
  checkCarrierUsage,
  reorderCarriers,
  upsertServiceType,
  deleteServiceType,
  checkServiceTypeUsage,
  reorderServiceTypes,
  upsertPricingRule,
  deletePricingRule,
  saveInvoiceSettings,
  saveUserSettings,
  type SettingsCarrier,
  type SettingsServiceType,
  type SettingsCompany,
  type SettingsInvoice,
  type SettingsUsers,
  type PricingRule,
} from "@/app/settings/actions"

/* ─────────────────────────────────────────────────────────
   Section nav
───────────────────────────────────────────────────────── */
const SECTIONS = [
  { id: "company",  label: "Company Info",  icon: Building2 },
  { id: "carriers", label: "Carriers",      icon: Truck },
  { id: "services", label: "Service Types", icon: Wrench },
  { id: "invoice",  label: "Invoice",       icon: FileText },
  { id: "users",    label: "Users",         icon: Users },
]

/* ─────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────── */

function SectionCard({
  id, icon: Icon, title, description, children,
}: {
  id: string; icon: React.ElementType; title: string; description: string; children: React.ReactNode
}) {
  return (
    <div id={id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden scroll-mt-4">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 shrink-0">
          <Icon className="size-4 text-blue-600" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-gray-900">{title}</p>
          <p className="text-[12px] text-gray-400">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function SaveButton({
  saved, saving, onClick, label = "Save Changes",
}: {
  saved: boolean; saving?: boolean; onClick: () => void; label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-lg transition-all disabled:opacity-60",
        saved
          ? "bg-green-600 text-white"
          : "bg-blue-600 hover:bg-blue-700 text-white"
      )}
    >
      {saved ? <Check className="size-3.5" /> : null}
      {saving ? "Saving…" : saved ? "Saved!" : label}
    </button>
  )
}

function useSaveFlash() {
  const [saved,  setSaved]  = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const run = useCallback(async (fn: () => Promise<void>) => {
    setSaving(true)
    setError(null)
    try {
      await fn()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.")
    } finally {
      setSaving(false)
    }
  }, [])

  return { saved, saving, error, setError, run }
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

const inputCls =
  "w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 bg-white"
const textareaCls =
  "w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 resize-none bg-white"

/* ── Inline error banner ───────────────────────────────── */
function InlineError({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
      <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
      <p className="text-[12px] text-red-600">{msg}</p>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   CarrierList
───────────────────────────────────────────────────────── */
function CarrierList({
  initial, isMockMode,
}: {
  initial: SettingsCarrier[]; isMockMode: boolean
}) {
  const [items,       setItems]       = useState<SettingsCarrier[]>(initial)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editName,    setEditName]    = useState("")
  const [adding,      setAdding]      = useState(false)
  const [addName,     setAddName]     = useState("")
  const [saving,      setSaving]      = useState<string | null>(null) // id being saved
  const [error,       setError]       = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SettingsCarrier | null>(null)
  const [deleteMsg,   setDeleteMsg]   = useState("")
  const [deleting,    setDeleting]    = useState(false)
  const [checkingId,  setCheckingId]  = useState<string | null>(null)
  const addRef = useRef<HTMLInputElement>(null)

  function startEdit(item: SettingsCarrier) {
    setEditingId(item.id)
    setEditName(item.name)
    setError(null)
  }

  async function commitEdit(item: SettingsCarrier) {
    if (!editName.trim()) { cancelEdit(); return }
    if (editName.trim() === item.name) { cancelEdit(); return }
    if (isMockMode) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, name: editName.trim() } : i))
      setEditingId(null)
      return
    }
    setSaving(item.id)
    try {
      const updated = await upsertCarrier({ id: item.id, name: editName.trim(), sortOrder: item.sortOrder })
      setItems((prev) => prev.map((i) => i.id === item.id ? updated : i))
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save carrier.")
    } finally {
      setSaving(null)
    }
  }

  function cancelEdit() { setEditingId(null); setEditName("") }

  function moveItem(idx: number, dir: -1 | 1) {
    const next   = [...items]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    // Reassign sort_order by position
    const reordered = next.map((item, i) => ({ ...item, sortOrder: i + 1 }))
    setItems(reordered)
    if (!isMockMode) {
      reorderCarriers(reordered.map((c) => ({ id: c.id, sortOrder: c.sortOrder }))).catch(() => {})
    }
  }

  async function commitAdd() {
    if (!addName.trim()) { setAdding(false); setAddName(""); return }
    if (isMockMode) {
      setItems((prev) => [
        ...prev,
        { id: `mock-${Date.now()}`, name: addName.trim(), isActive: true, sortOrder: prev.length + 1 },
      ])
      setAdding(false); setAddName("")
      return
    }
    setSaving("new")
    try {
      const created = await upsertCarrier({ name: addName.trim(), sortOrder: items.length + 1 })
      setItems((prev) => [...prev, created])
      setAdding(false); setAddName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add carrier.")
    } finally {
      setSaving(null)
    }
  }

  async function handleDeleteClick(item: SettingsCarrier) {
    setError(null)
    if (isMockMode) {
      setDeleteMsg(`Permanently delete "${item.name}"? This cannot be undone.`)
      setDeleteTarget(item)
      return
    }
    setCheckingId(item.id)
    try {
      const count = await checkCarrierUsage(item.id)
      let msg = `Permanently delete "${item.name}"? This cannot be undone.`
      if (count > 0) {
        msg = `This carrier is used in ${count} existing shipment${count > 1 ? "s" : ""}. Existing shipment records will keep the carrier name, but this carrier will be removed from future dropdowns.\n\nDelete anyway?`
      }
      setDeleteMsg(msg)
      setDeleteTarget(item)
    } catch {
      setDeleteMsg(`Permanently delete "${item.name}"? This cannot be undone.`)
      setDeleteTarget(item)
    } finally {
      setCheckingId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    if (isMockMode) {
      setItems((prev) => prev.filter((i) => i.id !== id))
      setDeleteTarget(null)
      return
    }
    setDeleting(true)
    try {
      await deleteCarrier(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete carrier.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-1">
      <InlineError msg={error} />
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100/60 group transition-colors"
        >
          <GripVertical className="size-3.5 text-gray-300 shrink-0" />

          {editingId === item.id ? (
            <>
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")  commitEdit(item)
                  if (e.key === "Escape") cancelEdit()
                }}
                className="flex-1 text-[13px] bg-white border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={() => commitEdit(item)}
                disabled={saving === item.id}
                className="flex size-6 items-center justify-center rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
              >
                <Check className="size-3.5" />
              </button>
              <button onClick={cancelEdit} className="flex size-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100">
                <X className="size-3.5" />
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-[13px] text-gray-800">{item.name}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => moveItem(idx, -1)}
                  disabled={idx === 0}
                  className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  onClick={() => moveItem(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <ChevronDown className="size-3.5" />
                </button>
                <button
                  onClick={() => startEdit(item)}
                  className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                  title="Edit"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteClick(item)}
                  disabled={checkingId === item.id}
                  className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"
                  title="Delete permanently"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {/* Add row */}
      {adding ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50">
          <GripVertical className="size-3.5 text-blue-200 shrink-0" />
          <input
            ref={addRef}
            autoFocus
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  commitAdd()
              if (e.key === "Escape") { setAdding(false); setAddName("") }
            }}
            placeholder="New carrier…"
            className="flex-1 text-[13px] bg-white border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-400"
          />
          <button
            onClick={commitAdd}
            disabled={saving === "new"}
            className="flex size-6 items-center justify-center rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
          >
            <Check className="size-3.5" />
          </button>
          <button
            onClick={() => { setAdding(false); setAddName("") }}
            className="flex size-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setAdding(true); setError(null) }}
          className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg border border-dashed border-gray-200 text-[13px] text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Plus className="size-3.5" />
          Add carrier
        </button>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete carrier?"
        message={deleteMsg}
        confirmLabel={deleting ? "Deleting…" : "Delete Permanently"}
        variant="danger"
      />
    </div>
  )
}

function RuleForm({ state, onSet, onSave, onCancel, savingKey }: {
  state: RuleEditState
  onSet: (patch: Partial<RuleEditState>) => void
  onSave: () => void
  onCancel: () => void
  savingKey: string | null
}) {
  const inputCls = "px-2 py-0.5 text-[12px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
  return (
    <div className="flex items-center gap-2 flex-wrap py-1.5 px-2 bg-blue-50 rounded-lg border border-blue-200">
      <div className="flex items-center gap-1">
        <label className="text-[11px] text-gray-500 shrink-0">Min</label>
        <input
          autoFocus type="number" min={0} value={state.minQty}
          onChange={(e) => onSet({ minQty: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel() }}
          className={cn(inputCls, "w-16 text-right")}
        />
      </div>
      <div className="flex items-center gap-1">
        <label className="text-[11px] text-gray-500 shrink-0">Max</label>
        <input
          type="number" min={0} value={state.maxQty} placeholder="∞"
          onChange={(e) => onSet({ maxQty: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel() }}
          className={cn(inputCls, "w-16 text-right")}
        />
      </div>
      <div className="flex items-center gap-1">
        <label className="text-[11px] text-gray-500 shrink-0">$</label>
        <input
          type="number" min={0} step={0.01} value={state.pricePerUnit}
          onChange={(e) => onSet({ pricePerUnit: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel() }}
          className={cn(inputCls, "w-20 text-right")}
        />
        <span className="text-[11px] text-gray-400 shrink-0">/unit</span>
      </div>
      <input
        type="text" value={state.label} placeholder="Label (optional)"
        onChange={(e) => onSet({ label: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel() }}
        className={cn(inputCls, "flex-1 min-w-[100px]")}
      />
      <button onClick={onSave} disabled={!!savingKey}
        className="flex size-6 items-center justify-center rounded text-green-600 hover:bg-green-50 disabled:opacity-50 shrink-0">
        <Check className="size-3.5" />
      </button>
      <button onClick={onCancel}
        className="flex size-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 shrink-0">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   PricingRuleSubList
───────────────────────────────────────────────────────── */
type RuleEditState = { minQty: string; maxQty: string; pricePerUnit: string; label: string }
const emptyRuleState = (): RuleEditState => ({ minQty: "1", maxQty: "", pricePerUnit: "0.00", label: "" })

function validateRule(
  s: RuleEditState,
  existing: PricingRule[],
  excludeId?: string
): string | null {
  const min   = parseInt(s.minQty)
  const max   = s.maxQty.trim() ? parseInt(s.maxQty) : null
  const price = parseFloat(s.pricePerUnit)
  if (!s.minQty.trim() || isNaN(min) || min < 0)   return "Min quantity is required (0 or more)."
  if (!s.pricePerUnit.trim() || isNaN(price) || price < 0) return "Price per unit is required (0 or more)."
  if (max !== null && max < min)                    return "Max quantity must be ≥ min quantity."
  const others = excludeId ? existing.filter((r) => r.id !== excludeId) : existing
  const newMax = max ?? Infinity
  if (others.some((r) => { const rMax = r.maxQty ?? Infinity; return min <= rMax && r.minQty <= newMax }))
    return "This range overlaps with an existing pricing rule."
  return null
}

function ruleDisplay(r: PricingRule) {
  const range = r.maxQty !== null ? `${r.minQty}–${r.maxQty}` : `${r.minQty}+`
  return `${range} units · $${r.pricePerUnit.toFixed(2)}/unit`
}

function PricingRuleSubList({
  serviceTypeId, initialRules, isMockMode,
}: {
  serviceTypeId: string; initialRules: PricingRule[]; isMockMode: boolean
}) {
  const [rules,       setRules]       = useState<PricingRule[]>(initialRules)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editState,   setEditState]   = useState<RuleEditState>(emptyRuleState())
  const [adding,      setAdding]      = useState(false)
  const [addState,    setAddState]    = useState<RuleEditState>(emptyRuleState())
  const [ruleError,   setRuleError]   = useState<string | null>(null)
  const [saving,      setSaving]      = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PricingRule | null>(null)
  const [deleting,    setDeleting]    = useState(false)

  function startEdit(rule: PricingRule) {
    setEditingId(rule.id)
    setEditState({
      minQty:       String(rule.minQty),
      maxQty:       rule.maxQty !== null ? String(rule.maxQty) : "",
      pricePerUnit: rule.pricePerUnit.toFixed(2),
      label:        rule.label ?? "",
    })
    setRuleError(null)
  }

  async function commitEdit(rule: PricingRule) {
    const err = validateRule(editState, rules, rule.id)
    if (err) { setRuleError(err); return }
    const minQty       = parseInt(editState.minQty)
    const maxQty       = editState.maxQty.trim() ? parseInt(editState.maxQty) : null
    const pricePerUnit = parseFloat(editState.pricePerUnit)
    if (isMockMode) {
      setRules((prev) => prev.map((r) => r.id === rule.id
        ? { ...r, minQty, maxQty, pricePerUnit, label: editState.label.trim() || null }
        : r
      ).sort((a, b) => a.minQty - b.minQty))
      setEditingId(null)
      return
    }
    setSaving(rule.id)
    try {
      const updated = await upsertPricingRule({
        id: rule.id, serviceTypeId, minQty, maxQty, pricePerUnit,
        label: editState.label.trim() || null, sortOrder: rule.sortOrder,
      })
      setRules((prev) => prev.map((r) => r.id === rule.id ? updated : r).sort((a, b) => a.minQty - b.minQty))
      setEditingId(null)
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : "Failed to save rule.")
    } finally {
      setSaving(null)
    }
  }

  async function commitAdd() {
    const err = validateRule(addState, rules)
    if (err) { setRuleError(err); return }
    const minQty       = parseInt(addState.minQty)
    const maxQty       = addState.maxQty.trim() ? parseInt(addState.maxQty) : null
    const pricePerUnit = parseFloat(addState.pricePerUnit)
    if (isMockMode) {
      const newRule: PricingRule = {
        id: `mock-${Date.now()}`, serviceTypeId, minQty, maxQty, pricePerUnit,
        label: addState.label.trim() || null, sortOrder: minQty,
      }
      setRules((prev) => [...prev, newRule].sort((a, b) => a.minQty - b.minQty))
      setAdding(false); setAddState(emptyRuleState())
      return
    }
    setSaving("new")
    try {
      const created = await upsertPricingRule({
        serviceTypeId, minQty, maxQty, pricePerUnit,
        label: addState.label.trim() || null, sortOrder: minQty,
      })
      setRules((prev) => [...prev, created].sort((a, b) => a.minQty - b.minQty))
      setAdding(false); setAddState(emptyRuleState())
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : "Failed to add rule.")
    } finally {
      setSaving(null)
    }
  }

  async function confirmRuleDelete() {
    if (!deleteTarget) return
    if (isMockMode) {
      setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      setDeleteTarget(null)
      return
    }
    setDeleting(true)
    try {
      await deletePricingRule(deleteTarget.id)
      setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      // silently keep rule on delete failure
    } finally {
      setDeleting(false)
    }
  }



  return (
    <div className="mt-1 ml-8 space-y-1 border-l-2 border-gray-100 pl-3">
      {ruleError && (
        <div className="flex items-start gap-1.5 rounded-lg bg-red-50 border border-red-100 px-2.5 py-1.5">
          <AlertCircle className="size-3 text-red-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-600">{ruleError}</p>
        </div>
      )}

      {rules.length === 0 && !adding && (
        <p className="text-[12px] text-gray-400 py-1">No pricing rules — add one below.</p>
      )}

      {rules.map((rule) =>
        editingId === rule.id ? (
          <RuleForm
            key={rule.id}
            state={editState}
            onSet={(p) => setEditState((s) => ({ ...s, ...p }))}
            onSave={() => commitEdit(rule)}
            onCancel={() => { setEditingId(null); setRuleError(null) }}
            savingKey={saving}
          />
        ) : (
          <div key={rule.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-50 group">
            <Tag className="size-3 text-gray-300 shrink-0" />
            <span className="flex-1 text-[12px] text-gray-700 font-mono">{ruleDisplay(rule)}</span>
            {rule.label && (
              <span className="text-[11px] text-gray-400 truncate max-w-[100px]">{rule.label}</span>
            )}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => { startEdit(rule); setRuleError(null) }}
                className="flex size-5 items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                <Pencil className="size-3" />
              </button>
              <button onClick={() => { setDeleteTarget(rule); setRuleError(null) }}
                className="flex size-5 items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>
        )
      )}

      {adding ? (
        <RuleForm
          state={addState}
          onSet={(p) => setAddState((s) => ({ ...s, ...p }))}
          onSave={commitAdd}
          onCancel={() => { setAdding(false); setAddState(emptyRuleState()); setRuleError(null) }}
          savingKey={saving}
        />
      ) : (
        <button
          onClick={() => { setAdding(true); setRuleError(null) }}
          className="flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700 py-0.5"
        >
          <Plus className="size-3" />
          Add Pricing Rule
        </button>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmRuleDelete}
        title="Delete pricing rule?"
        message={`Remove the rule "${deleteTarget ? ruleDisplay(deleteTarget) : ""}"?`}
        confirmLabel={deleting ? "Deleting…" : "Delete Rule"}
        variant="danger"
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   ServiceList
───────────────────────────────────────────────────────── */
type ServiceEditState = { name: string; visibleToCustomers: boolean }

function ServiceList({
  initial, isMockMode,
}: {
  initial: SettingsServiceType[]; isMockMode: boolean
}) {
  const [items,        setItems]       = useState<SettingsServiceType[]>(initial)
  const [editingId,    setEditingId]   = useState<string | null>(null)
  const [editState,    setEditState]   = useState<ServiceEditState>({ name: "", visibleToCustomers: true })
  const [adding,       setAdding]      = useState(false)
  const [addName,      setAddName]     = useState("")
  const [addVisible,   setAddVisible]  = useState(true)
  const [expandedId,   setExpandedId]  = useState<string | null>(null)
  const [saving,       setSaving]      = useState<string | null>(null)
  const [error,        setError]       = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SettingsServiceType | null>(null)
  const [deleteMsg,    setDeleteMsg]   = useState("")
  const [deleting,     setDeleting]    = useState(false)
  const [checkingId,   setCheckingId]  = useState<string | null>(null)

  function startEdit(item: SettingsServiceType) {
    setEditingId(item.id)
    setEditState({ name: item.name, visibleToCustomers: item.visibleToCustomers })
    setError(null)
  }

  async function commitEdit(item: SettingsServiceType) {
    const name = editState.name.trim()
    if (!name) { setEditingId(null); return }
    if (isMockMode) {
      setItems((prev) => prev.map((i) => i.id === item.id
        ? { ...i, name, visibleToCustomers: editState.visibleToCustomers }
        : i
      ))
      setEditingId(null)
      return
    }
    setSaving(item.id)
    try {
      const updated = await upsertServiceType({
        id: item.id, name, price: item.price,
        visibleToCustomers: editState.visibleToCustomers, sortOrder: item.sortOrder,
      })
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...updated, pricingRules: item.pricingRules } : i))
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save service.")
    } finally {
      setSaving(null)
    }
  }

  function cancelEdit() { setEditingId(null) }

  function moveItem(idx: number, dir: -1 | 1) {
    const next   = [...items]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    const reordered = next.map((item, i) => ({ ...item, sortOrder: i + 1 }))
    setItems(reordered)
    if (!isMockMode) {
      reorderServiceTypes(reordered.map((s) => ({ id: s.id, sortOrder: s.sortOrder }))).catch(() => {})
    }
  }

  async function commitAdd() {
    const name = addName.trim()
    if (!name) { setAdding(false); setAddName(""); return }
    if (isMockMode) {
      setItems((prev) => [
        ...prev,
        { id: `mock-${Date.now()}`, name, price: 0, visibleToCustomers: addVisible,
          isActive: true, sortOrder: prev.length + 1, pricingRules: [] },
      ])
      setAdding(false); setAddName(""); setAddVisible(true)
      return
    }
    setSaving("new")
    try {
      const created = await upsertServiceType({
        name, price: 0, visibleToCustomers: addVisible, sortOrder: items.length + 1,
      })
      setItems((prev) => [...prev, { ...created, pricingRules: [] }])
      setAdding(false); setAddName(""); setAddVisible(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add service.")
    } finally {
      setSaving(null)
    }
  }

  async function handleDeleteClick(item: SettingsServiceType) {
    setError(null)
    if (isMockMode) {
      setDeleteMsg(`Permanently delete "${item.name}"? This cannot be undone.`)
      setDeleteTarget(item)
      return
    }
    setCheckingId(item.id)
    try {
      const count = await checkServiceTypeUsage(item.id)
      const msg = count > 0
        ? `This service is used in ${count} existing request${count > 1 ? "s" : ""}. Deleting it may affect historical records.\n\nDelete anyway?`
        : `Permanently delete "${item.name}"? This cannot be undone.`
      setDeleteMsg(msg)
      setDeleteTarget(item)
    } catch {
      setDeleteMsg(`Permanently delete "${item.name}"? This cannot be undone.`)
      setDeleteTarget(item)
    } finally {
      setCheckingId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    if (isMockMode) { setItems((prev) => prev.filter((i) => i.id !== id)); setDeleteTarget(null); return }
    setDeleting(true)
    try {
      await deleteServiceType(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
      if (expandedId === id) setExpandedId(null)
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete service.")
    } finally {
      setDeleting(false)
    }
  }

  function renderServiceRow(item: SettingsServiceType, idx: number) {
    const isExpanded = expandedId === item.id
    const ruleCount  = item.pricingRules.length

    if (editingId === item.id) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50">
          <button className="size-4 shrink-0" />
          <GripVertical className="size-3.5 text-blue-200 shrink-0" />
          <input
            autoFocus value={editState.name}
            onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(item); if (e.key === "Escape") cancelEdit() }}
            placeholder="Service name"
            className="flex-1 min-w-0 text-[13px] bg-white border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={() => setEditState((s) => ({ ...s, visibleToCustomers: !s.visibleToCustomers }))}
            title={editState.visibleToCustomers ? "Visible to clients" : "Hidden from clients"}
            className={cn("flex size-6 items-center justify-center rounded transition-colors shrink-0",
              editState.visibleToCustomers ? "text-blue-600 hover:bg-blue-100" : "text-gray-300 hover:bg-gray-100"
            )}
          >
            {editState.visibleToCustomers ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </button>
          <button onClick={() => commitEdit(item)} disabled={saving === item.id}
            className="flex size-6 items-center justify-center rounded text-green-600 hover:bg-green-50 disabled:opacity-50">
            <Check className="size-3.5" />
          </button>
          <button onClick={cancelEdit}
            className="flex size-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100">
            <X className="size-3.5" />
          </button>
        </div>
      )
    }

    return (
      <>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100/60 group transition-colors">
          {/* Expand toggle */}
          <button
            type="button"
            onClick={() => setExpandedId(isExpanded ? null : item.id)}
            className="flex size-5 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-white transition-colors shrink-0"
            title={isExpanded ? "Collapse pricing rules" : "Expand pricing rules"}
          >
            <ChevronRight className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")} />
          </button>
          <GripVertical className="size-3.5 text-gray-300 shrink-0" />
          <span className="flex-1 min-w-0 text-[13px] text-gray-800 truncate">{item.name}</span>
          {/* Pricing rules count badge */}
          <span className={cn(
            "text-[11px] px-1.5 py-0.5 rounded-full shrink-0 tabular-nums",
            ruleCount > 0 ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"
          )}>
            {ruleCount > 0 ? `${ruleCount} rule${ruleCount > 1 ? "s" : ""}` : "no rules"}
          </span>
          <span
            title={item.visibleToCustomers ? "Visible to clients" : "Hidden from clients"}
            className={cn("shrink-0", item.visibleToCustomers ? "text-blue-400" : "text-gray-200")}
          >
            {item.visibleToCustomers ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => moveItem(idx, -1)} disabled={idx === 0}
              className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move up"><ChevronUp className="size-3.5" /></button>
            <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1}
              className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move down"><ChevronDown className="size-3.5" /></button>
            <button onClick={() => startEdit(item)}
              className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
              title="Edit name / visibility"><Pencil className="size-3.5" /></button>
            <button onClick={() => handleDeleteClick(item)} disabled={checkingId === item.id}
              className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"
              title="Delete permanently"><Trash2 className="size-3.5" /></button>
          </div>
        </div>

        {/* Pricing rules panel */}
        {isExpanded && (
          <PricingRuleSubList
            serviceTypeId={item.id}
            initialRules={item.pricingRules}
            isMockMode={isMockMode}
          />
        )}
      </>
    )
  }

  return (
    <div className="space-y-1">
      <InlineError msg={error} />

      {items.map((item, idx) => (
        <div key={item.id}>{renderServiceRow(item, idx)}</div>
      ))}

      {/* Add row */}
      {adding ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50">
          <span className="size-5 shrink-0" />
          <GripVertical className="size-3.5 text-blue-200 shrink-0" />
          <input
            autoFocus value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  commitAdd()
              if (e.key === "Escape") { setAdding(false); setAddName(""); setAddVisible(true) }
            }}
            placeholder="Service name…"
            className="flex-1 min-w-0 text-[13px] bg-white border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-400"
          />
          <button type="button" onClick={() => setAddVisible((v) => !v)}
            title={addVisible ? "Visible to clients" : "Hidden from clients"}
            className={cn("flex size-6 items-center justify-center rounded transition-colors shrink-0",
              addVisible ? "text-blue-600 hover:bg-blue-100" : "text-gray-300 hover:bg-gray-100"
            )}>
            {addVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </button>
          <button onClick={commitAdd} disabled={saving === "new"}
            className="flex size-6 items-center justify-center rounded text-green-600 hover:bg-green-50 disabled:opacity-50">
            <Check className="size-3.5" />
          </button>
          <button onClick={() => { setAdding(false); setAddName(""); setAddVisible(true) }}
            className="flex size-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100">
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button onClick={() => { setAdding(true); setError(null) }}
          className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg border border-dashed border-gray-200 text-[13px] text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors">
          <Plus className="size-3.5" />
          Add service type
        </button>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete service type?"
        message={deleteMsg}
        confirmLabel={deleting ? "Deleting…" : "Delete Permanently"}
        variant="danger"
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Page defaults
───────────────────────────────────────────────────────── */
const DEFAULT_COMPANY: SettingsCompany = {
  companyName: "Safir Logistics",
  email:   "info@safirlogs.com",
  phone:   "(310) 555-0100",
  address: "5000 Commerce Dr, Suite 200\nLos Angeles, CA 90058",
  website: "https://safirlogs.com",
  logoUrl: null,
}
const DEFAULT_INVOICE: SettingsInvoice = {
  dueDays: 14,
  paymentInstructions:
    "Please remit payment via ACH, wire transfer, or check made payable to Safir Logistics LLC. Reference your invoice number in all payment details. Contact billing@safirlogs.com with questions.",
  invoiceNotes: "",
}
const DEFAULT_USERS: SettingsUsers = {
  inviteSubject: "You're invited to the Safir client portal",
  inviteMessage:
    "Hi [Contact Name],\n\nYou've been invited to access your logistics dashboard at Safir. Click the link below to set up your account.\n\nIf you have any questions, reply to this email.\n\n— The Safir Team",
}

/* ─────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const { role }   = useRole()
  const isMockMode = useIsMockMode()

  // All hooks before any conditional return
  // loading starts false in mock mode (nothing to fetch), true otherwise
  const [loading,       setLoading]       = useState(() => !isMockMode)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [company,       setCompany]       = useState<SettingsCompany>(DEFAULT_COMPANY)
  const [logoPreview,   setLogoPreview]   = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError,     setLogoError]     = useState<string | null>(null)
  const [invoice,       setInvoice]       = useState<SettingsInvoice>(DEFAULT_INVOICE)
  const [userSettings,  setUserSettings]  = useState<SettingsUsers>(DEFAULT_USERS)
  const [initCarriers,  setInitCarriers]  = useState<SettingsCarrier[]>([])
  const [initServices,  setInitServices]  = useState<SettingsServiceType[]>([])
  const [activeSection, setActiveSection] = useState("company")

  const companySave = useSaveFlash()
  const invoiceSave = useSaveFlash()
  const userSave    = useSaveFlash()
  const logoFileRef = useRef<HTMLInputElement>(null)

  // Load settings from DB on mount (mock mode skips fetch; loading already false)
  useEffect(() => {
    if (isMockMode) return
    fetchSettings()
      .then((s) => {
        setCompany(s.company)
        setLogoPreview(s.company.logoUrl)
        setInvoice(s.invoice)
        setUserSettings(s.users)
        setInitCarriers(s.carriers)
        setInitServices(s.serviceTypes)
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load settings."))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Admin gate — after all hooks ── */
  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-gray-100">
          <Settings className="size-6 text-gray-400" />
        </div>
        <p className="text-[15px] font-semibold text-gray-700">Admin access only</p>
        <p className="text-[13px] text-gray-400">Switch to Admin view to manage settings.</p>
      </div>
    )
  }

  /* ── Logo upload ── */
  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"]
    if (!allowed.includes(file.type)) {
      setLogoError("Only JPG, PNG, WebP, and SVG files are allowed.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("Logo must be under 5 MB.")
      return
    }

    setLogoPreview(URL.createObjectURL(file))
    setLogoError(null)

    if (isMockMode) return

    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const url = await uploadLogo(fd)
      setCompany((c) => ({ ...c, logoUrl: url }))
      setLogoPreview(url)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Upload failed.")
      setLogoPreview(company.logoUrl)
    } finally {
      setLogoUploading(false)
    }
  }

  function scrollTo(id: string) {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  /* ── Render ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[13px] text-gray-400">Loading settings…</p>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* ── Left nav ── */}
      <nav className="w-[180px] shrink-0">
        <div className="sticky top-0 space-y-0.5">
          <p className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Settings
          </p>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={cn(
                "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-colors text-left",
                activeSection === id
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              )}
            >
              <Icon className={cn("size-4 shrink-0", activeSection === id ? "text-blue-600" : "text-gray-400")} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Right content ── */}
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto pb-6">

        {loadError && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[13px] text-amber-700">{loadError}</p>
          </div>
        )}

        {/* ── 1. Company Info ── */}
        <SectionCard
          id="company"
          icon={Building2}
          title="Company Info"
          description="Displayed on invoices and client-facing documents"
        >
          <div className="space-y-4">
            {/* Logo */}
            <Field label="Logo">
              <div className="flex items-center gap-4">
                <div className="flex size-16 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 shrink-0 overflow-hidden">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPreview} alt="Company logo" className="size-full object-contain p-1" />
                  ) : (
                    <ImagePlus className="size-6 text-gray-300" />
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => logoFileRef.current?.click()}
                    disabled={logoUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                    {logoUploading ? "Uploading…" : "Upload Logo"}
                  </button>
                  <p className="mt-1 text-[11px] text-gray-400">JPG, PNG, WebP, or SVG — max 5 MB</p>
                  {logoError && (
                    <p className="mt-1 text-[11px] text-red-500">{logoError}</p>
                  )}
                </div>
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Company Name">
                <input
                  value={company.companyName}
                  onChange={(e) => setCompany((c) => ({ ...c, companyName: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="Website">
                <input
                  value={company.website}
                  onChange={(e) => setCompany((c) => ({ ...c, website: e.target.value }))}
                  placeholder="https://"
                  className={inputCls}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={company.email}
                  onChange={(e) => setCompany((c) => ({ ...c, email: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={company.phone}
                  onChange={(e) => setCompany((c) => ({ ...c, phone: e.target.value }))}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Address">
              <textarea
                value={company.address}
                onChange={(e) => setCompany((c) => ({ ...c, address: e.target.value }))}
                rows={2}
                className={textareaCls}
              />
            </Field>

            <InlineError msg={companySave.error} />
            <div className="flex justify-end pt-1">
              <SaveButton
                saved={companySave.saved}
                saving={companySave.saving}
                onClick={() =>
                  companySave.run(() =>
                    isMockMode ? Promise.resolve() : saveCompanyInfo(company)
                  )
                }
              />
            </div>
          </div>
        </SectionCard>

        {/* ── 2. Carriers ── */}
        <SectionCard
          id="carriers"
          icon={Truck}
          title="Carriers"
          description="Available carriers shown in shipment forms"
        >
          <CarrierList initial={initCarriers} isMockMode={isMockMode} />
        </SectionCard>

        {/* ── 3. Service Types ── */}
        <SectionCard
          id="services"
          icon={Wrench}
          title="Service Types"
          description="Available services shown in service request forms"
        >
          <ServiceList initial={initServices} isMockMode={isMockMode} />
        </SectionCard>

        {/* ── 4. Invoice Settings ── */}
        <SectionCard
          id="invoice"
          icon={FileText}
          title="Invoice Settings"
          description="Default values applied to all new invoices"
        >
          <div className="space-y-4">
            <Field
              label="Default Due Days"
              hint="Number of days after invoice date before payment is due"
            >
              <input
                type="number"
                min={1}
                max={180}
                value={invoice.dueDays}
                onChange={(e) => setInvoice((v) => ({ ...v, dueDays: Math.max(1, Number(e.target.value)) }))}
                className="w-28 px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </Field>

            <Field
              label="Default Payment Instructions"
              hint="Appears at the bottom of every invoice (editable per invoice)"
            >
              <textarea
                value={invoice.paymentInstructions}
                onChange={(e) => setInvoice((v) => ({ ...v, paymentInstructions: e.target.value }))}
                rows={4}
                className={textareaCls}
              />
            </Field>

            <Field
              label="Default Invoice Notes"
              hint="Pre-filled notes field on new invoices"
            >
              <textarea
                value={invoice.invoiceNotes}
                onChange={(e) => setInvoice((v) => ({ ...v, invoiceNotes: e.target.value }))}
                rows={2}
                placeholder="e.g. Thank you for your business."
                className={textareaCls}
              />
            </Field>

            <InlineError msg={invoiceSave.error} />
            <div className="flex justify-end pt-1">
              <SaveButton
                saved={invoiceSave.saved}
                saving={invoiceSave.saving}
                onClick={() =>
                  invoiceSave.run(() =>
                    isMockMode ? Promise.resolve() : saveInvoiceSettings(invoice)
                  )
                }
              />
            </div>
          </div>
        </SectionCard>

        {/* ── 5. Users ── */}
        <SectionCard
          id="users"
          icon={Users}
          title="Users & Login"
          description="Admin accounts and client portal access defaults"
        >
          <div className="space-y-6">
            {/* Admin users */}
            <div>
              <p className="text-[12px] font-semibold text-gray-700 mb-2">Admin Users</p>
              <div className="rounded-lg border border-gray-100 overflow-hidden">
                {[{ name: "Admin User", email: "admin@safirlogs.com", role: "Super Admin" }].map((u) => (
                  <div key={u.email} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold shrink-0 select-none">AU</div>
                      <div>
                        <p className="text-[13px] font-medium text-gray-900">{u.name}</p>
                        <p className="text-[11px] text-gray-400">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                        {u.role}
                      </span>
                      <button className="flex size-7 items-center justify-center rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <Plus className="size-3.5" />
                  Add Admin User
                </button>
                <p className="text-[11px] text-gray-400">Full user management available after Supabase Auth setup.</p>
              </div>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Client invite defaults */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Mail className="size-4 text-gray-400" />
                <p className="text-[12px] font-semibold text-gray-700">Client Invite Defaults</p>
              </div>
              <div className="space-y-3">
                <Field label="Invite Email Subject">
                  <input
                    value={userSettings.inviteSubject}
                    onChange={(e) => setUserSettings((v) => ({ ...v, inviteSubject: e.target.value }))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Invite Message Template" hint="Use [Contact Name] and [Company Name] as placeholders">
                  <textarea
                    value={userSettings.inviteMessage}
                    onChange={(e) => setUserSettings((v) => ({ ...v, inviteMessage: e.target.value }))}
                    rows={5}
                    className={textareaCls}
                  />
                </Field>
              </div>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Info blocks */}
            <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5">
              <KeyRound className="size-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-gray-700">Password Reset</p>
                <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">
                  Password resets are sent via email. Admin and client users can request a reset from the login page at any time. Admins can also trigger a reset from the Clients page using the key icon on any Active login account.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3.5">
              <ShieldCheck className="size-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-blue-800">Auth Backend</p>
                <p className="text-[12px] text-blue-600 mt-0.5 leading-relaxed">
                  Login, session management, and role-based access will be powered by Supabase Auth. Connect your Supabase project to enable live authentication.
                </p>
              </div>
            </div>

            <InlineError msg={userSave.error} />
            <div className="flex justify-end">
              <SaveButton
                saved={userSave.saved}
                saving={userSave.saving}
                onClick={() =>
                  userSave.run(() =>
                    isMockMode ? Promise.resolve() : saveUserSettings(userSettings)
                  )
                }
              />
            </div>
          </div>
        </SectionCard>

      </div>
    </div>
  )
}
