"use client"

import { Bell, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserRole } from "@/lib/types"

type HeaderProps = {
  role: UserRole
  setRole: (r: UserRole) => void
}

export function Header({ role, setRole }: HeaderProps) {
  return (
    <header className="flex items-center justify-between h-[60px] px-6 bg-white border-b border-gray-200 shrink-0">
      <div>
        <h1 className="text-[15px] font-bold text-gray-900 leading-tight">
          Welcome back, John!
        </h1>
        <p className="text-[12px] text-gray-400 leading-tight mt-0.5">
          Here&apos;s what&apos;s happening with your account.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Role switcher */}
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 bg-gray-50 mr-1">
          {(["client", "admin"] as UserRole[]).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={cn(
                "px-3 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors",
                role === r
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Notifications */}
        <button className="relative flex size-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
          <Bell className="size-[16px]" />
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-blue-500" />
        </button>

        {/* User */}
        <button className="flex items-center gap-2 ml-1 pl-3 border-l border-gray-200">
          <div className="flex size-[30px] items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold select-none">
            JS
          </div>
          <span className="text-[13px] font-medium text-gray-700">John Smith</span>
          <ChevronDown className="size-3.5 text-gray-400" />
        </button>
      </div>
    </header>
  )
}
