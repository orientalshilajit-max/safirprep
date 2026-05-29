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
import type { Database } from "./database.types"

// ── Environment variable validation ──────────────────────────

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Fail loudly at runtime (not build time) if vars are missing.
// During mock-only development these vars are optional — the client
// is defined but never called, so no runtime error is thrown.
function getCheckedUrl(): string {
  if (!supabaseUrl) {
    throw new Error(
      "[Supabase] NEXT_PUBLIC_SUPABASE_URL is not set.\n" +
      "Copy .env.local.example → .env.local and fill in your project URL."
    )
  }
  return supabaseUrl
}

function getCheckedAnon(): string {
  if (!supabaseAnon) {
    throw new Error(
      "[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.\n" +
      "Copy .env.local.example → .env.local and fill in your anon key."
    )
  }
  return supabaseAnon
}

// ── Browser / client-side client ─────────────────────────────
// Singleton — safe to import anywhere in client components.
// Uses the anon key; RLS policies enforce all access control.

let _browserClient: SupabaseClient<Database> | null = null

export function createBrowserClient(): SupabaseClient<Database> {
  if (!_browserClient) {
    _browserClient = createClient<Database>(getCheckedUrl(), getCheckedAnon(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return _browserClient
}

// Convenience alias used throughout the app once Supabase is wired in.
export const supabase = {
  get client() {
    return createBrowserClient()
  },
}

// ── Server-side / admin client ────────────────────────────────
// Uses the service role key — bypasses RLS.
// ONLY use in Next.js Route Handlers or Server Actions, never in
// client components or pages.

export function createServerClient(): SupabaseClient<Database> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error(
      "[Supabase] SUPABASE_SERVICE_ROLE_KEY is not set.\n" +
      "Required for server-side admin operations."
    )
  }
  return createClient<Database>(getCheckedUrl(), serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

// ============================================================
// AUTH HELPERS (stubs — implement once auth is wired in)
// ============================================================

export type AppRole = "admin" | "client"

/**
 * Read the user's role from their JWT app_metadata.
 * Returns null if the user is not authenticated.
 *
 * Usage (once auth is live):
 *   const role = await getRole()
 */
export async function getRole(): Promise<AppRole | null> {
  // TODO: Replace with real session read once Supabase Auth is connected.
  // const { data: { session } } = await createBrowserClient().auth.getSession()
  // if (!session) return null
  // return (session.user.app_metadata?.role as AppRole) ?? "client"
  return null
}

/**
 * Read the client_id from the authenticated user's JWT.
 * Returns null for admins or unauthenticated users.
 *
 * Usage (once auth is live):
 *   const clientId = await getClientId()
 */
export async function getClientId(): Promise<string | null> {
  // TODO: Replace with real session read once Supabase Auth is connected.
  // const { data: { session } } = await createBrowserClient().auth.getSession()
  // if (!session) return null
  // return session.user.app_metadata?.client_id ?? null
  return null
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
