export type UserRole = "admin" | "client"

export type ClientStatus = "Active" | "Pending" | "Inactive"
export type LoginStatus = "No Login" | "Invite Sent" | "Active" | "Disabled"

export type Client = {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string
  status: ClientStatus
  loginStatus: LoginStatus
  lastActivity: string | null
  notes: string
  isArchived?: boolean
  invitedAt?: string
  lastInviteSentAt?: string
  inviteCount?: number
}
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
  createdAt?: string
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
  archivedAt?: string
  isInventoryUpdated?: boolean
}

export type ServiceFile = {
  id: string
  name: string
  type: string
  size: string
  /** Ephemeral blob URL for in-modal image preview only. Never persisted. */
  localUrl?: string
}

export type ServiceDetails = {
  prepNotes?: string
  orderNotes?: string
  placementNotes?: string
  bundleInstructions?: string
  unitsPerBundle?: number
  serviceDescription?: string
}

export type RequestService = {
  id?: string
  serviceTypeId?: string | null
  serviceName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  notes: string
}

export type ServiceRequest = {
  id: string
  requestNumber: string
  clientId: string
  clientName: string
  productId: string
  productName: string
  productSku: string
  service: ServiceType       // primary service (backward compat)
  services: RequestService[] // all services (new)
  quantity: number
  status: ServiceStatus
  files: ServiceFile[]
  notes: string
  serviceDetails: ServiceDetails
  createdAt: string
  isArchived?: boolean
  inventoryDeducted?: boolean
}

export type InvoiceStatus = "Unpaid" | "Paid" | "Overdue" | "Void" | "Combined"

export type InvoiceLineItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
  productName?: string
  serviceName?: string
}

export type Invoice = {
  id: string
  invoiceNumber: string
  clientId: string
  clientName: string
  clientEmail: string
  clientAddress: string
  date: string
  dueDate: string
  status: InvoiceStatus
  lineItems: InvoiceLineItem[]
  notes: string
  relatedRequestNumber?: string
  /** If set, this invoice was merged into the combined invoice with this ID. */
  combinedIntoInvoiceId?: string
  /** ISO timestamp — present in Supabase mode, absent in mock mode. Used for date-based revenue filtering. */
  createdAt?: string
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
  /** Public URL for download/preview. Populated in Supabase mode only. */
  fileUrl?: string
}

export type DataTableColumn<T> = {
  id: string
  header: string
  cell: (row: T, index: number) => React.ReactNode
  className?: string
  headerClassName?: string
}
