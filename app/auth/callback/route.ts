import { createServerClient } from "@supabase/ssr"
import { NextResponse }       from "next/server"
import { cookies }            from "next/headers"
import type { NextRequest }   from "next/server"

// Handles the Supabase PKCE auth callback.
// Supabase sends: GET /auth/callback?code=<PKCE_CODE>&next=/set-password
// We exchange the code for a session, write the session cookies, then
// redirect the browser to `next` (defaulting to /dashboard).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (!code) {
    // No code — likely an implicit-flow invite where tokens are in the URL
    // hash (which servers can't read).  Redirect to /set-password and let
    // the browser-side Supabase client detect the session from the hash.
    return NextResponse.redirect(`${origin}/set-password`)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error("[auth/callback] code exchange failed:", error.message)
    return NextResponse.redirect(
      `${origin}/set-password?error=invite_invalid`
    )
  }

  // Successful exchange — redirect to the intended destination.
  // Use a 303 so browsers always GET the next URL (not replay the POST).
  return NextResponse.redirect(`${origin}${next}`, { status: 303 })
}
