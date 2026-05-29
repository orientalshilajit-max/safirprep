"use client"

import { useState, useRef, useCallback } from "react"
import {
  Building2,
  Truck,
  Wrench,
  FileText,
  Users,
  ChevronUp,
  ChevronDown,
  Pencil,
  Archive,
  Plus,
  Check,
  X,
  ImagePlus,
  GripVertical,
  Settings,
  ShieldCheck,
  Mail,
  KeyRound,
} from "lucide-react"
import { useRole } from "@/components/layout/app-shell"
import { cn } from "@/lib/utils"

/* ─────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────── */
type ListItem = { id: string; name: string; archived: boolean }

type CompanyInfo = {
  name: string
  email: string
  phone: string
  address: string
  website: string
}

type InvoiceSettings = {
  dueDays: number
  paymentInstructions: string
  invoiceNotes: string
}

/* ─────────────────────────────────────────────────────────
   Initial state
───────────────────────────────────────────────────────── */
const defaultCompany: CompanyInfo = {
  name: "Safir Logistics",
  email: "info@safirlogs.com",
  phone: "(310) 555-0100",
  address: "5000 Commerce Dr, Suite 200\nLos Angeles, CA 90058",
  website: "https://safirlogs.com",
}

const defaultCarriers: ListItem[] = [
  { id: "cr1", name: "UPS", archived: false },
  { id: "cr2", name: "FedEx", archived: false },
  { id: "cr3", name: "DHL", archived: false },
  { id: "cr4", name: "USPS", archived: false },
  { id: "cr5", name: "OnTrac", archived: false },
  { id: "cr6", name: "Amazon Freight", archived: false },
  { id: "cr7", name: "Amazon Delivery", archived: false },
  { id: "cr8", name: "LTL Freight", archived: false },
  { id: "cr9", name: "Local Delivery", archived: false },
  { id: "cr10", name: "Other", archived: false },
]

const defaultServiceTypes: ListItem[] = [
  { id: "st1", name: "FBA Prep", archived: false },
  { id: "st2", name: "FBM Fulfillment", archived: false },
  { id: "st3", name: "Labeling", archived: false },
  { id: "st4", name: "Bundling", archived: false },
  { id: "st5", name: "Inspection", archived: false },
  { id: "st6", name: "Forwarding", archived: false },
  { id: "st7", name: "Storage", archived: false },
  { id: "st8", name: "Returns", archived: false },
  { id: "st9", name: "Other", archived: false },
]

const defaultInvoice: InvoiceSettings = {
  dueDays: 14,
  paymentInstructions:
    "Please remit payment via ACH, wire transfer, or check made payable to Safir Logistics LLC. Reference your invoice number in all payment details. Contact billing@safirlogs.com with questions.",
  invoiceNotes: "",
}

/* ─────────────────────────────────────────────────────────
   Section nav
───────────────────────────────────────────────────────── */
const SECTIONS = [
  { id: "company",  label: "Company Info",   icon: Building2 },
  { id: "carriers", label: "Carriers",       icon: Truck },
  { id: "services", label: "Service Types",  icon: Wrench },
  { id: "invoice",  label: "Invoice",        icon: FileText },
  { id: "users",    label: "Users",          icon: Users },
]

/* ─────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────── */

function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
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

function SaveButton({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-lg transition-all",
        saved
          ? "bg-green-600 text-white"
          : "bg-blue-600 hover:bg-blue-700 text-white"
      )}
    >
      {saved ? <Check className="size-3.5" /> : null}
      {saved ? "Saved!" : "Save Changes"}
    </button>
  )
}

function useSaveFlash() {
  const [saved, setSaved] = useState(false)
  const trigger = useCallback(() => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [])
  return { saved, trigger }
}

