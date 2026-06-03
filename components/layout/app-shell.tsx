"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
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
import { listProducts } from "@/app/products/actions"
import { listShipments } from "@/app/shipments/actions"
import { listRequests }  from "@/app/service-requests/actions"
import { listFiles }     from "@/app/files/actions"
import { listInvoices }       from "@/app/invoices/actions"
import { listClients, activateClientLogin } from "@/app/clients/actions"
import { fetchPublicCompanyBranding } from "@/app/settings/actions"

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
  refreshAll: () => Promise<void>
  isRefreshing: boolean
  companyName: string
  companyLogoUrl: string | null
  companyAddress: string | null
  companyEmail: string | null
  companyPhone: string | null
  companyWebsite: string | null
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
  refreshAll: async () => {},
  isRefreshing: false,
  companyName: "Safir Logistics",
  companyLogoUrl: null,
  companyAddress: null,
  companyEmail: null,
  companyPhone: null,
  companyWebsite: null,
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

export function useRefreshAll() {
  const { refreshAll, isRefreshing } = useContext(AppContext)
  return { refreshAll, isRefreshing }
}

export function useCompanyBranding() {
  const { companyName, companyLogoUrl, companyAddress, companyEmail, companyPhone, companyWebsite } = useContext(AppContext)
  return { companyName, companyLogoUrl, companyAddress, companyEmail, companyPhone, companyWebsite }
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
  // ── Mobile sidebar ──────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── Data state ───────────────────────────────────────────────
  // In mock mode: pre-populated with mock data.
  // In Supabase mode: starts empty; filled after auth resolves.
  const [products,      setProducts]      = useState<Product[]>(isMockMode ? mockProducts : [])
  const [shipments,     setShipments]     = useState<Shipment[]>(isMockMode ? mockShipments : [])
  const [requests,      setRequests]      = useState<ServiceRequest[]>(isMockMode ? mockRequests : [])
  const [files,         setFiles]         = useState<FileDoc[]>(isMockMode ? mockFiles : [])
  const [invoices,      setInvoices]      = useState<Invoice[]>(isMockMode ? mockInvoices : [])
  const [clients,       setClients]       = useState<Client[]>(isMockMode ? mockClients : [])
  const [isRefreshing,  setIsRefreshing]  = useState(false)
  const [companyName,    setCompanyName]    = useState("Safir Logistics")
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null)
  const [companyAddress, setCompanyAddress] = useState<string | null>(null)
  const [companyEmail,   setCompanyEmail]   = useState<string | null>(null)
  const [companyPhone,   setCompanyPhone]   = useState<string | null>(null)
  const [companyWebsite, setCompanyWebsite] = useState<string | null>(null)
  // Track whether auth has resolved so refreshAll knows it can fetch
  const authedRef = useRef(false)

  // Debug: log data source on mount
  useEffect(() => {
    console.log("[DataSource] Mode:", isMockMode ? "mock" : "Supabase")
  }, [isMockMode])

  // ── Refresh all data from Supabase ───────────────────────────
  const refreshAll = useCallback(async () => {
    if (isMockMode || !authedRef.current) return
    console.log("[DataSource] Refreshing all data from Supabase…")
    setIsRefreshing(true)
    try {
      const [productsData, shipmentsData, requestsData, filesData, invoicesData, clientsData, brandingData] =
        await Promise.all([
          listProducts(),
          listShipments(),
          listRequests(),
          listFiles(),
          listInvoices(),
          listClients(),
          fetchPublicCompanyBranding(),
        ])
      setProducts(productsData)
      setShipments(shipmentsData)
      setRequests(requestsData)
      setFiles(filesData)
      setInvoices(invoicesData)
      setClients(clientsData)
      setCompanyName(brandingData.companyName)
      setCompanyLogoUrl(brandingData.logoUrl)
      setCompanyAddress(brandingData.address)
      setCompanyEmail(brandingData.email)
      setCompanyPhone(brandingData.phone)
      setCompanyWebsite(brandingData.website)
      console.log("[DataSource] Refresh complete. Source: Supabase")
    } catch (err) {
      console.error("[DataSource] Refresh failed:", err)
    } finally {
      setIsRefreshing(false)
    }
  }, [isMockMode])

  // Auto-refresh when the tab regains focus after 30+ seconds away
  useEffect(() => {
    if (isMockMode) return
    let hiddenAt = 0
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
      } else if (document.visibilityState === "visible" && hiddenAt > 0) {
        if (Date.now() - hiddenAt >= 30_000) {
          void refreshAll()
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [isMockMode, refreshAll])

  // ── Session initialisation ───────────────────────────────────
  useEffect(() => {
    if (isMockMode) return // skip when Supabase not configured

    const supabase = createBrowserClient()

    // Prime with the current session (avoids flash of wrong role)
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const shaped = shapeUser(user)
        setAuthUser(shaped)
        setRole(shaped.role)
        // Load all connected modules together; keep spinner until ready
        // to avoid a flash of empty-state tables.
        // If this is a client user logging in for the first time (invited → active),
        // promote their login_status before loading data.
        if (shaped.role === "client") {
          activateClientLogin().catch(() => {})
        }

        try {
          console.log("[DataSource] Loading all data from Supabase…")
          const [productsData, shipmentsData, requestsData, filesData, invoicesData, clientsData, brandingData] =
            await Promise.all([
              listProducts(),
              listShipments(),
              listRequests(),
              listFiles(),
              listInvoices(),
              listClients(),
              fetchPublicCompanyBranding(),
            ])
          setProducts(productsData)
          setShipments(shipmentsData)
          setRequests(requestsData)
          setFiles(filesData)
          setInvoices(invoicesData)
          setClients(clientsData)
          setCompanyName(brandingData.companyName)
          setCompanyLogoUrl(brandingData.logoUrl)
          authedRef.current = true
          console.log("[DataSource] Initial load complete. Source: Supabase")
        } catch {
          // Leave data empty; pages will show their empty states.
        }
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
        refreshAll,
        isRefreshing,
        companyName,
        companyLogoUrl,
        companyAddress,
        companyEmail,
        companyPhone,
        companyWebsite,
      }}
    >
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <Sidebar
          role={role}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          companyName={companyName}
          companyLogoUrl={companyLogoUrl}
        />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header
            role={role}
            setRole={setRole}
            authUser={authUser}
            isMockMode={isMockMode}
            onLogout={handleLogout}
            onRefresh={refreshAll}
            isRefreshing={isRefreshing}
            onMenuToggle={() => setSidebarOpen(true)}
          />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            {children}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  )
}
