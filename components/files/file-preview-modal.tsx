"use client"

import { createPortal } from "react-dom"
import { useEffect } from "react"
import {
  X,
  FileText,
  File,
  Archive,
  Download,
} from "lucide-react"
import type { FileDoc } from "@/lib/types"

function getFileKind(ext: string): "image" | "pdf" | "word" | "excel" | "archive" | "unknown" {
  const e = ext.toLowerCase()
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(e)) return "image"
  if (e === "pdf") return "pdf"
  if (["doc", "docx"].includes(e)) return "word"
  if (["xls", "xlsx", "csv"].includes(e)) return "excel"
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return "archive"
  return "unknown"
}

function FileIconLarge({ ext }: { ext: string }) {
  const kind = getFileKind(ext)

  if (kind === "pdf") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-24 items-center justify-center rounded-2xl bg-red-50 border border-red-100">
          <FileText className="size-12 text-red-500" />
        </div>
        <span className="text-[11px] font-bold text-red-500 uppercase tracking-widest">PDF Document</span>
      </div>
    )
  }
  if (kind === "word") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-24 items-center justify-center rounded-2xl bg-blue-50 border border-blue-100">
          <FileText className="size-12 text-blue-600" />
        </div>
        <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">Word Document</span>
      </div>
    )
  }
  if (kind === "excel") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-24 items-center justify-center rounded-2xl bg-green-50 border border-green-100">
          <FileText className="size-12 text-green-600" />
        </div>
        <span className="text-[11px] font-bold text-green-600 uppercase tracking-widest">Spreadsheet</span>
      </div>
    )
  }
  if (kind === "archive") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-24 items-center justify-center rounded-2xl bg-amber-50 border border-amber-100">
          <Archive className="size-12 text-amber-500" />
        </div>
        <span className="text-[11px] font-bold text-amber-500 uppercase tracking-widest">Archive</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex size-24 items-center justify-center rounded-2xl bg-gray-100 border border-gray-200">
        <File className="size-12 text-gray-400" />
      </div>
      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">File</span>
    </div>
  )
}

type FilePreviewModalProps = {
  file: FileDoc | null
  onClose: () => void
}

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  useEffect(() => {
    if (!file) return
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [file])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!file) return null

  const kind = getFileKind(file.ext)

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 60 }} aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-gray-900 truncate">{file.name}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{file.size} · {file.category}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 flex size-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-y-auto">
          {kind === "image" ? (
            <div className="flex items-center justify-center p-6 bg-gray-50 min-h-[280px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.fileUrl ?? `https://via.placeholder.com/480x320/e2e8f0/94a3b8?text=${encodeURIComponent(file.name)}`}
                alt={file.name}
                className="max-w-full max-h-[320px] rounded-lg border border-gray-200 shadow-sm object-contain"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-6 min-h-[280px]">
              <FileIconLarge ext={file.ext} />
              <p className="mt-6 text-[13px] text-gray-500 text-center max-w-xs">
                Preview not available for this file type. Download to view.
              </p>
            </div>
          )}
        </div>

        {/* Meta + actions */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-200 bg-gray-50/60">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mb-4">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Uploaded By</p>
              <p className="text-[13px] text-gray-700 mt-0.5">{file.uploadedBy}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Date</p>
              <p className="text-[13px] text-gray-700 mt-0.5">{file.uploadedAt}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Related To</p>
              <p className="text-[13px] text-gray-700 mt-0.5">{file.relatedTo}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Client</p>
              <p className="text-[13px] text-gray-700 mt-0.5">{file.clientName}</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (file.fileUrl) {
                const a = document.createElement("a")
                a.href = file.fileUrl
                a.download = file.name
                a.target = "_blank"
                a.rel = "noopener noreferrer"
                a.click()
              }
              onClose()
            }}
            className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors"
          >
            <Download className="size-3.5" />
            Download
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
