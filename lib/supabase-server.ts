// ============================================================
// Safir WMS – Server-Side Supabase Client
//
// Use this module ONLY in:
//   - Next.js Server Components (async)
//   - Route Handlers (app/api/*)
//   - Server Actions ("use server")
//
// Never import this in client components — it uses next/headers
// which is a server-only API.
// ============================================================

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "./database.types"
import { isSupabaseConfigured } from "./supabase"
import { shapeUser, roleFromUser, clientIdFromUser } from "./auth"
import type { AuthUser, AppRole } from "./auth"
import type { User } from "@supabase/supabase-js"

// ── SSR client (reads session from request cookies) ───────────
// Use for Server Components that need to respect the user's
// session and RLS. The anon key is used; RLS does the filtering.

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Server Components cannot mutate response cookies directly.
          // Token refreshes are handled by the proxy.ts on each request.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Intentionally swallow — expected in read-only Server Component context.
          }
        },
      },
    }
  )
}

// ── Server-side auth helpers ──────────────────────────────────
// These validate the JWT server-side using getUser(), which
// contacts the Supabase Auth server on every call. This is
// more secure than getSession() (which only reads the cookie).

/**
 * Returns the authenticated User, or null in mock/unauthenticated mode.
 */
export async function getServerUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null
    return user
  } catch {
    return null
  }
}

/**
 * Returns a shaped AuthUser (display name, initials, role, clientId),
 * or null in mock/unauthenticated mode.
 */
export async function getServerAuthUser(): Promise<AuthUser | null> {
  const user = await getServerUser()
  if (!user) return null
  return shapeUser(user)
}

/**
 * Returns "admin" | "client" based on app_metadata.role,
 * or null when not authenticated / Supabase not configured.
 */
export async function getServerRole(): Promise<AppRole | null> {
  const user = await getServerUser()
  if (!user) return null
  return roleFromUser(user)
}

/**
 * Returns the client_id UUID from app_metadata (for client users),
 * or null for admins and unauthenticated users.
 */
export async function getServerClientId(): Promise<string | null> {
  const user = await getServerUser()
  if (!user) return null
  return clientIdFromUser(user)
}
