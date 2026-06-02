"use client"

import { createPortal } from "react-dom"
import { useEffect, useState } from "react"
import { X, Download, FileText, ZoomIn } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import type { FileDoc } from "@/lib/types"

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg"])
const WORD_EXTS  = new Set(["doc", "docx"])
const EXCEL_EXTS = new Set(["xls", "xlsx", "csv"])

function iconClass(ext: string) {
  if (ext === "pdf")          return "bg-red-100 text-red-500"
  if (WORD_EXTS.has(ext))     return "bg-blue-100 text-blue-500"
  if (EXCEL_EXTS.has(ext))    return "bg-green-100 text-green-600"
  return "bg-gray-100 text-gray-500"
}

type Props = {
  isOpen: boolean
  onClose: () => void
  files: FileDoc[]
  requestNumber: string
}

export function RequestFilesModal({ isOpen, onClose, files, requestNumber }: Props) {
  const [lightboxFile, setLightboxFile] = useState<FileDoc | null>(null)

  // Reset lightbox whenever this modal opens for a different request (or closes)
  const [prevKey, setPrevKey] = useState("")
  const currentKey = `${isOpen}|${requestNumber}`
  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
    if (lightboxFile !== null) setLightboxFile(null)
  }

  // Capture-phase ESC so lightbox ESC doesn't also close the main modal
  useEffect(() => {
    if (!lightboxFile) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation()
        setLightboxFile(null)
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [lightboxFile])

  // Prevent click-outside on the main modal overlay from closing it while lightbox is open
  const handleModalClose = () => {
    if (!lightboxFile) onClose()
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleModalClose}
        title={`Attachments — ${requestNumber}`}
        size="lg"
      >
        {files.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-gray-400">No files attached to this request.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {files.map((f) => {
              const ext = f.ext.toLowerCase()
              const isImg = IMAGE_EXTS.has(ext)
              const hasUrl = !!f.fileUrl

              return (
                <div
                  key={f.id}
                  className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
                >
                  {/* Preview */}
                  <div className="relative flex h-32 items-center justify-center bg-gray-50 group">
                    {isImg && hasUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={f.fileUrl}
                          alt={f.name}
                          className="h-full w-full cursor-pointer object-cover"
                          onClick={() => setLightboxFile(f)}
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                          <ZoomIn className="size-6 text-white drop-shadow" />
                        </div>
                      </>
                    ) : (
                      <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${iconClass(ext)}`}>
                        <FileText className="size-7" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                    <p
                      className="truncate text-[12px] font-medium leading-tight text-gray-800"
                      title={f.name}
                    >
                      {f.name}
                    </p>
                    <p className="text-[11px] text-gray-400">{f.size}</p>

                    {/* Download */}
                    {hasUrl ? (
                      <a
                        href={f.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-auto flex items-center justify-center gap-1.5 rounded-md bg-gray-100 px-2 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-200"
                      >
                        <Download className="size-3" />
                        Download
                      </a>
                    ) : (
                      <span className="mt-auto flex items-center justify-center gap-1.5 rounded-md bg-gray-50 px-2 py-1.5 text-[11px] text-gray-300 cursor-not-allowed">
                        <Download className="size-3" />
                        Download
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* Image lightbox — z-60 so it sits above the modal at z-50 */}
      {lightboxFile && lightboxFile.fileUrl && isOpen && createPortal(
        <div
          style={{ zIndex: 60 }}
          className="fixed inset-0 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxFile(null)}
        >
          {/* Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <a
              href={lightboxFile.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/20"
            >
              <Download className="size-3.5" />
              Download
            </a>
            <button
              className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              onClick={() => setLightboxFile(null)}
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxFile.fileUrl}
            alt={lightboxFile.name}
            className="max-h-[88vh] max-w-full rounded object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Filename caption */}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[12px] text-white/80">
            {lightboxFile.name}
          </p>
        </div>,
        document.body
      )}
    </>
  )
}
