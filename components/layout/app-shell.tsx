"use client"

import { createContext, useContext, useState } from "react"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import type { UserRole, Product, Shipment } from "@/lib/types"
import { mockProducts } from "@/lib/mock-data"
import { mockShipments } from "@/lib/mock-shipments"

type AppContextType = {
  role: UserRole
  setRole: (r: UserRole) => void
  products: Product[]
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>
  shipments: Shipment[]
  setShipments: React.Dispatch<React.SetStateAction<Shipment[]>>
}

const AppContext = createContext<AppContextType>({
  role: "client",
  setRole: () => {},
  products: [],
  setProducts: () => {},
  shipments: [],
  setShipments: () => {},
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>("client")
  const [products, setProducts] = useState<Product[]>(mockProducts)
  const [shipments, setShipments] = useState<Shipment[]>(mockShipments)

  return (
    <AppContext.Provider value={{ role, setRole, products, setProducts, shipments, setShipments }}>
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
