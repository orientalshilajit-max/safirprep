import { cn } from "@/lib/utils"
import type { DataTableColumn } from "@/lib/types"

type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  emptyState?: React.ReactNode
  className?: string
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyState,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto", className)}>
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
  )
}
