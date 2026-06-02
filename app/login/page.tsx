"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Box, Eye, EyeOff, AlertCircle } from "lucide-react"
import { isSupabaseConfigured, createBrowserClient } from "@/lib/supabase"
import { fetchPublicCompanyBranding } from "@/app/settings/actions"

// useSearchParams() must be inside a Suspense boundary during SSR
function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirect     = searchParams.get("redirect") ?? "/dashboard"

  const [email,        setEmail]        = useState("")
  const [password,     setPassword]     = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [branding, setBranding] = useState<{ companyName: string; logoUrl: string | null }>({
    companyName: "Safir Logistics",
    logoUrl: null,
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    fetchPublicCompanyBranding().then(setBranding).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Guard: Supabase not configured
    if (!isSupabaseConfigured()) {
      setError(
        "Supabase is not configured. Copy .env.local.example → .env.local " +
        "and fill in your project credentials to enable login."
      )
      setLoading(false)
      return
    }

    try {
      const supabase = createBrowserClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError) {
        console.log("[Login] error:", authError.message)
        if (authError.message.toLowerCase().includes("invalid login")) {
          setError("Incorrect email or password.")
        } else if (authError.message.toLowerCase().includes("email not confirmed")) {
          setError("Please confirm your email address before signing in.")
        } else {
          setError(authError.message)
        }
        return
      }

      console.log("[Login] success — session exists:", !!data.session)

      if (!data.session) {
        console.log("[Login] no session returned — aborting navigation")
        setError("Sign-in succeeded but no session was created. Please try again.")
        return
      }

      // Log cookie names (not values) so we can verify the session was stored.
      const cookieNames = document.cookie
        .split(";")
        .map((c) => c.trim().split("=")[0])
        .filter(Boolean)
      console.log("[Login] cookies after sign-in:", cookieNames)

      console.log("[Login] navigating to", redirect)
      router.push(redirect)
      router.refresh()
    } catch {
      setError("Unable to reach the auth service. Check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  const notConfigured = !isSupabaseConfigured()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-[360px]">

        {/* Brand */}
        <div className="flex items-center justify-center gap-3 mb-9">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 overflow-hidden">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.companyName}
                className="size-full object-contain"
              />
            ) : (
              <Box className="size-5 text-white" />
            )}
          </div>
          <div>
            <p className="text-[19px] font-bold text-white leading-tight">{branding.companyName}</p>
            <p className="text-[12px] text-slate-400 leading-tight mt-0.5">
              Portal
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-8 pt-7 pb-6">
            <h1 className="text-[20px] font-bold text-gray-900 leading-tight">
              Sign in
            </h1>
            <p className="text-[13px] text-gray-400 mt-1">
              Access your warehouse dashboard
            </p>
          </div>

          {/* Dev-mode banner */}
          {notConfigured && (
            <div className="mx-6 mb-1 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
              <AlertCircle className="size-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-amber-700">
                  Mock mode — Supabase not configured
                </p>
                <p className="text-[11px] text-amber-600 mt-0.5 leading-relaxed">
                  Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                  <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
                  <code className="font-mono">.env.local</code> to enable real auth.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="px-8 pb-7 space-y-4 mt-2">
            {/* Email */}
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                disabled={notConfigured}
                className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500
                           placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={notConfigured}
                  className="w-full px-3 py-2.5 pr-10 text-[13px] border border-gray-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-500
                             placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                             hover:text-gray-600 transition-colors"
                >
                  {showPassword
                    ? <EyeOff className="size-4" />
                    : <Eye      className="size-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
                <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
                <p className="text-[12px] text-red-600 leading-snug">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || notConfigured}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white
                         text-[13px] font-semibold rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[12px] text-slate-500">
          Contact your administrator to get access.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900">
          <div className="size-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
