-- ============================================================
-- RFE App: Core Schema
-- ============================================================

-- 1. Companies (tenants)
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Profiles (linked to auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'crew')),
  display_name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_profiles_company ON profiles(company_id);

-- 3. Company Settings
CREATE TABLE company_settings (
  company_id uuid PRIMARY KEY REFERENCES companies ON DELETE CASCADE,
  company_profile jsonb DEFAULT '{}'::jsonb,
  yields jsonb DEFAULT '{"openCell":16000,"closedCell":4000,"openCellStrokes":6600,"closedCellStrokes":6600}'::jsonb,
  costs jsonb DEFAULT '{"openCell":2000,"closedCell":2600,"laborRate":85}'::jsonb,
  pricing_mode text DEFAULT 'level_pricing',
  sqft_rates jsonb DEFAULT '{"wall":0,"roof":0}'::jsonb,
  expenses_defaults jsonb DEFAULT '{"manHours":0,"tripCharge":0,"fuelSurcharge":0,"other":{"description":"Misc","amount":0}}'::jsonb
);

-- 4. Customers
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies ON DELETE CASCADE,
  name text NOT NULL,
  address text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT '',
  zip text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  notes text DEFAULT '',
  status text DEFAULT 'Active' CHECK (status IN ('Active', 'Archived', 'Lead')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_customers_company ON customers(company_id);

-- 5. Estimates
CREATE TABLE estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies ON DELETE CASCADE,
  customer_id uuid REFERENCES customers ON DELETE SET NULL,
  status text DEFAULT 'Draft' CHECK (status IN ('Draft', 'Work Order', 'Invoiced', 'Paid', 'Archived')),
  execution_status text DEFAULT 'Not Started' CHECK (execution_status IN ('Not Started', 'In Progress', 'Completed')),
  inputs jsonb DEFAULT '{}'::jsonb,
  results jsonb DEFAULT '{}'::jsonb,
  materials jsonb DEFAULT '{}'::jsonb,
  expenses jsonb DEFAULT '{}'::jsonb,
  financials jsonb DEFAULT '{}'::jsonb,
  actuals jsonb DEFAULT '{}'::jsonb,
  wall_settings jsonb DEFAULT '{}'::jsonb,
  roof_settings jsonb DEFAULT '{}'::jsonb,
  total_value numeric DEFAULT 0,
  notes text DEFAULT '',
  scheduled_date date,
  invoice_date date,
  invoice_number text,
  payment_terms text DEFAULT 'Due on Receipt',
  estimate_lines jsonb DEFAULT '[]'::jsonb,
  invoice_lines jsonb DEFAULT '[]'::jsonb,
  work_order_lines jsonb DEFAULT '[]'::jsonb,
  site_photos text[] DEFAULT '{}',
  pdf_url text,
  work_order_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_estimates_company ON estimates(company_id);
CREATE INDEX idx_estimates_customer ON estimates(customer_id);
CREATE INDEX idx_estimates_status ON estimates(company_id, status);

-- 6. Foam Stock (per company)
CREATE TABLE foam_stock (
  company_id uuid PRIMARY KEY REFERENCES companies ON DELETE CASCADE,
  open_cell_sets_on_hand integer DEFAULT 0,
  open_cell_sets_reserved integer DEFAULT 0,
  closed_cell_sets_on_hand integer DEFAULT 0,
  closed_cell_sets_reserved integer DEFAULT 0,
  lifetime_usage_open numeric DEFAULT 0,
  lifetime_usage_closed numeric DEFAULT 0
);

-- 7. Warehouse Stock (inventory items)
CREATE TABLE warehouse_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies ON DELETE CASCADE,
  name text NOT NULL,
  quantity_on_hand numeric DEFAULT 0,
  quantity_reserved numeric DEFAULT 0,
  unit text DEFAULT 'ea',
  unit_cost numeric DEFAULT 0
);

CREATE INDEX idx_warehouse_company ON warehouse_stock(company_id);

-- 8. Estimate Materials (line items linking estimates to inventory)
CREATE TABLE estimate_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimates ON DELETE CASCADE,
  warehouse_item_id uuid REFERENCES warehouse_stock ON DELETE SET NULL,
  name text NOT NULL,
  quantity_estimated numeric DEFAULT 0,
  quantity_actual numeric,
  unit text DEFAULT 'ea',
  unit_cost numeric DEFAULT 0
);

CREATE INDEX idx_estimate_materials_estimate ON estimate_materials(estimate_id);

-- 9. Inventory Transactions (audit log)
CREATE TABLE inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies ON DELETE CASCADE,
  estimate_id uuid REFERENCES estimates ON DELETE SET NULL,
  warehouse_item_id uuid REFERENCES warehouse_stock ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('reserve', 'release', 'consume', 'adjust')),
  quantity numeric NOT NULL,
  notes text DEFAULT '',
  performed_by uuid REFERENCES profiles ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_inv_tx_company ON inventory_transactions(company_id);
CREATE INDEX idx_inv_tx_estimate ON inventory_transactions(estimate_id);

-- ============================================================
-- Updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_estimates_updated BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
