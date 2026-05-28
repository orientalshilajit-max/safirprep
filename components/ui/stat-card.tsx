import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

type StatCardProps = {
  label: string
  value: number
  icon: LucideIcon
  iconClass: string
  active?: boolean
  onClick?: () => void
}

export function StatCard({ label, value, icon: Icon, iconClass, active, onClick }: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left bg-white rounded-xl border p-5 shadow-sm transition-all",
        active
          ? "border-blue-400 ring-1 ring-blue-400 bg-blue-50/30"
          : "border-gray-200 hover:border-gray-300"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">shipments</p>
        </div>
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", iconClass)}>
          <Icon className="size-4" />
        </div>
      </div>
    </button>
  )
}
