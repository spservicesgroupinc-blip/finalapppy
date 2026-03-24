
export enum CalculationMode {
  BUILDING = 'Building',
  WALLS_ONLY = 'Walls Only',
  FLAT_AREA = 'Flat Area',
  CUSTOM = 'Custom',
}

export enum FoamType {
  OPEN_CELL = 'Open Cell',
  CLOSED_CELL = 'Closed Cell',
}

export enum AreaType {
  WALL = 'Wall',
  ROOF = 'Roof',
}

export interface FoamSettings {
  type: FoamType;
  thickness: number;
  wastePercentage: number;
}

export interface AdditionalArea {
  type: AreaType;
  length: number;
  width: number;
}

export interface InventoryItem {
  id: string;
  warehouseItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost?: number;
}

export interface WarehouseItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

export interface CompanyProfile {
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  crewAccessPin: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  email: string;
  phone: string;
  notes: string;
  status: 'Active' | 'Archived' | 'Lead';
}

export interface EstimateExpenses {
  manHours: number;
  laborRate?: number;
  tripCharge: number;
  fuelSurcharge: number;
  other: {
    description: string;
    amount: number;
  };
}

export interface InvoiceLineItem {
  id: string;
  item: string;
  description: string;
  qty: string;
  amount: number;
}

export interface MaterialUsageLogEntry {
  id?: string;
  date: string;
  jobId?: string;
  customerName: string;
  materialName: string;
  quantity: number;
  unit: string;
  loggedBy: string;
}

export interface PurchaseOrderItem {
  description: string;
  quantity: number;
  unitCost: number;
  total: number;
  type: 'open_cell' | 'closed_cell' | 'inventory';
  inventoryId?: string;
}

export interface PurchaseOrder {
  id: string;
  date: string;
  vendorName: string;
  status: 'Draft' | 'Sent' | 'Received' | 'Cancelled';
  items: PurchaseOrderItem[];
  totalCost: number;
  notes?: string;
}

export interface CalculationResults {
  perimeter: number;
  slopeFactor: number;
  baseWallArea: number;
  gableArea: number;
  totalWallArea: number;
  baseRoofArea: number;
  totalRoofArea: number;
  
  wallBdFt: number;
  roofBdFt: number;
  
  totalOpenCellBdFt: number;
  totalClosedCellBdFt: number;
  
  openCellSets: number;
  closedCellSets: number;

  // Added Stroke Counts
  openCellStrokes: number;
  closedCellStrokes: number;

  openCellCost: number;
  closedCellCost: number;
  
  inventoryCost: number; 

  laborCost: number;
  miscExpenses: number;
  materialCost: number; 
  totalCost: number; 
}

export interface EstimateRecord {
  id: string;
  customerId: string;
  date: string;
  
  customer: CustomerProfile;
  
  status: 'Draft' | 'Work Order' | 'Invoiced' | 'Paid' | 'Archived';
  executionStatus: 'Not Started' | 'In Progress' | 'Completed';
  
  inputs: {
    mode: CalculationMode;
    length: number;
    width: number;
    wallHeight: number;
    roofPitch: string;
    includeGables: boolean;
    isMetalSurface: boolean;
    additionalAreas: AdditionalArea[];
  };
  
  results: CalculationResults;
  
  materials: {
    openCellSets: number;
    closedCellSets: number;
    inventory: InventoryItem[];
  };
  
  totalValue: number;
  
  wallSettings: FoamSettings;
  roofSettings: FoamSettings;
  expenses: EstimateExpenses;
  
  notes?: string;
  pricingMode?: 'level_pricing' | 'sqft_pricing';
  sqFtRates?: {
    wall: number;
    roof: number;
  };
  
  scheduledDate?: string;
  invoiceDate?: string;
  invoiceNumber?: string;
  paymentTerms?: string;
  
  estimateLines?: InvoiceLineItem[]; 
  invoiceLines?: InvoiceLineItem[];
  workOrderLines?: InvoiceLineItem[];
  
