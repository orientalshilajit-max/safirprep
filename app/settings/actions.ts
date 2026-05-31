"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createServerAdminClient }     from "@/lib/supabase"

// ── Constants ─────────────────────────────────────────────────

const LOGO_BUCKET        = "company-assets"
const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"]
const MAX_LOGO_BYTES     = 5 * 1024 * 1024 // 5 MB

// ── Auth guard ────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "admin") throw new Error("Admin access required.")
  return user
}

// ── Exported types ────────────────────────────────────────────

export type SettingsCarrier = {
  id: string
  name: string
  isActive: boolean
  sortOrder: number
}

export type SettingsServiceType = {
  id: string
  name: string
  price: number
  visibleToCustomers: boolean
  isActive: boolean
  sortOrder: number
}

export type SettingsCompany = {
  companyName: string
  email: string
  phone: string
  address: string
  website: string
  logoUrl: string | null
}

export type SettingsInvoice = {
  dueDays: number
  paymentInstructions: string
  invoiceNotes: string
}

export type SettingsUsers = {
  inviteSubject: string
  inviteMessage: string
}

export type AllSettings = {
  company: SettingsCompany
  invoice: SettingsInvoice
  users: SettingsUsers
  carriers: SettingsCarrier[]
  serviceTypes: SettingsServiceType[]
}

// ── fetchSettings ─────────────────────────────────────────────

export async function fetchSettings(): Promise<AllSettings> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "admin") throw new Error("Admin access required.")

  console.log("[settings] loading company_settings…")
  const [csRes, carRes, stRes] = await Promise.all([
    // maybeSingle: returns null instead of throwing when 0 rows exist
    supabase.from("company_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("carriers").select("*").order("sort_order").order("name"),
    supabase.from("service_types").select("*").order("sort_order").order("name"),
  ])

  if (csRes.error) {
    console.error("[settings] company_settings error:", csRes.error.message)
    throw new Error(csRes.error.message)
  }

  console.log("[settings] loading carriers…", carRes.error?.message ?? "ok")
  console.log("[settings] loading service_types…", stRes.error?.message ?? "ok")

  // If no row exists yet, seed one and use defaults
  let cs = csRes.data
  if (!cs) {
    console.log("[settings] no company_settings row — creating default row")
    const admin = createServerAdminClient()
    const { data: inserted, error: insErr } = await admin
      .from("company_settings")
      .insert({})
      .select()
      .single()
    if (insErr) {
      console.error("[settings] failed to create default row:", insErr.message)
    } else {
      cs = inserted
    }
  }

  return {
    company: {
      companyName: cs?.company_name ?? "Safir Logistics",
      email:       cs?.email       ?? "",
      phone:       cs?.phone       ?? "",
      address:     cs?.address     ?? "",
      website:     cs?.website     ?? "",
      logoUrl:     cs?.logo_url    ?? null,
    },
    invoice: {
      dueDays:             cs?.invoice_due_days      ?? 14,
      paymentInstructions: cs?.invoice_payment_notes ?? "",
      invoiceNotes:        cs?.invoice_default_notes ?? "",
    },
    users: {
      inviteSubject: cs?.invite_email_subject ?? "You're invited to the Safir client portal",
      inviteMessage: cs?.invite_email_body    ?? "",
    },
    carriers: (carRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      isActive: c.is_active,
      sortOrder: c.sort_order,
    })),
    serviceTypes: (stRes.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price ?? 0,
      visibleToCustomers: s.visible_to_customers ?? true,
      isActive: s.is_active,
      sortOrder: s.sort_order,
    })),
  }
}

// ── Company info ──────────────────────────────────────────────

export async function saveCompanyInfo(data: SettingsCompany): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()

  console.log("[settings] saving company_settings…")

  const payload = {
    company_name: data.companyName.trim() || "Safir Logistics",
    email:        data.email.trim()   || null,
    phone:        data.phone.trim()   || null,
    address:      data.address.trim() || null,
    website:      data.website.trim() || null,
    logo_url:     data.logoUrl        || null,
  }

  // Find the existing row (if any)
  const { data: existing } = await admin
    .from("company_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await admin
      .from("company_settings")
      .update(payload)
      .eq("id", existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin
      .from("company_settings")
      .insert(payload)
    if (error) throw new Error(error.message)
  }

  revalidatePath("/settings")
}

// ── Logo upload ───────────────────────────────────────────────

export async function uploadLogo(formData: FormData): Promise<string> {
  await requireAdmin()
  const admin = createServerAdminClient()

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) throw new Error("No file provided.")
  if (!ALLOWED_LOGO_TYPES.includes(file.type))
    throw new Error("Only JPG, PNG, WebP, and SVG files are allowed.")
  if (file.size > MAX_LOGO_BYTES)
    throw new Error("Logo must be under 5 MB.")

  const ext  = file.name.split(".").pop()?.toLowerCase() ?? "png"
  const path = `logo/${crypto.randomUUID()}.${ext}`

  const { error: upErr } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })

  if (upErr) {
    if (upErr.message.toLowerCase().includes("bucket") ||
        upErr.message.toLowerCase().includes("not found")) {
      throw new Error(
        `Storage bucket '${LOGO_BUCKET}' not found. Run the migration 20260531000001_settings_extras.sql to create it.`
      )
    }
    throw new Error(upErr.message)
  }

  const { data: { publicUrl } } = admin.storage
    .from(LOGO_BUCKET)
    .getPublicUrl(path)

  return publicUrl
}

