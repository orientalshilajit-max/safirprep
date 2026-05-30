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

// Log env var presence once per process start (not per request).
// Values are never logged — only whether they are set.
let _envLogged = false

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 1. Skip auth when Supabase is not configured (dev/mock mode) ──
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!_envLogged) {
    _envLogged = true
    console.log("[Proxy] env check — NEXT_PUBLIC_SUPABASE_URL:",  supabaseUrl  ? "SET" : "MISSING")
    console.log("[Proxy] env check — NEXT_PUBLIC_SUPABASE_ANON_KEY:", supabaseAnon ? "SET" : "MISSING")
    console.log("[Proxy] env check — SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING")
  }

  if (!supabaseUrl || !supabaseAnon) {
    console.log("[Proxy] Supabase not configured — passthrough (mock mode)")
    return NextResponse.next()
  }

  // ── 2. Create a mutable response to carry refreshed cookies ───────
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Detect HTTPS so cookie refreshes written by setAll carry Secure flag.
  // @supabase/ssr DEFAULT_COOKIE_OPTIONS omits `secure`; we supply it here
  // to ensure token-refresh Set-Cookie headers are honoured by browsers on
  // production HTTPS (e.g. Vercel).
  const isHttps = request.nextUrl.protocol === "https:"

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
        // Mutate in-memory so the current request sees refreshed tokens.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        // Write to the response so the browser stores the new tokens.
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            path:     "/",
            sameSite: "lax",
            httpOnly: false,   // browser client (document.cookie) must be able to read these
            ...options,
            secure: isHttps,   // always match the connection's protocol
          })
        )
      },
    },
  })

  // ── 4. Validate the session ────────────────────────────────────────
  // getUser() re-validates with the Supabase Auth server on each call,
  // so a tampered or expired cookie cannot bypass protection.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Log cookie names (not values) and auth result.
  const cookieNames = request.cookies.getAll().map((c) => c.name)
  console.log(`[Proxy] ${pathname} — cookies: [${cookieNames.join(", ")}]`)
  console.log(`[Proxy] ${pathname} — user: ${user ? "yes" : "no"}`)

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  // ── 5. Route decisions ─────────────────────────────────────────────

  // No session + protected route → redirect to /login
  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url)
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirect", pathname)
    }
    console.log(`[Proxy] no session → redirect ${loginUrl.pathname}${loginUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated + /login → redirect to /dashboard
  if (user && isPublicPath) {
    console.log(`[Proxy] authenticated on /login → redirect /dashboard`)
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
