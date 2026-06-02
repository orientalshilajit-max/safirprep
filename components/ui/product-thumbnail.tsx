import Image from "next/image"
import { cn } from "@/lib/utils"

const palette = [
  "bg-blue-100 text-blue-600",
  "bg-violet-100 text-violet-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-rose-100 text-rose-600",
  "bg-teal-100 text-teal-600",
  "bg-orange-100 text-orange-600",
  "bg-purple-100 text-purple-600",
  "bg-cyan-100 text-cyan-600",
  "bg-pink-100 text-pink-600",
]

type ProductThumbnailProps = {
  src?: string | null
  name: string
  index?: number
  size?: "sm" | "md" | "lg"
}

const sizes = {
  sm: "size-8 text-[11px]",
  md: "size-10 text-[13px]",
  lg: "size-16 text-xl",
}

const pixelSizes = { sm: 32, md: 40, lg: 64 }

export function ProductThumbnail({
  src,
  name,
  index = 0,
  size = "md",
}: ProductThumbnailProps) {
  const color = palette[index % palette.length]

  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={pixelSizes[size]}
        height={pixelSizes[size]}
        unoptimized
        className={cn("rounded-md object-cover shrink-0", sizes[size])}
      />
    )
  }

  return (
    <div
      className={cn(
        "rounded-md flex items-center justify-center font-bold shrink-0 select-none",
        color,
        sizes[size]
      )}
      aria-label={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
