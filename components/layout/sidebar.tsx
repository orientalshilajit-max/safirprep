"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  Truck,
  Wrench,
  FolderOpen,
  FileText,
  Settings,
  Users,
  HelpCircle,
  Box,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserRole } from "@/lib/types"

const clientNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Products", href: "/products", icon: Package },
  { label: "Incoming Shipments", href: "/shipments", icon: Truck },
  { label: "Service Requests", href: "/service-requests", icon: Wrench },
  { label: "Files & Documents", href: "/files", icon: FolderOpen },
  { label: "Invoices", href: "/invoices", icon: FileText },
]

const adminNav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Products", href: "/products", icon: Package },
  { label: "Incoming Shipments", href: "/shipments", icon: Truck },
  { label: "Service Requests", href: "/service-requests", icon: Wrench },
  { label: "Files & Documents", href: "/files", icon: FolderOpen },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Settings", href: "/settings", icon: Settings },
]

type SidebarProps = {
  role: UserRole
  isOpen: boolean
  onClose: () => void
  companyName?: string
  companyLogoUrl?: string | null
}

export function Sidebar({ role, isOpen, onClose, companyName, companyLogoUrl }: SidebarProps) {
  const pathname = usePathname()
  const nav = role === "admin" ? adminNav : clientNav

  const displayName = companyName || "Your Company"

  return (
    <>
      {/* Mobile backdrop overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        className={cn(
          "flex flex-col w-[220px] bg-slate-900 shrink-0 overflow-hidden",
          // Mobile: fixed drawer that slides in/out
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out",
          // Desktop: static in normal flow
          "md:relative md:translate-x-0 md:transition-none",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-4 py-[18px] border-b border-slate-800 shrink-0">
          {companyLogoUrl ? (
            /* Uploaded logo — no container, transparent bg, centered */
            <div className="flex flex-col items-start gap-1 min-w-0 flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={companyLogoUrl}
                alt={displayName}
                className="max-h-[40px] md:max-h-[60px] w-auto object-contain"
              />
              <p className="text-[11px] text-slate-400 leading-tight">
                {role === "admin" ? "Admin Portal" : "Client Portal"}
              </p>
            </div>
          ) : (
            /* Fallback: blue icon + company name + subtitle */
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600">
                <Box className="size-[18px] text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white leading-tight truncate">
                  {displayName}
                </p>
                <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                  {role === "admin" ? "Admin Portal" : "Client Portal"}
                </p>
              </div>
            </div>
          )}
          {/* Close button — mobile only */}
          <button
            onClick={onClose}
            className="md:hidden flex size-7 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] font-medium transition-colors",
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                )}
              >
                <item.icon
                  className={cn(
                    "size-[16px] shrink-0",
                    active ? "text-white" : "text-slate-500"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Help */}
        <div className="px-2 pb-4 border-t border-slate-800 pt-2 shrink-0">
          <Link
            href="/help"
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            <HelpCircle className="size-[16px] shrink-0 text-slate-500" />
            <span>Help & Support</span>
          </Link>
        </div>
      </aside>
    </>
  )
}
