import { cn } from "@/lib/utils"
import type { DataTableColumn } from "@/lib/types"

type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  emptyState?: React.ReactNode
  className?: string
  // If provided, renders a card for each row on screens smaller than md (768px).
  // The full table is still rendered and visible at md+.
  mobileCard?: (row: T, index: number) => React.ReactNode
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyState,
  className,
  mobileCard,
}: DataTableProps<T>) {
  return (
    <div className={cn(className)}>
      {/* ── Mobile card list (hidden md+) ─────────────────── */}
      {mobileCard && (
        <div className="md:hidden">
          {data.length === 0 ? (
            emptyState
          ) : (
            <div className="divide-y divide-gray-100">
              {data.map((row, i) => (
                <div key={keyExtractor(row)} className="group">
                  {mobileCard(row, i)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Desktop table (hidden below md when mobileCard given) ── */}
      <div className={cn(mobileCard ? "hidden md:block" : "block", "overflow-x-auto")}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    "px-4 py-[10px] text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap sticky top-0 bg-gray-50 z-10",
                    col.headerClassName
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  {emptyState}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={keyExtractor(row)}
                  className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors group"
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn("px-4 py-[10px] align-middle", col.className)}
                    >
                      {col.cell(row, i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
