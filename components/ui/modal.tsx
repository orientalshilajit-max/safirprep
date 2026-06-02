"use client"

import { createPortal } from "react-dom"
import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const widths = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
}

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: keyof typeof widths
  footer?: React.ReactNode
  zIndex?: number
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  footer,
  zIndex = 50,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [isOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!isOpen) return null

  return createPortal(
    <div
      style={{ zIndex }}
      className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-4"
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full bg-white flex flex-col",
          // Mobile: bottom sheet style — no side padding, rounded top corners only
          "rounded-t-2xl sm:rounded-xl",
          // Mobile: use almost full viewport height; desktop: cap at 90vh
          "max-h-[92dvh] sm:max-h-[90vh]",
          "shadow-2xl",
          widths[size]
        )}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">{children}</div>
        {footer && (
          <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50/60 shrink-0 rounded-b-2xl sm:rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
