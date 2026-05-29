"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { isSupabaseConfigured, createBrowserClient } from "@/lib/supabase"
import { shapeUser, signOut, type AuthUser } from "@/lib/auth"
import type { UserRole, Product, Shipment, ServiceRequest, FileDoc, Invoice, Client } from "@/lib/types"
import { mockProducts } from "@/lib/mock-data"
import { mockShipments } from "@/lib/mock-shipments"
import { mockRequests } from "@/lib/mock-requests"
import { mockFiles } from "@/lib/mock-files"
import { mockInvoices } from "@/lib/mock-invoices"
import { mockClients } from "@/lib/mock-clients"

// ── Context type ──────────────────────────────────────────────

type AppContextType = {
  role: UserRole
  setRole: (r: UserRole) => void
  authUser: AuthUser | null
  isMockMode: boolean
  products: Product[]
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>
  shipments: Shipment[]
  setShipments: React.Dispatch<React.SetStateAction<Shipment[]>>
  requests: ServiceRequest[]
  setRequests: React.Dispatch<React.SetStateAction<ServiceRequest[]>>
  files: FileDoc[]
  setFiles: React.Dispatch<React.SetStateAction<FileDoc[]>>
  invoices: Invoice[]
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>
  clients: Client[]
  setClients: React.Dispatch<React.SetStateAction<Client[]>>
}

const AppContext = createContext<AppContextType>({
  role: "client",
  setRole: () => {},
  authUser: null,
  isMockMode: true,
  products: [],
  setProducts: () => {},
  shipments: [],
  setShipments: () => {},
  requests: [],
  setRequests: () => {},
  files: [],
  setFiles: () => {},
  invoices: [],
  setInvoices: () => {},
  clients: [],
  setClients: () => {},
})

// ── Hooks ─────────────────────────────────────────────────────

export function useRole() {
  const { role, setRole } = useContext(AppContext)
  return { role, setRole }
}

export function useAuthUser() {
  return useContext(AppContext).authUser
}

export function useIsMockMode() {
  return useContext(AppContext).isMockMode
}

export function useProducts() {
  const { products, setProducts } = useContext(AppContext)
  return { products, setProducts }
}

export function useShipments() {
  const { shipments, setShipments } = useContext(AppContext)
  return { shipments, setShipments }
}

export function useRequests() {
  const { requests, setRequests } = useContext(AppContext)
  return { requests, setRequests }
}

export function useFiles() {
  const { files, setFiles } = useContext(AppContext)
  return { files, setFiles }
}

export function useInvoices() {
  const { invoices, setInvoices } = useContext(AppContext)
  return { invoices, setInvoices }
}

export function useClients() {
  const { clients, setClients } = useContext(AppContext)
  return { clients, setClients }
}

// ── AppShell ──────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname()
  const router      = useRouter()
  const isMockMode  = !isSupabaseConfigured()

  // ── Auth state ──────────────────────────────────────────────
  const [authUser,     setAuthUser]     = useState<AuthUser | null>(null)
  const [authLoading,  setAuthLoading]  = useState(!isMockMode)
  // Role: sourced from JWT in auth mode, from toggle in mock mode
  const [role, setRole] = useState<UserRole>("client")

  // ── Mock data state ─────────────────────────────────────────
  const [products,  setProducts]  = useState<Product[]>(mockProducts)
  const [shipments, setShipments] = useState<Shipment[]>(mockShipments)
  const [requests,  setRequests]  = useState<ServiceRequest[]>(mockRequests)
  const [files,     setFiles]     = useState<FileDoc[]>(mockFiles)
  const [invoices,  setInvoices]  = useState<Invoice[]>(mockInvoices)
  const [clients,   setClients]   = useState<Client[]>(mockClients)

  // ── Session initialisation ───────────────────────────────────
  useEffect(() => {
    if (isMockMode) return // skip when Supabase not configured

    const supabase = createBrowserClient()

    // Prime with the current session (avoids flash of wrong role)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const shaped = shapeUser(user)
        setAuthUser(shaped)
        setRole(shaped.role)
      }
      setAuthLoading(false)
    })

    // Stay in sync with sign-in / sign-out / token-refresh events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          const shaped = shapeUser(session.user)
          setAuthUser(shaped)
          setRole(shaped.role)
        } else {
          setAuthUser(null)
          setRole("client")
          // Middleware will catch the missing session on the next
          // navigation and redirect to /login.
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [isMockMode])

  // ── Logout ──────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    await signOut()
    router.push("/login")
    router.refresh()
  }, [router])

  // ── Login page: render children directly (no sidebar/header) ─
  if (pathname === "/login") {
    return <>{children}</>
  }

  // ── Auth loading state (only in auth mode) ───────────────────
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <p className="text-[13px] text-gray-400">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <AppContext.Provider
      value={{
        role, setRole,
        authUser,
        isMockMode,
        products,  setProducts,
        shipments, setShipments,
        requests,  setRequests,
        files,     setFiles,
        invoices,  setInvoices,
        clients,   setClients,
      }}
    >
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <Sidebar role={role} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header
            role={role}
            setRole={setRole}
            authUser={authUser}
            isMockMode={isMockMode}
            onLogout={handleLogout}
          />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  )
}