  actuals?: {
    openCellSets: number;
    closedCellSets: number;
    openCellStrokes?: number;
    closedCellStrokes?: number;
    laborHours: number;
    inventory: InventoryItem[];
    notes: string;
    completedBy?: string;
    completionDate?: string;
    lastStartedAt?: string;
  };
  
  financials?: {
    revenue: number;
    totalCOGS: number;
    chemicalCost: number;
    laborCost: number;
    inventoryCost: number;
    miscCost: number;
    netProfit: number;
    margin: number;
  };
  
  workOrderSheetUrl?: string;
  pdfLink?: string;
  sitePhotos?: string[];
  inventoryProcessed?: boolean;
  lastModified?: string;
}

export interface CalculatorState {
  mode: CalculationMode;
  length: number;
  width: number;
  wallHeight: number;
  roofPitch: string;
  includeGables: boolean;
  isMetalSurface: boolean; 
  wallSettings: FoamSettings;
  roofSettings: FoamSettings;
  yields: {
    openCell: number;
    closedCell: number;
    // Added Stroke Config
    openCellStrokes: number;
    closedCellStrokes: number;
  };
  costs: {
    openCell: number;
    closedCell: number;
    laborRate: number;
  };
  warehouse: {
    openCellSets: number;
    closedCellSets: number;
    items: WarehouseItem[]; 
  };
  showPricing: boolean;
  additionalAreas: AdditionalArea[];
  inventory: InventoryItem[]; 
  companyProfile: CompanyProfile;
  
  customers: CustomerProfile[]; 
  customerProfile: CustomerProfile; 
  
  pricingMode: 'level_pricing' | 'sqft_pricing';
  sqFtRates: {
    wall: number;
    roof: number;
  };

  expenses: EstimateExpenses;
  savedEstimates: EstimateRecord[];
  purchaseOrders?: PurchaseOrder[];
  materialLogs?: MaterialUsageLogEntry[]; 
  
  lifetimeUsage: {
    openCell: number;
    closedCell: number;
  };

  jobNotes?: string;
  scheduledDate?: string;
  invoiceDate?: string;
  invoiceNumber?: string; 
  paymentTerms?: string;
}

export interface UserSession {
  username: string;
  companyName: string;
  spreadsheetId: string;
  folderId?: string;
  token?: string;
  role: 'admin' | 'crew';
}

// === SUPABASE DATABASE TYPES ===

export interface DbCompany {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface DbProfile {
  id: string;
  company_id: string;
  role: 'admin' | 'crew';
  display_name: string | null;
  created_at: string;
}

export interface DbCompanySettings {
  company_id: string;
  company_profile: CompanyProfile;
  yields: CalculatorState['yields'];
  costs: CalculatorState['costs'];
  pricing_mode: 'level_pricing' | 'sqft_pricing';
  sqft_rates: { wall: number; roof: number };
  expenses_defaults: EstimateExpenses;
}

export interface DbFoamStock {
  company_id: string;
  open_cell_sets_on_hand: number;
  open_cell_sets_reserved: number;
  closed_cell_sets_on_hand: number;
  closed_cell_sets_reserved: number;
  lifetime_usage_open: number;
  lifetime_usage_closed: number;
}

export interface DbWarehouseItem {
  id: string;
  company_id: string;
  name: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  unit: string;
  unit_cost: number;
}

export interface DbEstimateMaterial {
  id: string;
  estimate_id: string;
  warehouse_item_id: string | null;
  name: string;
  quantity_estimated: number;
  quantity_actual: number | null;
  unit: string;
  unit_cost: number;
}

export interface DbInventoryTransaction {
  id: string;
  company_id: string;
  estimate_id: string | null;
  warehouse_item_id: string | null;
  type: 'reserve' | 'release' | 'consume' | 'adjust';
  quantity: number;
  notes: string;
  performed_by: string | null;
  created_at: string;
}
