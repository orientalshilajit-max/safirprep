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

export type PricingRule = {
  id: string
  serviceTypeId: string
  minQty: number
  maxQty: number | null
  pricePerUnit: number
  label: string | null
  sortOrder: number
}

export type SettingsServiceType = {
  id: string
  name: string
  price: number
  visibleToCustomers: boolean
  isActive: boolean
  sortOrder: number
  pricingRules: PricingRule[]
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

  const [csRes, carRes, stRes, prRes] = await Promise.all([
    supabase.from("company_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("carriers").select("*").order("sort_order").order("name"),
    supabase.from("service_types").select("*").order("sort_order").order("name"),
    supabase.from("service_pricing_rules").select("*").order("sort_order").order("min_qty"),
  ])

  if (csRes.error) throw new Error(csRes.error.message)
  if (carRes.error) console.error("[settings] carriers error:", carRes.error)
  if (stRes.error)  console.error("[settings] service_types error:", stRes.error)
  if (prRes.error)  console.error("[settings] service_pricing_rules error:", prRes.error)

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

  const allRules: PricingRule[] = (prRes.data ?? [])
    .filter((r) => {
      const valid = r.id && r.service_type_id && r.min_qty != null && r.price_per_unit != null
      if (!valid) console.error("[settings] skipping invalid pricing rule row:", r)
      return valid
    })
    .map((r) => ({
      id:           r.id,
      serviceTypeId: r.service_type_id,
      minQty:        r.min_qty,
      maxQty:        r.max_qty ?? null,
      pricePerUnit:  Number(r.price_per_unit),
      label:         r.label ?? null,
      sortOrder:     r.sort_order ?? 0,
    }))

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
      id:                 s.id,
      name:               s.name,
      price:              s.price ?? 0,
      visibleToCustomers: s.visible_to_customers ?? true,
      isActive:           s.is_active,
      sortOrder:          s.sort_order,
      pricingRules:       allRules.filter((r) => r.serviceTypeId === s.id),
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

// ── Save main logo URL ────────────────────────────────────────

export async function saveLogoUrl(url: string): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()

  const { data: existing } = await admin
    .from("company_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await admin
      .from("company_settings")
      .update({ logo_url: url })
      .eq("id", existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin
      .from("company_settings")
      .insert({ logo_url: url })
    if (error) throw new Error(error.message)
  }

  revalidatePath("/settings")
}

// ── Save invoice logo URL (dark-on-white logo for invoice PDFs) ─

export async function saveInvoiceLogoUrl(url: string): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()

  const { data: existing } = await admin
    .from("company_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // invoice_logo_url added in migration 20260602000002 — mutate to bypass RejectExcessProperties
  const basePayload = {} as Record<string, unknown>
  basePayload.invoice_logo_url = url || null

  if (existing?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from("company_settings") as any)
      .update(basePayload)
      .eq("id", existing.id)
    if (error) throw new Error((error as { message: string }).message)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from("company_settings") as any)
      .insert(basePayload)
    if (error) throw new Error((error as { message: string }).message)
  }

  revalidatePath("/settings")
}

// ── Public company branding (no auth — for sidebar + login) ───

export type CompanyBranding = {
  companyName:         string
  logoUrl:             string | null
  invoiceLogoUrl:      string | null
  address:             string | null
  email:               string | null
  phone:               string | null
  website:             string | null
  paymentInstructions: string | null
}

export async function fetchPublicCompanyBranding(): Promise<CompanyBranding> {
  try {
    const admin = createServerAdminClient()
    // Use select("*") and cast to Record to handle columns added after type generation
    const { data: rawData } = await admin
      .from("company_settings")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const data = rawData as Record<string, unknown> | null

    return {
      companyName:    String(data?.company_name      ?? "Safir Logistics"),
      logoUrl:        (data?.logo_url          as string | null) ?? null,
      invoiceLogoUrl: (data?.invoice_logo_url  as string | null) ?? null,
      address:        (data?.address           as string | null) ?? null,
      email:          (data?.email             as string | null) ?? null,
      phone:          (data?.phone             as string | null) ?? null,
      website:             (data?.website              as string | null) ?? null,
      paymentInstructions: (data?.invoice_payment_notes as string | null) ?? null,
    }
  } catch {
    return { companyName: "Safir Logistics", logoUrl: null, invoiceLogoUrl: null, address: null, email: null, phone: null, website: null, paymentInstructions: null }
  }
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
}, pricingRules: PricingRule[] = []): SettingsServiceType {
  return {
    id:                 row.id,
    name:               row.name,
    price:              row.price ?? 0,
    visibleToCustomers: row.visible_to_customers ?? true,
    isActive:           row.is_active,
    sortOrder:          row.sort_order,
    pricingRules,
  }
}

