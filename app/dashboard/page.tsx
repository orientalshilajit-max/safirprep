"use client"

import Link from "next/link"
import {
  Package,
  Truck,
  Wrench,
  FileText,
  Users,
  DollarSign,
  ArrowRight,
  AlertTriangle,
  FileText as FileIcon,
  Archive,
  File,
  Clock,
  CheckCircle,
} from "lucide-react"
import {
  useRole,
  useProducts,
  useShipments,
  useRequests,
  useInvoices,
  useFiles,
  useClients,
} from "@/components/layout/app-shell"
import { StatusBadge } from "@/components/ui/status-badge"
import { StatCard } from "@/components/ui/stat-card"
import type { Shipment, ServiceRequest, FileDoc, Invoice, Client } from "@/lib/types"

/* ─────────────────────────────────────────────────────────
   Shared helpers
───────────────────────────────────────────────────────── */

const DEMO_CLIENT_ID = "c1"

function invoiceTotal(inv: Invoice) {
  return inv.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0)
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

function fmtExact(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

/* ── Section wrapper ──────────────────────────────────── */
function Section({
  title,
  href,
  children,
}: {
  title: string
  href: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <h2 className="text-[13px] font-semibold text-gray-800">{title}</h2>
        <Link
          href={href}
          className="flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          View all <ArrowRight className="size-3" />
        </Link>
      </div>
      {children}
    </div>
  )
}

/* ── Mini table ───────────────────────────────────────── */
function MiniTable({
  headers,
  rows,
  emptyText = "No data",
}: {
  headers: string[]
  rows: React.ReactNode[][]
  emptyText?: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-4 py-8 text-center text-[12px] text-gray-400"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((cells, ri) => (
              <tr
                key={ri}
                className="border-b border-gray-50 last:border-0 hover:bg-blue-50/20 transition-colors"
              >
                {cells.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2.5 align-middle">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ── File type icon ───────────────────────────────────── */
function FileTypeIcon({ ext }: { ext: string }) {
  const e = ext.toLowerCase()
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(e)) {
    return (
      <div className="flex size-7 items-center justify-center rounded border border-purple-100 bg-purple-50">
        <FileIcon className="size-3.5 text-purple-500" />
      </div>
    )
  }
  if (e === "pdf") {
    return (
      <div className="flex size-7 items-center justify-center rounded border border-red-100 bg-red-50">
        <FileIcon className="size-3.5 text-red-500" />
      </div>
    )
  }
  if (["doc", "docx"].includes(e)) {
    return (
      <div className="flex size-7 items-center justify-center rounded border border-blue-100 bg-blue-50">
        <FileIcon className="size-3.5 text-blue-600" />
      </div>
    )
  }
  if (["xls", "xlsx"].includes(e)) {
    return (
      <div className="flex size-7 items-center justify-center rounded border border-green-100 bg-green-50">
        <FileIcon className="size-3.5 text-green-600" />
      </div>
    )
  }
  return (
    <div className="flex size-7 items-center justify-center rounded border border-gray-100 bg-gray-50">
      <File className="size-3.5 text-gray-400" />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   CLIENT DASHBOARD
───────────────────────────────────────────────────────── */
function ClientDashboard() {
  const { products } = useProducts()
  const { shipments } = useShipments()
  const { requests } = useRequests()
  const { invoices } = useInvoices()
  const { files } = useFiles()

  const myProducts = products.filter((p) => p.clientId === DEMO_CLIENT_ID && p.status === "Active")
  const myShipments = shipments.filter((s) => s.clientId === DEMO_CLIENT_ID && !s.isArchived)
  const myRequests = requests.filter((r) => r.clientId === DEMO_CLIENT_ID && !r.isArchived)
  const myInvoices = invoices.filter((i) => i.clientId === DEMO_CLIENT_ID)
  const myFiles = files.filter((f) => f.clientId === DEMO_CLIENT_ID)

  const availableUnits = myProducts.reduce((s, p) => s + p.available, 0)
  const incomingUnits = products
    .filter((p) => p.clientId === DEMO_CLIENT_ID)
    .reduce((s, p) => s + p.incoming, 0)
  const openRequests = myRequests.filter((r) => r.status === "New").length
  const unpaidInvoices = myInvoices.filter((i) => ["Unpaid", "Overdue"].includes(i.status)).length

  /* Recent shipments – last 4 */
  const recentShipments = [...myShipments]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4)

  /* Open requests – New + In Progress, last 5 */
  const openReqs = myRequests
    .filter((r) => ["New", "In Progress"].includes(r.status))
    .slice(0, 5)

  /* Recent files – last 5 */
  const recentFiles = [...myFiles]
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Available Units"
          value={availableUnits}
          valueDisplay={availableUnits.toLocaleString()}
          icon={Package}
          iconClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Incoming Units"
          value={incomingUnits}
          valueDisplay={incomingUnits.toLocaleString()}
          icon={Truck}
          iconClass="bg-orange-50 text-orange-500"
        />
        <StatCard
          label="Open Requests"
          value={openRequests}
          icon={Wrench}
          iconClass="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Unpaid Invoices"
          value={unpaidInvoices}
          icon={AlertTriangle}
          iconClass={unpaidInvoices > 0 ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-400"}
        />
      </div>

      {/* Recent Shipments */}
      <Section title="Recent Incoming Shipments" href="/shipments">
        <MiniTable
          headers={["Shipment #", "Products", "Units", "Status", "Created"]}
          emptyText="No incoming shipments"
          rows={recentShipments.map((s) => [
            <span key="num" className="font-mono text-[12px] font-semibold text-gray-700">
              {s.shipmentNumber}
            </span>,
            <span key="prod" className="text-[12px] text-gray-500">
              {s.products.length} SKU{s.products.length !== 1 ? "s" : ""}
            </span>,
            <span key="units" className="text-[13px] font-semibold text-gray-800 tabular-nums">
              {s.products.reduce((sum, p) => sum + p.units, 0).toLocaleString()}
            </span>,
            <StatusBadge key="status" status={s.status} />,
            <span key="date" className="text-[12px] text-gray-400">
              {s.createdAt}
            </span>,
          ])}
        />
      </Section>

      {/* 2-col grid: open requests + recent files */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 flex-1 min-h-0">
        <Section title="Open Service Requests" href="/service-requests">
          <MiniTable
            headers={["Request #", "Product", "Service", "Qty", "Status"]}
            emptyText="No open requests"
            rows={openReqs.map((r) => [
              <span key="num" className="font-mono text-[12px] font-semibold text-gray-700">
                {r.requestNumber}
              </span>,
              <span key="prod" className="text-[12px] text-gray-700 truncate max-w-[120px] block">
                {r.productName}
              </span>,
              <span key="svc" className="text-[12px] text-gray-500">
                {r.service}
              </span>,
              <span key="qty" className="text-[12px] font-semibold text-gray-800 tabular-nums">
                {r.quantity.toLocaleString()}
              </span>,
              <StatusBadge key="status" status={r.status} />,
            ])}
          />
        </Section>

        <Section title="Recent Files" href="/files">
          <MiniTable
            headers={["Preview", "File Name", "Category", "Date", ""]}
            emptyText="No files uploaded"
            rows={recentFiles.map((f) => [
              <FileTypeIcon key="icon" ext={f.ext} />,
              <span key="name" className="text-[12px] font-medium text-gray-800 truncate max-w-[140px] block">
                {f.name}
              </span>,
              <span key="cat" className="text-[12px] text-gray-500">
                {f.category}
              </span>,
              <span key="date" className="text-[11px] text-gray-400 whitespace-nowrap">
                {f.uploadedAt}
              </span>,
              <button
                key="dl"
                className="text-[11px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                Download
              </button>,
            ])}
          />
        </Section>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   ADMIN DASHBOARD
───────────────────────────────────────────────────────── */

const ACTIVITY = [
  { id: 1, icon: Users,   color: "bg-blue-50 text-blue-600",   text: "PrimePack Inc. account created",                  time: "2 days ago" },
  { id: 2, icon: Wrench,  color: "bg-violet-50 text-violet-600", text: "REQ-2005 submitted by TechVault Co.",            time: "1 day ago"  },
  { id: 3, icon: Truck,   color: "bg-orange-50 text-orange-500", text: "IN-1008 created for TechVault Co.",              time: "2 days ago" },
  { id: 4, icon: FileText,color: "bg-green-50 text-green-600",  text: "Invoice INV-0041 generated · TechVault Co.",      time: "6 days ago" },
  { id: 5, icon: Wrench,  color: "bg-violet-50 text-violet-600", text: "REQ-2004 submitted by NovaTrade Ltd.",           time: "2 days ago" },
  { id: 6, icon: Truck,   color: "bg-orange-50 text-orange-500", text: "IN-1007 created for NovaTrade Ltd.",             time: "5 days ago" },
  { id: 7, icon: FileText,color: "bg-green-50 text-green-600",  text: "Invoice INV-0040 generated · NovaTrade Ltd.",     time: "11 days ago"},
  { id: 8, icon: Package, color: "bg-blue-50 text-blue-600",    text: "Laptop Stand Adjustable added to inventory",       time: "13 days ago"},
]

const REVENUE = [
  { label: "Today",      value: 0 },
  { label: "This Week",  value: 545 },
  { label: "This Month", value: 2842 },
]

function AdminDashboard() {
  const { products } = useProducts()
  const { shipments } = useShipments()
  const { requests } = useRequests()
  const { invoices } = useInvoices()
  const { clients } = useClients()

  const activeClients = clients.filter((c) => !c.isArchived && c.status === "Active").length
  const inboundShipments = shipments.filter(
    (s) => !s.isArchived && ["In Transit", "Arrived"].includes(s.status)
  ).length
  const openRequests = requests.filter(
    (r) => !r.isArchived && ["New", "In Progress"].includes(r.status)
  ).length
  const unpaidInvoices = invoices.filter((i) => ["Unpaid", "Overdue"].includes(i.status)).length
  const revenue = invoices
    .filter((i) => i.status === "Paid")
    .reduce((s, i) => s + invoiceTotal(i), 0)

  /* Recent shipments – last 5 */
  const recentShipments = [...shipments.filter((s) => !s.isArchived)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)

  /* Open requests – New + In Progress, last 6 */
  const openReqs = requests
    .filter((r) => !r.isArchived && ["New", "In Progress"].includes(r.status))
    .slice(0, 6)

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard
          label="Active Clients"
          value={activeClients}
          icon={Users}
          iconClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Inbound"
          value={inboundShipments}
          icon={Truck}
          iconClass="bg-orange-50 text-orange-500"
        />
        <StatCard
          label="Open Requests"
          value={openRequests}
          icon={Wrench}
          iconClass="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Unpaid Invoices"
          value={unpaidInvoices}
          icon={AlertTriangle}
          iconClass={unpaidInvoices > 0 ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-400"}
        />
        <StatCard
          label="Revenue"
          value={revenue}
          valueDisplay={fmt(revenue)}
          sublabel="from paid invoices"
          icon={DollarSign}
          iconClass="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 flex-1 min-h-0">

        {/* Left 2/3 */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">

          {/* Recent Shipments */}
          <Section title="Recent Shipments" href="/shipments">
            <MiniTable
              headers={["Shipment #", "Client", "Products", "Units", "Status", "Created"]}
              emptyText="No shipments"
              rows={recentShipments.map((s) => [
                <span key="num" className="font-mono text-[12px] font-semibold text-gray-700">
                  {s.shipmentNumber}
                </span>,
                <span key="client" className="text-[12px] text-gray-500 max-w-[110px] truncate block">
                  {s.clientName}
                </span>,
                <span key="prod" className="text-[12px] text-gray-500">
                  {s.products.length} SKU{s.products.length !== 1 ? "s" : ""}
                </span>,
                <span key="units" className="text-[13px] font-semibold text-gray-800 tabular-nums">
                  {s.products.reduce((sum, p) => sum + p.units, 0).toLocaleString()}
                </span>,
                <StatusBadge key="status" status={s.status} />,
                <span key="date" className="text-[11px] text-gray-400 whitespace-nowrap">
                  {s.createdAt}
                </span>,
              ])}
            />
          </Section>

          {/* Open Requests */}
          <Section title="Open Requests" href="/service-requests">
            <MiniTable
              headers={["Request #", "Client", "Product", "Service", "Qty", "Status"]}
              emptyText="No open requests"
              rows={openReqs.map((r) => [
                <span key="num" className="font-mono text-[12px] font-semibold text-gray-700">
                  {r.requestNumber}
                </span>,
                <span key="client" className="text-[12px] text-gray-500 max-w-[100px] truncate block">
                  {r.clientName}
                </span>,
                <span key="prod" className="text-[12px] text-gray-700 max-w-[120px] truncate block">
                  {r.productName}
                </span>,
                <span key="svc" className="text-[12px] text-gray-500">
                  {r.service}
                </span>,
                <span key="qty" className="text-[12px] font-semibold text-gray-800 tabular-nums">
                  {r.quantity.toLocaleString()}
                </span>,
                <StatusBadge key="status" status={r.status} />,
              ])}
            />
          </Section>
        </div>

        {/* Right 1/3 */}
        <div className="flex flex-col gap-4 min-h-0">

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <h2 className="text-[13px] font-semibold text-gray-800">Recent Activity</h2>
            </div>
            <div className="divide-y divide-gray-50 overflow-y-auto">
              {ACTIVITY.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-lg mt-0.5 ${item.color}`}
                  >
                    <item.icon className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] text-gray-700 leading-snug">{item.text}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue Summary */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-[13px] font-semibold text-gray-800">Revenue Summary</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Paid invoices only</p>
            </div>
            <div className="px-4 py-3 divide-y divide-gray-50">
              {REVENUE.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    {label === "Today" && <Clock className="size-3.5 text-gray-300" />}
                    {label === "This Week" && <CheckCircle className="size-3.5 text-green-400" />}
                    {label === "This Month" && <DollarSign className="size-3.5 text-emerald-500" />}
                    <span className="text-[13px] text-gray-600">{label}</span>
                  </div>
                  <span
                    className={`text-[14px] font-bold tabular-nums ${
                      value === 0 ? "text-gray-300" : "text-gray-900"
                    }`}
                  >
                    {fmtExact(value)}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 pb-3 pt-1">
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5">
                <span className="text-[12px] font-semibold text-emerald-700">All Time</span>
                <span className="text-[15px] font-bold text-emerald-700 tabular-nums">
                  {fmtExact(revenue)}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Page entry point
───────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { role } = useRole()
  return role === "admin" ? <AdminDashboard /> : <ClientDashboard />
}
