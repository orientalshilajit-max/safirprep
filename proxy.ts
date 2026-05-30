// ============================================================
// Safir WMS – Next.js 16 Proxy (replaces middleware.ts)
//
// Responsibilities:
//   1. Refresh the Supabase session cookie on every request.
//   2. Redirect unauthenticated users to /login.
//   3. Redirect authenticated users away from /login → /dashboard.
//
// Mock/Dev mode:
//   When NEXT_PUBLIC_SUPABASE_URL is not set, this proxy is a
//   no-op — all routes are accessible without authentication.
//   Set the env vars in .env.local to enable real auth protection.
// ============================================================

import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Routes that are always public (no session required)
const PUBLIC_PATHS = ["/login"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 1. Skip auth when Supabase is not configured (dev/mock mode) ──
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.next()
  }

  // ── 2. Create a mutable response to carry refreshed cookies ───────
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // ── 3. Create the SSR Supabase client ──────────────────────────────
  // Reads session cookies from the incoming request and writes any
  // refreshed tokens back onto the response — keeping the JWT alive
  // transparently without an extra round-trip from the client.
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // ── 4. Validate the session (server-validated JWT check) ───────────
  // getUser() re-validates with the Supabase Auth server on each call,
  // so a tampered or expired cookie cannot bypass protection.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  console.log(`[Proxy] ${pathname} — session: ${user ? "yes (" + user.id + ")" : "no"}`)

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  // ── 5. Route decisions ─────────────────────────────────────────────

  // No session + protected route → redirect to /login
  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url)
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", pathname)
    }
    console.log(`[Proxy] no session → redirecting to ${loginUrl.pathname}${loginUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated + /login → redirect to /dashboard
  if (user && isPublicPath) {
    console.log(`[Proxy] authenticated on public path → redirecting to /dashboard`)
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static  (static build assets)
     * - _next/image   (image optimizer)
     * - favicon.ico
     * - Common image extensions
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
