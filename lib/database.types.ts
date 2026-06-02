// ============================================================
// Safir WMS – Supabase Database Types
// Generated from: supabase/migrations/20260528000000_initial_schema.sql
//
// When you run `supabase gen types typescript --local` after
// your project is linked, replace this file with the output.
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          auth_user_id: string | null
          company_name: string
          contact_name: string
          email: string
          phone: string | null
          status: Database["public"]["Enums"]["client_status"]
          login_status: Database["public"]["Enums"]["login_status"]
          notes: string | null
          invited_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          company_name: string
          contact_name: string
          email: string
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          login_status?: Database["public"]["Enums"]["login_status"]
          notes?: string | null
          invited_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          auth_user_id?: string | null
          company_name?: string
          contact_name?: string
          email?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          login_status?: Database["public"]["Enums"]["login_status"]
          notes?: string | null
          invited_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_auth_user_id_fkey"
            columns: ["auth_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      products: {
        Row: {
          id: string
          client_id: string
          name: string
          sku: string | null
          asin_upc: string | null
          fnsku: string | null
          image_url: string | null
          notes: string | null
          status: Database["public"]["Enums"]["product_status"]
          sort_order: number
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          name: string
          sku?: string | null
          asin_upc?: string | null
          fnsku?: string | null
          image_url?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          sort_order?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          name?: string
          sku?: string | null
          asin_upc?: string | null
          fnsku?: string | null
          image_url?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          sort_order?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      inventory: {
        Row: {
          id: string
          client_id: string
          product_id: string
          available_units: number
          incoming_units: number
          damaged_units: number
          received_units: number
          shipped_units: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          product_id: string
          available_units?: number
          incoming_units?: number
          damaged_units?: number
          received_units?: number
          shipped_units?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          product_id?: string
          available_units?: number
          incoming_units?: number
          damaged_units?: number
          received_units?: number
          shipped_units?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      incoming_shipments: {
        Row: {
          id: string
          client_id: string
          shipment_number: string
          status: Database["public"]["Enums"]["shipment_status"]
          notes: string | null
          inventory_synced: boolean
          inventory_posted_at: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          shipment_number: string
          status?: Database["public"]["Enums"]["shipment_status"]
          notes?: string | null
          inventory_synced?: boolean
          inventory_posted_at?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          shipment_number?: string
          status?: Database["public"]["Enums"]["shipment_status"]
          notes?: string | null
          inventory_synced?: boolean
          inventory_posted_at?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incoming_shipments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      incoming_shipment_items: {
        Row: {
          id: string
          shipment_id: string
          product_id: string
          expected_units: number
          received_units: number
          damaged_units: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shipment_id: string
          product_id: string
          expected_units?: number
          received_units?: number
          damaged_units?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shipment_id?: string
          product_id?: string
          expected_units?: number
          received_units?: number
          damaged_units?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incoming_shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "incoming_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_shipment_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      shipment_trackings: {
        Row: {
          id: string
          shipment_id: string
          carrier: string
          tracking_number: string | null
          box_count: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shipment_id: string
          carrier: string
          tracking_number?: string | null
          box_count?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shipment_id?: string
          carrier?: string
          tracking_number?: string | null
          box_count?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_trackings_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "incoming_shipments"
            referencedColumns: ["id"]
          }
        ]
      }
      service_requests: {
        Row: {
          id: string
          client_id: string
          request_number: string
          service_type: string
          status: Database["public"]["Enums"]["service_status"]
          notes: string | null
          inventory_deducted: boolean
          service_details: Json | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          request_number: string
          service_type: string
          status?: Database["public"]["Enums"]["service_status"]
          notes?: string | null
          inventory_deducted?: boolean
          service_details?: Json | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          request_number?: string
          service_type?: string
          status?: Database["public"]["Enums"]["service_status"]
          notes?: string | null
          inventory_deducted?: boolean
          service_details?: Json | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      service_request_services: {
        Row: {
          id: string
          request_id: string
          service_type_id: string | null
          service_name_snapshot: string
          quantity: number
          unit_price: number
          total_price: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          service_type_id?: string | null
          service_name_snapshot: string
          quantity?: number
          unit_price?: number
          total_price?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          service_type_id?: string | null
          service_name_snapshot?: string
          quantity?: number
          unit_price?: number
          total_price?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: [{ foreignKeyName: "service_request_services_request_id_fkey"; columns: ["request_id"]; referencedRelation: "service_requests"; referencedColumns: ["id"] }]
      }
      service_request_items: {
        Row: {
          id: string
          request_id: string
          product_id: string
          quantity: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          request_id: string
          product_id: string
          quantity?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          product_id?: string
          quantity?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      invoices: {
        Row: {
          id: string
          client_id: string
          request_id: string | null
          invoice_number: string
          status: Database["public"]["Enums"]["invoice_status"]
          amount: number
          due_date: string | null
          pdf_url: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          request_id?: string | null
          invoice_number: string
          status?: Database["public"]["Enums"]["invoice_status"]
          amount?: number
          due_date?: string | null
          pdf_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          request_id?: string | null
          invoice_number?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          amount?: number
          due_date?: string | null
          pdf_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          }
        ]
      }
      invoice_items: {
        Row: {
          id: string
          invoice_id: string
          description: string
          quantity: number
          unit_price: number
          total: number
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          description: string
          quantity?: number
          unit_price?: number
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          description?: string
          quantity?: number
          unit_price?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          }
        ]
      }
      files: {
        Row: {
          id: string
          client_id: string
          product_id: string | null
          shipment_id: string | null
          request_id: string | null
          invoice_id: string | null
          category: Database["public"]["Enums"]["file_category"]
          file_name: string
          file_url: string
          thumbnail_url: string | null
          file_type: string | null
          file_size_bytes: number | null
          uploaded_by: string | null
          uploaded_by_name: string | null
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          product_id?: string | null
          shipment_id?: string | null
          request_id?: string | null
          invoice_id?: string | null
          category?: Database["public"]["Enums"]["file_category"]
          file_name: string
          file_url: string
          thumbnail_url?: string | null
          file_type?: string | null
          file_size_bytes?: number | null
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          product_id?: string | null
          shipment_id?: string | null
          request_id?: string | null
          invoice_id?: string | null
          category?: Database["public"]["Enums"]["file_category"]
          file_name?: string
          file_url?: string
          thumbnail_url?: string | null
          file_type?: string | null
          file_size_bytes?: number | null
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          created_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "incoming_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          }
        ]
      }
      activity_log: {
        Row: {
          id: string
          client_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          entity_id: string | null
          action: string
          message: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          entity_id?: string | null
          action: string
          message: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          entity_id?: string | null
          action?: string
          message?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      carriers: {
        Row: {
          id: string
          name: string
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_types: {
        Row: {
          id: string
          name: string
          price: number
          visible_to_customers: boolean
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          price?: number
          visible_to_customers?: boolean
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          price?: number
          visible_to_customers?: boolean
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_pricing_rules: {
        Row: {
          id: string
          service_type_id: string
          min_qty: number
          max_qty: number | null
          price_per_unit: number
          label: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          service_type_id: string
          min_qty: number
          max_qty?: number | null
          price_per_unit: number
          label?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          service_type_id?: string
          min_qty?: number
          max_qty?: number | null
          price_per_unit?: number
          label?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [{ foreignKeyName: "service_pricing_rules_service_type_id_fkey"; columns: ["service_type_id"]; referencedRelation: "service_types"; referencedColumns: ["id"] }]
      }
      company_settings: {
        Row: {
          id: string
          company_name: string
          email: string | null
          phone: string | null
          address: string | null
          website: string | null
          logo_url: string | null
          invoice_due_days: number
          invoice_payment_notes: string | null
          invoice_default_notes: string | null
          invite_email_subject: string
          invite_email_body: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          company_name?: string
          email?: string | null
          phone?: string | null
          address?: string | null
          website?: string | null
          logo_url?: string | null
          invoice_due_days?: number
          invoice_payment_notes?: string | null
          invoice_default_notes?: string | null
          invite_email_subject?: string
          invite_email_body?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          company_name?: string
          email?: string | null
          phone?: string | null
          address?: string | null
          website?: string | null
          logo_url?: string | null
          invoice_due_days?: number
          invoice_payment_notes?: string | null
          invoice_default_notes?: string | null
          invite_email_subject?: string
          invite_email_body?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      client_id: {
        Args: Record<string, never>
        Returns: string
      }
    }
    Enums: {
      client_status:   "pending" | "active" | "inactive"
      login_status:    "no_login" | "invited" | "active"
      product_status:  "active" | "archived"
      shipment_status: "in_transit" | "arrived" | "received" | "partially_received" | "need_attention"
      service_status:  "new" | "in_progress" | "completed" | "need_attention" | "invoiced" | "cancelled"
      invoice_status:  "unpaid" | "paid" | "overdue" | "void"
      file_category:   "agreements" | "labels" | "shipment_docs" | "product_docs" | "invoices" | "other"
      entity_type:     "client" | "product" | "shipment" | "service_request" | "invoice" | "file"
    }
    CompositeTypes: Record<string, never>
  }
}

// ============================================================
// CONVENIENCE TYPE ALIASES
// ============================================================

/** Full row type for any table */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]

/** Insert payload for any table */
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]

/** Update payload for any table */
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]

/** Enum value type */
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T]

// ── Row types ────────────────────────────────────────────────
export type DbClient             = Tables<"clients">
export type DbProduct            = Tables<"products">
export type DbInventory          = Tables<"inventory">
export type DbShipment           = Tables<"incoming_shipments">
export type DbShipmentItem       = Tables<"incoming_shipment_items">
export type DbShipmentTracking   = Tables<"shipment_trackings">
export type DbServiceRequest        = Tables<"service_requests">
export type DbServiceRequestItem    = Tables<"service_request_items">
export type DbServiceRequestService = Tables<"service_request_services">
export type DbInvoice            = Tables<"invoices">
export type DbInvoiceItem        = Tables<"invoice_items">
export type DbFile               = Tables<"files">
export type DbActivityLog        = Tables<"activity_log">
export type DbCarrier            = Tables<"carriers">
export type DbServiceType        = Tables<"service_types">
export type DbCompanySettings    = Tables<"company_settings">
export type DbServicePricingRule = Tables<"service_pricing_rules">

// ── Enum value types ─────────────────────────────────────────
export type DbClientStatus   = Enums<"client_status">
export type DbLoginStatus    = Enums<"login_status">
export type DbProductStatus  = Enums<"product_status">
export type DbShipmentStatus = Enums<"shipment_status">
export type DbServiceStatus  = Enums<"service_status">
export type DbInvoiceStatus  = Enums<"invoice_status">
export type DbFileCategory   = Enums<"file_category">
export type DbEntityType     = Enums<"entity_type">

// ── Joined/computed shapes used in UI queries ────────────────

/** Shipment with all items and tracking rows pre-joined */
export type DbShipmentFull = DbShipment & {
  items:    DbShipmentItem[]
  tracking: DbShipmentTracking[]
}

/** Service request with all items pre-joined */
export type DbServiceRequestFull = DbServiceRequest & {
  items: DbServiceRequestItem[]
}

/** Invoice with all line items pre-joined */
export type DbInvoiceFull = DbInvoice & {
  items: DbInvoiceItem[]
}

/** Product with its inventory row pre-joined */
export type DbProductWithInventory = DbProduct & {
  inventory: DbInventory | null
}
