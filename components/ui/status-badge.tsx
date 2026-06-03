import { cn } from "@/lib/utils"

const variants: Record<string, string> = {
  /* Product */
  Active:               "text-green-700 bg-green-50 ring-green-200",
  Archived:             "text-gray-500 bg-gray-100 ring-gray-200",
  /* Shipment */
  "In Transit":         "text-blue-700 bg-blue-50 ring-blue-200",
  Arrived:              "text-violet-700 bg-violet-50 ring-violet-200",
  Received:             "text-teal-700 bg-teal-50 ring-teal-200",
  "Partially Received": "text-teal-600 bg-teal-50 ring-teal-100",
  Delivered:            "text-gray-500 bg-gray-100 ring-gray-200",
  /* Service Request */
  New:                  "text-blue-700 bg-blue-50 ring-blue-200",
  "In Progress":        "text-orange-700 bg-orange-50 ring-orange-200",
  Completed:            "text-green-700 bg-green-50 ring-green-200",
  "Need Attention":     "text-red-700 bg-red-50 ring-red-200",
  Invoiced:             "text-purple-700 bg-purple-50 ring-purple-200",
  Cancelled:            "text-gray-500 bg-gray-100 ring-gray-200",
  /* Invoice */
  Pending:              "text-yellow-700 bg-yellow-50 ring-yellow-200",
  Unpaid:               "text-red-700 bg-red-50 ring-red-200",
  Paid:                 "text-green-700 bg-green-50 ring-green-200",
  Overdue:              "text-red-700 bg-red-50 ring-red-200",
  Void:                 "text-gray-400 bg-gray-100 ring-gray-200",
  Combined:             "text-violet-700 bg-violet-50 ring-violet-200",
  /* Client */
  Inactive:             "text-slate-500 bg-slate-100 ring-slate-200",
  /* Login Status */
  "No Login":           "text-gray-400 bg-gray-100 ring-gray-200",
  "Invite Sent":        "text-amber-700 bg-amber-50 ring-amber-200",
  Disabled:             "text-red-600 bg-red-50 ring-red-200",
}

type StatusBadgeProps = {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 whitespace-nowrap",
        variants[status] ?? "text-gray-500 bg-gray-100 ring-gray-200",
        className
      )}
    >
      {status}
    </span>
  )
}