/* ── Managed list (carriers / service types) ───────────── */
function ManagedList({
  items,
  setItems,
  noun,
}: {
  items: ListItem[]
  setItems: React.Dispatch<React.SetStateAction<ListItem[]>>
  noun: string
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [adding, setAdding] = useState(false)
  const [addName, setAddName] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const active = items.filter((i) => !i.archived)
  const archived = items.filter((i) => i.archived)

  function startEdit(item: ListItem) {
    setEditingId(item.id)
    setEditName(item.name)
  }

  function commitEdit(id: string) {
    if (!editName.trim()) { cancelEdit(); return }
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, name: editName.trim() } : i))
    setEditingId(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName("")
  }

  function archiveItem(id: string) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, archived: true } : i))
  }

  function restoreItem(id: string) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, archived: false } : i))
  }

  function moveItem(idx: number, dir: -1 | 1) {
    const next = [...active]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setItems([...next, ...archived])
  }

  function commitAdd() {
    if (!addName.trim()) { setAdding(false); setAddName(""); return }
    setItems((prev) => [
      ...prev,
      { id: `item-${Date.now()}`, name: addName.trim(), archived: false },
    ])
    setAddName("")
    setAdding(false)
  }

  function startAdding() {
    setAdding(true)
    setTimeout(() => addRef.current?.focus(), 30)
  }

  return (
    <div className="space-y-1">
      {active.map((item, idx) => (
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
                  if (e.key === "Enter") commitEdit(item.id)
                  if (e.key === "Escape") cancelEdit()
                }}
                className="flex-1 text-[13px] bg-white border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={() => commitEdit(item.id)}
                className="flex size-6 items-center justify-center rounded text-green-600 hover:bg-green-50 transition-colors"
              >
                <Check className="size-3.5" />
              </button>
              <button
                onClick={cancelEdit}
                className="flex size-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 transition-colors"
              >
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
                  className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move up"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  onClick={() => moveItem(idx, 1)}
                  disabled={idx === active.length - 1}
                  className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move down"
                >
                  <ChevronDown className="size-3.5" />
                </button>
                <button
                  onClick={() => startEdit(item)}
                  className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Edit"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => archiveItem(item.id)}
                  className="flex size-6 items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Archive"
                >
                  <Archive className="size-3.5" />
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
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd()
              if (e.key === "Escape") { setAdding(false); setAddName("") }
            }}
            placeholder={`New ${noun}…`}
            className="flex-1 text-[13px] bg-white border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-400"
          />
          <button
            onClick={commitAdd}
            className="flex size-6 items-center justify-center rounded text-green-600 hover:bg-green-50 transition-colors"
          >
            <Check className="size-3.5" />
          </button>
          <button
            onClick={() => { setAdding(false); setAddName("") }}
            className="flex size-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={startAdding}
          className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg border border-dashed border-gray-200 text-[13px] text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Plus className="size-3.5" />
          Add {noun}
        </button>
      )}

      {/* Archived section */}
      {archived.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Archive className="size-3" />
            {showArchived ? "Hide" : "Show"} {archived.length} archived
          </button>
          {showArchived && (
            <div className="mt-1 space-y-1">
              {archived.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 opacity-60"
                >
                  <GripVertical className="size-3.5 text-gray-200 shrink-0" />
                  <span className="flex-1 text-[13px] text-gray-400 line-through">{item.name}</span>
                  <button
                    onClick={() => restoreItem(item.id)}
                    className="text-[11px] font-medium text-blue-500 hover:text-blue-700 transition-colors"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Field helpers
───────────────────────────────────────────────────────── */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
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

/* ─────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const { role } = useRole()

  // All hooks must come before any conditional return.
  const [company, setCompany] = useState<CompanyInfo>(defaultCompany)
  const [carriers, setCarriers] = useState<ListItem[]>(defaultCarriers)
  const [serviceTypes, setServiceTypes] = useState<ListItem[]>(defaultServiceTypes)
  const [invoice, setInvoice] = useState<InvoiceSettings>(defaultInvoice)
  const [inviteSubject, setInviteSubject] = useState("You're invited to the Safir client portal")
  const [inviteMessage, setInviteMessage] = useState(
    "Hi [Contact Name],\n\nYou've been invited to access your logistics dashboard at Safir. Click the link below to set up your account.\n\nIf you have any questions, reply to this email.\n\n— The Safir Team"
  )
  const [activeSection, setActiveSection] = useState("company")
  const companySave = useSaveFlash()
  const invoiceSave = useSaveFlash()
  const userSave = useSaveFlash()
  const contentRef = useRef<HTMLDivElement>(null)

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

  function scrollTo(id: string) {
    setActiveSection(id)
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  /* ─────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────── */
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
      <div ref={contentRef} className="flex-1 min-w-0 space-y-4 overflow-y-auto pb-6">

        {/* ── 1. Company Info ── */}
        <SectionCard
          id="company"
          icon={Building2}
          title="Company Info"
          description="Displayed on invoices and client-facing documents"
        >
          <div className="space-y-4">
            {/* Logo placeholder */}
            <Field label="Logo">
              <div className="flex items-center gap-4">
                <div className="flex size-16 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-300 shrink-0">
                  <ImagePlus className="size-6" />
                </div>
                <div>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <Plus className="size-3.5" />
                    Upload Logo
                  </button>
                  <p className="mt-1 text-[11px] text-gray-400">PNG or SVG, max 1 MB</p>
                </div>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Company Name">
                <input
                  value={company.name}
                  onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value }))}
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

            <div className="flex justify-end pt-1">
              <SaveButton saved={companySave.saved} onClick={companySave.trigger} />
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
          <ManagedList items={carriers} setItems={setCarriers} noun="carrier" />
        </SectionCard>

        {/* ── 3. Service Types ── */}
        <SectionCard
          id="services"
          icon={Wrench}
          title="Service Types"
          description="Available service options shown in service request forms"
        >
          <ManagedList items={serviceTypes} setItems={setServiceTypes} noun="service type" />
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

            <div className="flex justify-end pt-1">
              <SaveButton saved={invoiceSave.saved} onClick={invoiceSave.trigger} />
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
                {[
                  { name: "Admin User", email: "admin@safirlogs.com", role: "Super Admin" },
                ].map((u) => (
                  <div
                    key={u.email}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold shrink-0 select-none">
                        AU
                      </div>
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
                <p className="text-[11px] text-gray-400">
                  Full user management available after Supabase Auth setup.
                </p>
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
                    value={inviteSubject}
                    onChange={(e) => setInviteSubject(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field
                  label="Invite Message Template"
                  hint="Use [Contact Name] and [Company Name] as placeholders"
                >
                  <textarea
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    rows={5}
                    className={textareaCls}
                  />
                </Field>
              </div>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Password reset */}
            <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5">
              <KeyRound className="size-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-gray-700">Password Reset</p>
                <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">
                  Password resets are sent via email. Admin and client users can request a reset from
                  the login page at any time. Admins can also trigger a reset from the Clients page
                  using the key icon on any Active login account.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3.5">
              <ShieldCheck className="size-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-blue-800">Auth Backend</p>
                <p className="text-[12px] text-blue-600 mt-0.5 leading-relaxed">
                  Login, session management, and role-based access will be powered by Supabase Auth.
                  Connect your Supabase project to enable live authentication.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <SaveButton saved={userSave.saved} onClick={userSave.trigger} />
            </div>
          </div>
        </SectionCard>

      </div>
    </div>
  )
}
