export type UserRole = "admin" | "client"
export type ProductStatus = "Active" | "Archived"
export type ShipmentStatus =
  | "In Transit"
  | "Arrived"
  | "Received"
  | "Partially Received"
  | "Need Attention"

export const CARRIERS = [
  "UPS",
  "FedEx",
  "DHL",
  "USPS",
  "OnTrac",
  "Amazon Freight",
  "Amazon Delivery",
  "LTL Freight",
  "Local Delivery",
  "Other",
] as const
export type Carrier = (typeof CARRIERS)[number]

export type Product = {
  id: string
  name: string
  sku: string
  asin: string
  fnsku: string
  available: number
  incoming: number
  damaged: number
  status: ProductStatus
  image: string | null
  clientId: string
  clientName: string
  notes: string
}

export type ShipmentProduct = {
  id: string
  productId: string
  productName: string
  sku: string
  units: number
  receivedUnits: number
  damagedUnits: number
  notes: string
}

export type ShipmentTracking = {
  id: string
  carrier: string
  trackingNumber: string
  boxCount: number
  notes: string
}

export type Shipment = {
  id: string
  shipmentNumber: string
  clientId: string
  clientName: string
  products: ShipmentProduct[]
  tracking: ShipmentTracking[]
  status: ShipmentStatus
  createdAt: string
  notes: string
  isArchived?: boolean
  isInventoryUpdated?: boolean
}

export type DataTableColumn<T> = {
  id: string
  header: string
  cell: (row: T, index: number) => React.ReactNode
  className?: string
  headerClassName?: string
}
