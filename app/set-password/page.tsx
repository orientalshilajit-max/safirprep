"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams }     from "next/navigation"
import { Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react"
import { isSupabaseConfigured, createBrowserClient } from "@/lib/supabase"
import { fetchPublicCompanyBranding }    from "@/app/settings/actions"
import { activateClientLogin }           from "@/app/clients/actions"

type State = "checking" | "ready" | "invalid" | "success"

function SetPasswordForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const urlError     = searchParams.get("error")

  // Derive initial state from URL params / config so useEffect never needs
  // to call setState synchronously (avoids react-hooks/set-state-in-effect).
  const [state,           setState]           = useState<State>(() =>
    urlError || !isSupabaseConfigured() ? "invalid" : "checking"
  )
  const [password,        setPassword]        = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword,    setShowPassword]    = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [formError,       setFormError]       = useState<string | null>(null)
  const [branding, setBranding] = useState<{
    companyName: string
    logoUrl: string | null
  }>({ companyName: "Safir Logistics", logoUrl: null })

  useEffect(() => {
    // Initial state already accounts for urlError / config via useState initializer.
    // Skip async work if we're already in a terminal state.
    if (urlError || !isSupabaseConfigured()) return

    fetchPublicCompanyBranding().then(setBranding).catch(() => {})

    const supabase = createBrowserClient()
    let timer: ReturnType<typeof setTimeout>

    // First check for an existing session (PKCE flow — code was already
    // exchanged in /auth/callback and session cookies are set).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setState("ready")
        return
      }

      // No session yet.  For implicit-flow invites, the tokens are in the
      // URL hash and the browser Supabase client will detect them and fire
      // an auth state change event.  Wait up to 4 s before giving up.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, newSession) => {
          if (newSession || event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
            clearTimeout(timer)
            subscription.unsubscribe()
            setState("ready")
          }
        }
      )

      timer = setTimeout(() => {
        subscription.unsubscribe()
        setState("invalid")
      }, 4000)
    })

    return () => clearTimeout(timer)
  }, [urlError])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setFormError(error.message)
        return
      }

      // Best-effort: mark client as active in our DB
      await activateClientLogin().catch(() => {})

      setState("success")
      setTimeout(() => router.push("/dashboard"), 2000)
    } catch {
      setFormError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-[360px]">

        {/* Brand */}
        <div className="flex justify-center mb-9">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={branding.companyName}
              className="max-h-[70px] md:max-h-[90px] w-auto object-contain"
            />
          ) : (
            <p className="text-[22px] font-bold text-white leading-tight">
              {branding.companyName}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-8 pt-7 pb-5">
            <h1 className="text-[20px] font-bold text-gray-900 leading-tight">
              Set your password
            </h1>
            <p className="text-[13px] text-gray-400 mt-1">
              Create a password to access your dashboard.
            </p>
          </div>

          {/* Checking / loading state */}
          {state === "checking" && (
            <div className="px-8 pb-7 flex items-center gap-2.5">
              <div className="size-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
              <p className="text-[13px] text-gray-500">Verifying invite link…</p>
            </div>
          )}

          {/* Invalid / expired */}
          {state === "invalid" && (
            <div className="px-8 pb-7">
              <div className="flex items-start gap-2.5 rounded-lg border border-red-100 bg-red-50 px-3.5 py-3.5">
                <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-[13px] text-red-700 leading-snug">
                  This invite link is invalid or has expired. Please ask your
                  administrator to send a new invite.
                </p>
              </div>
            </div>
          )}

          {/* Success */}
          {state === "success" && (
            <div className="px-8 pb-7">
              <div className="flex items-start gap-2.5 rounded-lg border border-green-100 bg-green-50 px-3.5 py-3.5">
                <CheckCircle className="size-4 text-green-600 mt-0.5 shrink-0" />
                <p className="text-[13px] text-green-700 leading-snug">
                  Password set! Redirecting to your dashboard…
                </p>
              </div>
            </div>
          )}

          {/* Password form */}
          {state === "ready" && (
            <form onSubmit={handleSubmit} className="px-8 pb-7 space-y-4">
              {/* New password */}
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 pr-10 text-[13px] border border-gray-200 rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-blue-500
                               placeholder:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                               hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 text-[13px] border border-gray-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-500
                             placeholder:text-gray-400"
                />
              </div>

              {/* Error */}
              {formError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
                  <AlertCircle className="size-3.5 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-[12px] text-red-600 leading-snug">{formError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white
                           text-[13px] font-semibold rounded-lg transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed mt-1"
              >
                {loading ? "Setting password…" : "Save Password"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-[12px] text-slate-500">
          Already have a password?{" "}
          <a href="/login" className="text-slate-300 hover:text-white transition-colors">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900">
          <div className="size-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      }
    >
      <SetPasswordForm />
    </Suspense>
  )
}
