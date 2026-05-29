export type UserRole = "admin" | "client"
export type ProductStatus = "Active" | "Archived"
export type ShipmentStatus =
  | "In Transit"
  | "Arrived"
  | "Received"
  | "Partially Received"
  | "Need Attention"

export type ServiceStatus =
  | "New"
  | "In Progress"
  | "Completed"
  | "Need Attention"
  | "Invoiced"
  | "Cancelled"

export type ServiceType =
  | "FBA Prep"
  | "FBM Fulfillment"
  | "Labeling"
  | "Bundling"
  | "Inspection"
  | "Forwarding"
  | "Storage"
  | "Returns"
  | "Other"

export const SERVICE_TYPES: ServiceType[] = [
  "FBA Prep",
  "FBM Fulfillment",
  "Labeling",
  "Bundling",
  "Inspection",
  "Forwarding",
  "Storage",
  "Returns",
  "Other",
]

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

export type ServiceFile = {
  id: string
  name: string
  type: string
  size: string
}

export type ServiceDetails = {
  prepNotes?: string
  orderNotes?: string
  placementNotes?: string
  bundleInstructions?: string
  unitsPerBundle?: number
  serviceDescription?: string
}

export type ServiceRequest = {
  id: string
  requestNumber: string
  clientId: string
  clientName: string
  productId: string
  productName: string
  productSku: string
  service: ServiceType
  quantity: number
  status: ServiceStatus
  files: ServiceFile[]
  notes: string
  serviceDetails: ServiceDetails
  createdAt: string
  isArchived?: boolean
  inventoryDeducted?: boolean
}

export type FileCategory =
  | "Agreements"
  | "Labels"
  | "Shipment Docs"
  | "Product Docs"
  | "Invoices"
  | "Other"

export const FILE_CATEGORIES: FileCategory[] = [
  "Agreements",
  "Labels",
  "Shipment Docs",
  "Product Docs",
  "Invoices",
  "Other",
]

export type FileDoc = {
  id: string
  name: string
  ext: string
  size: string
  category: FileCategory
  relatedTo: string
  relatedType: "service-request" | "shipment" | "product" | "invoice" | "agreement" | "general"
  relatedId: string
  clientId: string
  clientName: string
  uploadedBy: string
  uploadedAt: string
  notes?: string
}

export type DataTableColumn<T> = {
  id: string
  header: string
  cell: (row: T, index: number) => React.ReactNode
  className?: string
  headerClassName?: string
}
