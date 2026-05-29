// ============================================================
// Safir WMS – Auth Helpers
//
// These functions read identity and role from the Supabase JWT.
// They are safe to call from client components (browser only).
//
// Role model:
//   admin  → app_metadata.role = "admin"
//            Full access to all clients and records.
//
//   client → app_metadata.role = "client"
//            app_metadata.client_id = "<uuid>"
//            Read/write own records only (enforced by RLS).
//
// Setting metadata (server-side admin only, never from the browser):
//   await supabase.auth.admin.updateUserById(userId, {
//     app_metadata: { role: "admin" }
//   })
//   await supabase.auth.admin.updateUserById(userId, {
//     app_metadata: { role: "client", client_id: "<uuid>" }
//   })
// ============================================================

import { createBrowserClient, isSupabaseConfigured } from "./supabase"
import type { User } from "@supabase/supabase-js"

export type AppRole = "admin" | "client"

export interface AuthUser {
  id: string
  email: string
  role: AppRole
  clientId: string | null
  displayName: string
  initials: string
}

// ── Core helpers ──────────────────────────────────────────────

/**
 * Returns the currently authenticated Supabase user, or null.
 * Uses getUser() (server-validates the JWT) rather than getSession()
 * so it cannot be spoofed by a manipulated cookie.
 */
export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const { data: { user }, error } = await createBrowserClient().auth.getUser()
    if (error) return null
    return user
  } catch {
    return null
  }
}

/**
 * Returns "admin" or "client" based on app_metadata.role in the JWT.
 * Falls back to "client" if the claim is missing.
 * Returns null when the user is not authenticated.
 */
export async function getCurrentRole(): Promise<AppRole | null> {
  const user = await getCurrentUser()
  if (!user) return null
  return roleFromUser(user)
}

/**
 * Returns the client_id claim from the JWT (client users only).
 * Returns null for admins and unauthenticated callers.
 */
export async function getCurrentClientId(): Promise<string | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const role = roleFromUser(user)
  if (role !== "client") return null
  return user.app_metadata?.client_id ?? null
}

/**
 * Returns a shaped AuthUser object with all display fields pre-computed.
 * Returns null when the user is not authenticated.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const user = await getCurrentUser()
  if (!user) return null
  return shapeUser(user)
}

// ── Synchronous helpers (use with session from onAuthStateChange) ──

/** Extract role from a User object without an async call. */
export function roleFromUser(user: User): AppRole {
  return user.app_metadata?.role === "admin" ? "admin" : "client"
}

/** Extract client_id from a User object without an async call. */
export function clientIdFromUser(user: User): string | null {
  if (roleFromUser(user) !== "client") return null
  return user.app_metadata?.client_id ?? null
}

/** Build an AuthUser display object from a raw Supabase User. */
export function shapeUser(user: User): AuthUser {
  const email = user.email ?? ""
  const role  = roleFromUser(user)

  // Prefer user_metadata.full_name (set on sign-up), fall back to email prefix
  const fullName: string =
    (user.user_metadata?.full_name as string | undefined) ??
    email.split("@")[0] ??
    "User"

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")

  return {
    id: user.id,
    email,
    role,
    clientId: clientIdFromUser(user),
    displayName: fullName,
    initials: initials || "?",
  }
}

// ── Sign out ──────────────────────────────────────────────────

/**
 * Signs the current user out and clears the session cookie.
 * The middleware will redirect to /login on the next navigation.
 */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return
  await createBrowserClient().auth.signOut()
}
