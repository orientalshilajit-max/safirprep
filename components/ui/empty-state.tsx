import { PackageSearch } from "lucide-react"

type EmptyStateProps = {
  title?: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({
  title = "No items found",
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-gray-100 mb-4">
        <PackageSearch className="size-6 text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {description && (
        <p className="mt-1 text-[13px] text-gray-500 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
