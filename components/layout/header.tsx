"use client"

import { LogOut, RefreshCw, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserRole } from "@/lib/types"
import type { AuthUser } from "@/lib/auth"
import { NotificationBell } from "./notification-bell"

type HeaderProps = {
  role: UserRole
  setRole: (r: UserRole) => void
  authUser: AuthUser | null
  isMockMode: boolean
  onLogout: () => void
  onRefresh?: () => void
  isRefreshing?: boolean
  onMenuToggle?: () => void
}

export function Header({
  role, setRole, authUser, isMockMode, onLogout,
  onRefresh, isRefreshing, onMenuToggle,
}: HeaderProps) {
  const displayName = authUser?.displayName ?? "John Smith"
  const initials    = authUser?.initials    ?? "JS"
  const email       = authUser?.email       ?? null

  const greeting = authUser
    ? `Welcome back, ${authUser.displayName.split(" ")[0]}!`
    : "Welcome back!"

  const subtitle = isMockMode
    ? "Mock mode — no Supabase connection"
    : (email ?? "Here's what's happening with your account.")

  return (
    <header className="flex items-center justify-between h-[60px] px-3 sm:px-6 bg-white border-b border-gray-200 shrink-0 gap-2">
      {/* Left: hamburger (mobile) + greeting */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger — mobile only */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="md:hidden flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors shrink-0"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-[14px] sm:text-[15px] font-bold text-gray-900 leading-tight truncate">
            {greeting}
          </h1>
          <p className="text-[11px] sm:text-[12px] text-gray-400 leading-tight mt-0.5 truncate hidden sm:block">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Dev mode: role switcher */}
        {isMockMode && (
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 bg-gray-50 mr-1">
            {(["client", "admin"] as UserRole[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={cn(
                  "px-2 sm:px-3 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors",
                  role === r
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {/* Refresh data (Supabase mode only) */}
        {!isMockMode && onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh data from server"
            className="flex size-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn("size-[15px]", isRefreshing && "animate-spin")} />
          </button>
        )}

        {/* Notifications */}
        <NotificationBell isMockMode={isMockMode} />

        {/* User avatar + name */}
        <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-gray-200">
          <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold select-none">
            {initials}
          </div>
          <div className="hidden sm:block min-w-0">
            <p className="text-[13px] font-medium text-gray-700 leading-tight truncate max-w-[140px]">
              {displayName}
            </p>
            {email && (
              <p className="text-[11px] text-gray-400 leading-tight truncate max-w-[140px]">
                {email}
              </p>
            )}
          </div>
        </div>

        {/* Logout (auth mode only) */}
        {!isMockMode && (
          <button
            onClick={onLogout}
            title="Sign out"
            className="flex size-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors ml-1"
          >
            <LogOut className="size-[15px]" />
          </button>
        )}
      </div>
    </header>
  )
}