export async function checkServiceTypeUsage(id: string): Promise<{ requests: number; invoices: number }> {
  await requireAdmin()
  const admin = createServerAdminClient()
  const [{ count: reqCount }, { count: invCount }] = await Promise.all([
    admin.from("service_request_services")
      .select("id", { count: "exact", head: true })
      .eq("service_type_id", id),
    (admin.from("invoice_items") as unknown as ReturnType<typeof admin.from>)
      .select("id", { count: "exact", head: true })
      .eq("service_type_id", id),
  ])
  return { requests: reqCount ?? 0, invoices: invCount ?? 0 }
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

// ── Admin user management ─────────────────────────────────────

export type AdminUser = {
  id: string
  email: string
  name: string
  createdAt: string
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  await requireAdmin()
  const admin = createServerAdminClient()

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)

  return (data.users ?? [])
    .filter((u) => u.app_metadata?.role === "admin")
    .map((u) => ({
      id:        u.id,
      email:     u.email ?? "",
      name:      u.user_metadata?.full_name ?? u.user_metadata?.name ?? "",
      createdAt: u.created_at ?? "",
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function createAdminUser(data: {
  email:       string
  name:        string
  password:    string
  sendInvite:  boolean
}): Promise<void> {
  await requireAdmin()
  const admin  = createServerAdminClient()
  const email  = data.email.trim().toLowerCase()
  const name   = data.name.trim()

  if (!email)                                  throw new Error("Email is required.")
  if (!data.sendInvite && !data.password)      throw new Error("Password is required.")
  if (!data.sendInvite && data.password.length < 8)
    throw new Error("Password must be at least 8 characters.")

  if (data.sendInvite) {
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name },
    })
    if (error) throw new Error(error.message)
    if (invited?.user?.id) {
      await admin.auth.admin.updateUserById(invited.user.id, {
        app_metadata:  { role: "admin" },
        user_metadata: { full_name: name },
      })
    }
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password:      data.password,
      user_metadata: { full_name: name },
      app_metadata:  { role: "admin" },
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
  }
}

export async function updateAdminDisplayName(userId: string, name: string): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { full_name: name.trim() },
  })
  if (error) throw new Error(error.message)
}

export async function removeAdminUser(userId: string): Promise<void> {
  const me = await requireAdmin()
  if (me.id === userId) throw new Error("You cannot remove yourself.")

  const admin = createServerAdminClient()

  // Guard: must leave at least one admin
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const remaining = (data?.users ?? []).filter(
    (u) => u.app_metadata?.role === "admin" && u.id !== userId
  )
  if (remaining.length === 0) throw new Error("Cannot remove the last admin user.")

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role: null },
  })
  if (error) throw new Error(error.message)
}

// ── Pricing rules ─────────────────────────────────────────────

function mapRuleRow(r: {
  id: string; service_type_id: string; min_qty: number; max_qty: number | null
  price_per_unit: number; label: string | null; sort_order: number
}): PricingRule {
  return {
    id:            r.id,
    serviceTypeId: r.service_type_id,
    minQty:        r.min_qty,
    maxQty:        r.max_qty,
    pricePerUnit:  r.price_per_unit,
    label:         r.label,
    sortOrder:     r.sort_order,
  }
}

export async function upsertPricingRule(data: {
  id?: string
  serviceTypeId: string
  minQty: number
  maxQty: number | null
  pricePerUnit: number
  label: string | null
  sortOrder: number
}): Promise<PricingRule> {
  await requireAdmin()
  const admin = createServerAdminClient()
  const payload = {
    service_type_id: data.serviceTypeId,
    min_qty:         data.minQty,
    max_qty:         data.maxQty,
    price_per_unit:  data.pricePerUnit,
    label:           data.label || null,
    sort_order:      data.sortOrder,
  }
  if (data.id) {
    const { data: row, error } = await admin
      .from("service_pricing_rules").update(payload).eq("id", data.id).select().single()
    if (error) throw new Error(error.message)
    return mapRuleRow(row)
  }
  const { data: row, error } = await admin
    .from("service_pricing_rules").insert(payload).select().single()
  if (error) throw new Error(error.message)
  return mapRuleRow(row)
}

export async function deletePricingRule(id: string): Promise<void> {
  await requireAdmin()
  const admin = createServerAdminClient()
  const { error } = await admin.from("service_pricing_rules").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

export async function fetchServiceTypePricingRules(serviceTypeId: string): Promise<PricingRule[]> {
  await requireAdmin()
  const admin = createServerAdminClient()
  const { data, error } = await admin
    .from("service_pricing_rules")
    .select("id, service_type_id, min_qty, max_qty, price_per_unit, label, sort_order")
    .eq("service_type_id", serviceTypeId)
    .order("min_qty", { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRuleRow)
}

// ── lookupPricingRule ─────────────────────────────────────────
// Any authenticated user can call this to calculate estimated price.

export async function lookupPricingRule(
  serviceTypeName: string,
  quantity: number
): Promise<{ pricePerUnit: number; label: string | null } | null> {
  if (!serviceTypeName || quantity <= 0) return null
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: st } = await supabase
      .from("service_types").select("id").eq("name", serviceTypeName).maybeSingle()
    if (!st) return null

    const { data: rules } = await supabase
      .from("service_pricing_rules")
      .select("price_per_unit, label, min_qty, max_qty")
      .eq("service_type_id", st.id)
      .lte("min_qty", quantity)
      .order("min_qty", { ascending: false })

    if (!rules || rules.length === 0) return null
    const match = rules.find((r) => r.max_qty === null || r.max_qty >= quantity)
    if (!match) return null
    return { pricePerUnit: match.price_per_unit, label: match.label }
  } catch {
    return null
  }
}
