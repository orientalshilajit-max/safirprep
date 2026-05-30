// ============================================================
// Safir WMS – Typed Supabase Client
//
// SETUP:
//   1. Copy .env.local.example → .env.local
//   2. Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
//      from your Supabase project dashboard (Settings → API).
//   3. For server-side / admin operations add SUPABASE_SERVICE_ROLE_KEY
//      (never expose this to the browser).
//
// Once Supabase Auth is live, regenerate database.types.ts with:
//   npx supabase gen types typescript --project-id <your-project-id> \
//     --schema public > lib/database.types.ts
// ============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr"
import type { Database } from "./database.types"

// ── Configuration check ───────────────────────────────────────
// NEXT_PUBLIC_* vars are inlined at build time by Next.js.
// Reading them here is safe in both server and client contexts.

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

// ── Browser / client-side client ─────────────────────────────
// Uses @supabase/ssr's createBrowserClient so the session is stored
// in cookies rather than localStorage.  This makes the session
// visible to proxy.ts (which reads request cookies server-side),
// breaking the redirect loop that occurred when localStorage was used.

let _browserClient: SupabaseClient<Database> | null = null

export function createBrowserClient(): SupabaseClient<Database> {
  if (_browserClient) return _browserClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      "[Supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.\n" +
      "Copy .env.local.example → .env.local and fill in your project credentials.\n" +
      "In mock/dev mode, check isSupabaseConfigured() before calling this function."
    )
  }

  _browserClient = createSSRBrowserClient<Database>(url, key)

  return _browserClient
}

// ── Server-side admin client ──────────────────────────────────
// Uses the service role key — bypasses RLS entirely.
// ONLY use in Next.js Route Handlers or Server Actions.
// Never import this in client components or pages.

export function createServerAdminClient(): SupabaseClient<Database> {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      "[Supabase] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.\n" +
      "Required for server-side admin operations."
    )
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

// ============================================================
// TYPE EXPORTS (re-exported for consumer convenience)
// ============================================================
export type { Database } from "./database.types"
export type {
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  DbClient,
  DbProduct,
  DbInventory,
  DbShipment,
  DbShipmentItem,
  DbShipmentTracking,
  DbServiceRequest,
  DbServiceRequestItem,
  DbInvoice,
  DbInvoiceItem,
  DbFile,
  DbActivityLog,
  DbCarrier,
  DbServiceType,
  DbCompanySettings,
  DbShipmentFull,
  DbServiceRequestFull,
  DbInvoiceFull,
  DbProductWithInventory,
} from "./database.types"
