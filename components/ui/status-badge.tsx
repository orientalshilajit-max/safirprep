import { cn } from "@/lib/utils"

const variants: Record<string, string> = {
  Active:      "text-green-700 bg-green-50 ring-green-200",
  Archived:    "text-gray-500 bg-gray-100 ring-gray-200",
  "In Transit": "text-blue-700 bg-blue-50 ring-blue-200",
  "In Progress":"text-orange-700 bg-orange-50 ring-orange-200",
  Received:    "text-teal-700 bg-teal-50 ring-teal-200",
  Delivered:   "text-gray-500 bg-gray-100 ring-gray-200",
  Pending:     "text-yellow-700 bg-yellow-50 ring-yellow-200",
  Completed:   "text-green-700 bg-green-50 ring-green-200",
  Unpaid:      "text-red-700 bg-red-50 ring-red-200",
  Paid:        "text-green-700 bg-green-50 ring-green-200",
  Overdue:     "text-red-700 bg-red-50 ring-red-200",
}

type StatusBadgeProps = {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1",
        variants[status] ?? "text-gray-500 bg-gray-100 ring-gray-200",
        className
      )}
    >
      {status}
    </span>
  )
}
