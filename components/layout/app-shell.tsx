"use client"

import { createContext, useContext, useState } from "react"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import type { UserRole, Product, Shipment, ServiceRequest, FileDoc } from "@/lib/types"
import { mockProducts } from "@/lib/mock-data"
import { mockShipments } from "@/lib/mock-shipments"
import { mockRequests } from "@/lib/mock-requests"
import { mockFiles } from "@/lib/mock-files"

type AppContextType = {
  role: UserRole
  setRole: (r: UserRole) => void
  products: Product[]
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>
  shipments: Shipment[]
  setShipments: React.Dispatch<React.SetStateAction<Shipment[]>>
  requests: ServiceRequest[]
  setRequests: React.Dispatch<React.SetStateAction<ServiceRequest[]>>
  files: FileDoc[]
  setFiles: React.Dispatch<React.SetStateAction<FileDoc[]>>
}

const AppContext = createContext<AppContextType>({
  role: "client",
  setRole: () => {},
  products: [],
  setProducts: () => {},
  shipments: [],
  setShipments: () => {},
  requests: [],
  setRequests: () => {},
  files: [],
  setFiles: () => {},
})

export function useRole() {
  const { role, setRole } = useContext(AppContext)
  return { role, setRole }
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>("client")
  const [products, setProducts] = useState<Product[]>(mockProducts)
  const [shipments, setShipments] = useState<Shipment[]>(mockShipments)
  const [requests, setRequests] = useState<ServiceRequest[]>(mockRequests)
  const [files, setFiles] = useState<FileDoc[]>(mockFiles)

  return (
    <AppContext.Provider value={{ role, setRole, products, setProducts, shipments, setShipments, requests, setRequests, files, setFiles }}>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <Sidebar role={role} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header role={role} setRole={setRole} />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  )
}