// ── Carriers ──────────────────────────────────────────────────

export async function upsertCarrier(data: {
  id?: string
  name: string
  sortOrder: number
}): Promise<SettingsCarrier> {
  await requireAdmin()
  const admin = createServerAdminClient()
  const name  = data.name.trim()
  if (!name) throw new Error("Carrier name cannot be empty.")

  if (data.id) {
    const { data: row, error } = await admin
      .from("carriers")
      .update({ name, sort_order: data.sortOrder })
      .eq("id", data.id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return { id: row.id, name: row.name, isActive: row.is_active, sortOrder: row.sort_order }
  }

  const { data: row, error } = await admin
    .from("carriers")
    .insert({ name, sort_order: data.sortOrder, is_active: true })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return { id: row.id, name: row.name, isActive: row.is_active, sortOrder: row.sort_order }
}

export async function checkCarrierUsage(id: string): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "admin") return 0

  const { data: carrier } = await supabase
    .from("carriers").select("name").eq("id", id).single()
  if (!carrier) return 0

  const { count } = await supabase
    .from("shipment_trackings")
    .select("id", { count: "exact", head: true })
    .eq("carrier", carrier.name)
  return count ?? 0
}

export async function deleteCarrier(id: string): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()
  const { error } = await admin.from("carriers").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/settings")
}

export async function reorderCarriers(
  updates: { id: string; sortOrder: number }[]
): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()
  await Promise.all(
    updates.map(({ id, sortOrder }) =>
      admin.from("carriers").update({ sort_order: sortOrder }).eq("id", id)
    )
  )
}

// ── Service types ─────────────────────────────────────────────

export async function upsertServiceType(data: {
  id?: string
  name: string
  price: number
  visibleToCustomers: boolean
  sortOrder: number
}): Promise<SettingsServiceType> {
  await requireAdmin()
  const admin = createServerAdminClient()
  const name  = data.name.trim()
  if (!name) throw new Error("Service name cannot be empty.")

  const payload = {
    name,
    price:                data.price,
    visible_to_customers: data.visibleToCustomers,
    sort_order:           data.sortOrder,
  }

  if (data.id) {
    const { data: row, error } = await admin
      .from("service_types")
      .update(payload)
      .eq("id", data.id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return mapServiceRow(row)
  }

  const { data: row, error } = await admin
    .from("service_types")
    .insert({ ...payload, is_active: true })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return mapServiceRow(row)
}

function mapServiceRow(row: {
  id: string; name: string; price: number; visible_to_customers: boolean
  is_active: boolean; sort_order: number
}): SettingsServiceType {
  return {
    id:                 row.id,
    name:               row.name,
    price:              row.price ?? 0,
    visibleToCustomers: row.visible_to_customers ?? true,
    isActive:           row.is_active,
    sortOrder:          row.sort_order,
  }
}

export async function checkServiceTypeUsage(id: string): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "admin") return 0

  const { data: st } = await supabase
    .from("service_types").select("name").eq("id", id).single()
  if (!st) return 0

  const { count } = await supabase
    .from("service_requests")
    .select("id", { count: "exact", head: true })
    .eq("service_type", st.name)
  return count ?? 0
}

export async function deleteServiceType(id: string): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()
  const { error } = await admin.from("service_types").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/settings")
}

export async function reorderServiceTypes(
  updates: { id: string; sortOrder: number }[]
): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()
  await Promise.all(
    updates.map(({ id, sortOrder }) =>
      admin.from("service_types").update({ sort_order: sortOrder }).eq("id", id)
    )
  )
}

// ── Invoice settings ──────────────────────────────────────────

export async function saveInvoiceSettings(data: SettingsInvoice): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()

  const payload = {
    invoice_due_days:      Math.max(1, data.dueDays),
    invoice_payment_notes: data.paymentInstructions.trim() || null,
    invoice_default_notes: data.invoiceNotes.trim()        || null,
  }

  const { data: existing } = await admin
    .from("company_settings").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle()

  if (existing?.id) {
    const { error } = await admin.from("company_settings").update(payload).eq("id", existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin.from("company_settings").insert(payload)
    if (error) throw new Error(error.message)
  }

  revalidatePath("/settings")
}

// ── User / invite settings ────────────────────────────────────

export async function saveUserSettings(data: SettingsUsers): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()

  const payload = {
    invite_email_subject: data.inviteSubject.trim() || "You're invited to the Safir client portal",
    invite_email_body:    data.inviteMessage.trim() || null,
  }

  const { data: existing } = await admin
    .from("company_settings").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle()

  if (existing?.id) {
    const { error } = await admin.from("company_settings").update(payload).eq("id", existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin.from("company_settings").insert(payload)
    if (error) throw new Error(error.message)
  }

  revalidatePath("/settings")
}
