import type { Shipment } from "./types"

export const mockShipments: Shipment[] = [
  {
    id: "s1",
    shipmentNumber: "IN-1008",
    clientId: "c1",
    clientName: "TechVault Co.",
    products: [
      { id: "sp1", productId: "p1", productName: "Wireless Earbuds", sku: "WE-1000", units: 500, receivedUnits: 0, damagedUnits: 0, notes: "" },
      { id: "sp2", productId: "p2", productName: "Stainless Steel Tumbler", sku: "TMB-500", units: 500, receivedUnits: 0, damagedUnits: 0, notes: "" },
      { id: "sp3", productId: "p3", productName: "Phone Case iPhone 14", sku: "PC-14-BLK", units: 250, receivedUnits: 0, damagedUnits: 0, notes: "" },
    ],
    tracking: [
      { id: "t1", carrier: "UPS", trackingNumber: "1Z999AA1234567890", boxCount: 5, notes: "" },
    ],
    status: "In Transit",
    createdAt: "May 26, 2026",
    notes: "",
  },
  {
    id: "s2",
    shipmentNumber: "IN-1007",
    clientId: "c2",
    clientName: "NovaTrade Ltd.",
    products: [
      { id: "sp4", productId: "p5", productName: "Resistance Band Set", sku: "RB-SET", units: 500, receivedUnits: 0, damagedUnits: 0, notes: "" },
      { id: "sp5", productId: "p10", productName: "Silicone Phone Wallet", sku: "SPW-BLK", units: 300, receivedUnits: 0, damagedUnits: 0, notes: "" },
    ],
    tracking: [
      { id: "t2", carrier: "FedEx", trackingNumber: "778844123456789", boxCount: 3, notes: "" },
    ],
    status: "In Transit",
    createdAt: "May 23, 2026",
    notes: "",
  },
  {
    id: "s3",
    shipmentNumber: "IN-1006",
    clientId: "c1",
    clientName: "TechVault Co.",
    products: [
      { id: "sp6", productId: "p1", productName: "Wireless Earbuds", sku: "WE-1000", units: 300, receivedUnits: 0, damagedUnits: 0, notes: "" },
      { id: "sp7", productId: "p7", productName: "Portable Bluetooth Speaker", sku: "BTS-300", units: 250, receivedUnits: 0, damagedUnits: 0, notes: "" },
      { id: "sp8", productId: "p11", productName: "LED Desk Lamp", sku: "LDL-100", units: 350, receivedUnits: 0, damagedUnits: 0, notes: "" },
      { id: "sp9", productId: "p8", productName: "Laptop Stand Adjustable", sku: "LS-ADJ", units: 250, receivedUnits: 0, damagedUnits: 0, notes: "" },
    ],
    tracking: [
      { id: "t3", carrier: "USPS", trackingNumber: "9400111123456789012345", boxCount: 8, notes: "" },
    ],
    status: "Arrived",
    createdAt: "May 20, 2026",
    notes: "Please prioritize receiving.",
  },
  {
    id: "s4",
    shipmentNumber: "IN-1005",
    clientId: "c3",
    clientName: "BrightBox LLC",
    products: [
      { id: "sp10", productId: "p4", productName: "Yoga Mat", sku: "YM-200", units: 300, receivedUnits: 300, damagedUnits: 2, notes: "All received" },
    ],
    tracking: [
      { id: "t4", carrier: "UPS", trackingNumber: "1Z777AA5556667780", boxCount: 2, notes: "" },
    ],
    status: "Received",
    createdAt: "May 18, 2026",
    notes: "",
    isInventoryUpdated: true,
  },
  {
    id: "s5",
    shipmentNumber: "IN-1004",
    clientId: "c4",
    clientName: "Stellar Goods",
    products: [
      { id: "sp11", productId: "p8", productName: "Laptop Stand Adjustable", sku: "LS-ADJ", units: 200, receivedUnits: 150, damagedUnits: 0, notes: "" },
      { id: "sp12", productId: "p10", productName: "Silicone Phone Wallet", sku: "SPW-BLK", units: 400, receivedUnits: 200, damagedUnits: 5, notes: "" },
    ],
    tracking: [
      { id: "t5", carrier: "DHL", trackingNumber: "1234567890", boxCount: 4, notes: "" },
    ],
    status: "Partially Received",
    createdAt: "May 15, 2026",
    notes: "Waiting for second pallet.",
    isInventoryUpdated: true,
  },
  {
    id: "s6",
    shipmentNumber: "IN-1003",
    clientId: "c2",
    clientName: "NovaTrade Ltd.",
    products: [
      { id: "sp13", productId: "p2", productName: "Stainless Steel Tumbler", sku: "TMB-500", units: 200, receivedUnits: 0, damagedUnits: 0, notes: "" },
      { id: "sp14", productId: "p5", productName: "Resistance Band Set", sku: "RB-SET", units: 150, receivedUnits: 0, damagedUnits: 0, notes: "" },
      { id: "sp15", productId: "p12", productName: "Bamboo Cutting Board", sku: "BCB-LG", units: 100, receivedUnits: 0, damagedUnits: 0, notes: "" },
    ],
    tracking: [
      { id: "t6", carrier: "FedEx", trackingNumber: "123456789012345", boxCount: 3, notes: "" },
    ],
    status: "Need Attention",
    createdAt: "May 12, 2026",
    notes: "Tracking shows delivered but warehouse cannot locate.",
  },
]
