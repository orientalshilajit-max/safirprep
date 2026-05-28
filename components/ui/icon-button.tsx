import { cn } from "@/lib/utils"
import type { ButtonHTMLAttributes } from "react"

type Variant = "default" | "danger" | "primary"

const variantClass: Record<Variant, string> = {
  default: "text-gray-400 hover:text-gray-700 hover:bg-gray-100",
  danger:  "text-gray-400 hover:text-red-600 hover:bg-red-50",
  primary: "text-gray-400 hover:text-blue-600 hover:bg-blue-50",
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

export function IconButton({
  className,
  variant = "default",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center size-7 rounded-md transition-colors",
        variantClass[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
