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

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const nav = role === "admin" ? adminNav : clientNav

  return (
    <aside className="flex flex-col w-[220px] bg-slate-900 shrink-0 overflow-hidden">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-[18px] border-b border-slate-800">
        <div className="flex size-9 items-center justify-center rounded-lg bg-blue-600 shrink-0">
          <Box className="size-[18px] text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white leading-tight truncate">
            Your Company
          </p>
          <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
            {role === "admin" ? "Admin Portal" : "Client Portal"}
          </p>
        </div>
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
      <div className="px-2 pb-4 border-t border-slate-800 pt-2">
        <Link
          href="/help"
          className="flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          <HelpCircle className="size-[16px] shrink-0 text-slate-500" />
          <span>Help & Support</span>
        </Link>
      </div>
    </aside>
  )
}
