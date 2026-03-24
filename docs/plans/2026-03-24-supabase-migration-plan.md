# Supabase Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Google Apps Script + Google Sheets backend with Supabase (Auth, Postgres, Storage, Real-time) for the RFE Spray Foam Estimation PWA.

**Architecture:** Supabase Direct — frontend talks to Supabase via `@supabase/supabase-js`. RLS policies enforce multi-tenant isolation. Postgres functions handle transactional inventory workflows. Edge Functions handle crew invites.

**Tech Stack:** Supabase (Auth, Postgres, Storage, Realtime), React 19, TypeScript, Vite, TailwindCSS 4

**Design doc:** `docs/plans/2026-03-24-supabase-migration-design.md`

---

## Task 1: Install Supabase Client & Configure Environment

**Files:**
- Modify: `package.json`
- Create: `lib/supabase.ts`
- Modify: `constants.ts`
- Create: `.env.local` (gitignored)
- Modify: `.gitignore`

**Step 1: Install @supabase/supabase-js**

Run:
```bash
npm install @supabase/supabase-js
```

**Step 2: Create environment file**

Create `.env.local`:
```env
VITE_SUPABASE_URL=https://sgtkunigahgzdtkngzzu.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key-from-supabase-dashboard>
```

**Step 3: Add .env.local to .gitignore**

Append to `.gitignore`:
```
.env.local
.env*.local
```

**Step 4: Create Supabase client**

Create `lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Step 5: Update constants.ts**

Replace contents of `constants.ts`:
```typescript
// Legacy GAS URL — retained temporarily for reference, unused
// export const GOOGLE_SCRIPT_URL = '...';

// Supabase config is in lib/supabase.ts via env vars
```

**Step 6: Commit**

```bash
git add package.json package-lock.json lib/supabase.ts constants.ts .gitignore
git commit -m "feat: add supabase client and environment config"
```

---

## Task 2: Create Database Schema (SQL Migration)

**Files:**
- Create: `supabase/migrations/001_schema.sql`

**Step 1: Create migration file**

Create `supabase/migrations/001_schema.sql`:
```sql
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
```

**Step 2: Run migration via Supabase MCP or dashboard**

Execute the SQL above against the Supabase project using the `execute_sql` MCP tool.

**Step 3: Verify tables exist**

Run: `mcp__supabase__list_tables` with `schemas: ["public"], verbose: true`

**Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add core database schema migration"
```

---

## Task 3: Create RLS Policies

**Files:**
- Create: `supabase/migrations/002_rls.sql`

**Step 1: Create RLS migration**

Create `supabase/migrations/002_rls.sql`:
```sql
-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Helper: get current user's company_id
CREATE OR REPLACE FUNCTION auth.company_id()
RETURNS uuid AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- COMPANIES ----
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own company" ON companies
  FOR SELECT USING (id = auth.company_id());

CREATE POLICY "admins update own company" ON companies
  FOR UPDATE USING (id = auth.company_id() AND auth.user_role() = 'admin');

-- ---- PROFILES ----
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see company profiles" ON profiles
  FOR SELECT USING (company_id = auth.company_id());

-- Admins can insert (invite crew)
CREATE POLICY "admins insert profiles" ON profiles
  FOR INSERT WITH CHECK (company_id = auth.company_id() AND auth.user_role() = 'admin');

-- ---- COMPANY SETTINGS ----
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own settings" ON company_settings
  FOR SELECT USING (company_id = auth.company_id());

CREATE POLICY "admins update settings" ON company_settings
  FOR UPDATE USING (company_id = auth.company_id() AND auth.user_role() = 'admin');

CREATE POLICY "admins insert settings" ON company_settings
  FOR INSERT WITH CHECK (company_id = auth.company_id() AND auth.user_role() = 'admin');

-- ---- CUSTOMERS ----
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read customers" ON customers
  FOR SELECT USING (company_id = auth.company_id());

CREATE POLICY "admins manage customers" ON customers
  FOR ALL USING (company_id = auth.company_id() AND auth.user_role() = 'admin');

-- ---- ESTIMATES ----
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read estimates" ON estimates
  FOR SELECT USING (company_id = auth.company_id());

CREATE POLICY "admins manage estimates" ON estimates
  FOR ALL USING (company_id = auth.company_id() AND auth.user_role() = 'admin');

CREATE POLICY "crew update work orders" ON estimates
  FOR UPDATE USING (
    company_id = auth.company_id()
    AND auth.user_role() = 'crew'
    AND status = 'Work Order'
  );

-- ---- FOAM STOCK ----
ALTER TABLE foam_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read foam stock" ON foam_stock
  FOR SELECT USING (company_id = auth.company_id());

CREATE POLICY "admins manage foam stock" ON foam_stock
  FOR ALL USING (company_id = auth.company_id() AND auth.user_role() = 'admin');

-- ---- WAREHOUSE STOCK ----
ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read warehouse" ON warehouse_stock
  FOR SELECT USING (company_id = auth.company_id());

CREATE POLICY "admins manage warehouse" ON warehouse_stock
  FOR ALL USING (company_id = auth.company_id() AND auth.user_role() = 'admin');

-- ---- ESTIMATE MATERIALS ----
ALTER TABLE estimate_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read estimate materials" ON estimate_materials
  FOR SELECT USING (
    estimate_id IN (SELECT id FROM estimates WHERE company_id = auth.company_id())
  );

CREATE POLICY "admins manage estimate materials" ON estimate_materials
  FOR ALL USING (
    estimate_id IN (SELECT id FROM estimates WHERE company_id = auth.company_id())
    AND auth.user_role() = 'admin'
  );

CREATE POLICY "crew update estimate materials" ON estimate_materials
  FOR UPDATE USING (
    estimate_id IN (
      SELECT id FROM estimates
      WHERE company_id = auth.company_id() AND status = 'Work Order'
    )
    AND auth.user_role() = 'crew'
  );

-- ---- INVENTORY TRANSACTIONS ----
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read inventory txns" ON inventory_transactions
  FOR SELECT USING (company_id = auth.company_id());

-- Insert handled by Postgres functions (SECURITY DEFINER), not direct client inserts
```

**Step 2: Run migration via Supabase MCP**

**Step 3: Commit**

```bash
git add supabase/migrations/002_rls.sql
git commit -m "feat: add RLS policies for tenant isolation"
```

---

## Task 4: Create Signup Trigger & Inventory Postgres Functions

**Files:**
- Create: `supabase/migrations/003_functions.sql`

**Step 1: Create functions migration**

Create `supabase/migrations/003_functions.sql`:
```sql
-- ============================================================
-- 1. Auto-create company + profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_company_id uuid;
  user_company_name text;
BEGIN
  -- Extract company name from user metadata (passed during signUp)
  user_company_name := NEW.raw_user_meta_data->>'company_name';

  IF user_company_name IS NOT NULL AND user_company_name != '' THEN
    -- Admin signup: create new company
    INSERT INTO public.companies (name)
    VALUES (user_company_name)
    RETURNING id INTO new_company_id;

    INSERT INTO public.profiles (id, company_id, role, display_name)
    VALUES (NEW.id, new_company_id, 'admin', NEW.raw_user_meta_data->>'display_name');

    INSERT INTO public.company_settings (company_id) VALUES (new_company_id);
    INSERT INTO public.foam_stock (company_id) VALUES (new_company_id);
  ELSE
    -- Crew invite: company_id passed in metadata by admin Edge Function
    INSERT INTO public.profiles (id, company_id, role, display_name)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data->>'company_id')::uuid,
      'crew',
      NEW.raw_user_meta_data->>'display_name'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. Convert Estimate to Work Order (reserve inventory)
-- ============================================================
CREATE OR REPLACE FUNCTION convert_to_work_order(p_estimate_id uuid, p_user_id uuid)
RETURNS void AS $$
DECLARE
  est RECORD;
  mat RECORD;
  v_company_id uuid;
  foam_oc integer;
  foam_cc integer;
BEGIN
  -- Get estimate and verify ownership
  SELECT * INTO est FROM estimates WHERE id = p_estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;

  SELECT company_id INTO v_company_id FROM profiles WHERE id = p_user_id;
  IF est.company_id != v_company_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF est.status != 'Draft' THEN RAISE EXCEPTION 'Estimate must be in Draft status'; END IF;

  -- Update estimate status
  UPDATE estimates SET status = 'Work Order', updated_at = now() WHERE id = p_estimate_id;

  -- Reserve inventory materials
  FOR mat IN SELECT * FROM estimate_materials WHERE estimate_id = p_estimate_id
  LOOP
    IF mat.warehouse_item_id IS NOT NULL THEN
      UPDATE warehouse_stock
      SET quantity_reserved = quantity_reserved + mat.quantity_estimated
      WHERE id = mat.warehouse_item_id;

      INSERT INTO inventory_transactions (company_id, estimate_id, warehouse_item_id, type, quantity, notes, performed_by)
      VALUES (v_company_id, p_estimate_id, mat.warehouse_item_id, 'reserve', mat.quantity_estimated, 'Work order created', p_user_id);
    END IF;
  END LOOP;

  -- Reserve foam sets
  foam_oc := COALESCE((est.materials->>'openCellSets')::integer, 0);
  foam_cc := COALESCE((est.materials->>'closedCellSets')::integer, 0);

  IF foam_oc > 0 OR foam_cc > 0 THEN
    UPDATE foam_stock
    SET open_cell_sets_reserved = open_cell_sets_reserved + foam_oc,
        closed_cell_sets_reserved = closed_cell_sets_reserved + foam_cc
    WHERE company_id = v_company_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Complete Job (consume inventory, reconcile actuals)
-- ============================================================
CREATE OR REPLACE FUNCTION complete_job(
  p_estimate_id uuid,
  p_user_id uuid,
  p_actuals jsonb
)
RETURNS void AS $$
DECLARE
  est RECORD;
  mat RECORD;
  v_company_id uuid;
  actual_qty numeric;
  est_foam_oc integer;
  est_foam_cc integer;
  act_foam_oc integer;
  act_foam_cc integer;
BEGIN
  SELECT * INTO est FROM estimates WHERE id = p_estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;

  SELECT company_id INTO v_company_id FROM profiles WHERE id = p_user_id;
  IF est.company_id != v_company_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF est.status != 'Work Order' THEN RAISE EXCEPTION 'Estimate must be in Work Order status'; END IF;

  -- Update estimate
  UPDATE estimates
  SET execution_status = 'Completed',
      actuals = p_actuals,
      updated_at = now()
  WHERE id = p_estimate_id;

  -- Reconcile each material line
  FOR mat IN SELECT * FROM estimate_materials WHERE estimate_id = p_estimate_id
  LOOP
    -- Look up actual qty from actuals JSON inventory array by matching name
    actual_qty := mat.quantity_estimated; -- default to estimated if no actual provided

    -- Update the material line with actual
    UPDATE estimate_materials SET quantity_actual = actual_qty WHERE id = mat.id;

    IF mat.warehouse_item_id IS NOT NULL THEN
      -- Release reservation, consume actual
      UPDATE warehouse_stock
      SET quantity_reserved = quantity_reserved - mat.quantity_estimated,
          quantity_on_hand = quantity_on_hand - actual_qty
      WHERE id = mat.warehouse_item_id;

      -- Log consumption
      INSERT INTO inventory_transactions (company_id, estimate_id, warehouse_item_id, type, quantity, notes, performed_by)
      VALUES (v_company_id, p_estimate_id, mat.warehouse_item_id, 'consume', -actual_qty, 'Job completed', p_user_id);

      -- Log adjustment if delta exists
      IF actual_qty != mat.quantity_estimated THEN
        INSERT INTO inventory_transactions (company_id, estimate_id, warehouse_item_id, type, quantity, notes, performed_by)
        VALUES (v_company_id, p_estimate_id, mat.warehouse_item_id, 'adjust', mat.quantity_estimated - actual_qty, 'Actual vs estimated delta', p_user_id);
      END IF;
    END IF;
  END LOOP;

  -- Reconcile foam stock
  est_foam_oc := COALESCE((est.materials->>'openCellSets')::integer, 0);
  est_foam_cc := COALESCE((est.materials->>'closedCellSets')::integer, 0);
  act_foam_oc := COALESCE((p_actuals->>'openCellSets')::integer, est_foam_oc);
  act_foam_cc := COALESCE((p_actuals->>'closedCellSets')::integer, est_foam_cc);

  UPDATE foam_stock
  SET open_cell_sets_reserved = open_cell_sets_reserved - est_foam_oc,
      open_cell_sets_on_hand = open_cell_sets_on_hand - act_foam_oc,
      closed_cell_sets_reserved = closed_cell_sets_reserved - est_foam_cc,
      closed_cell_sets_on_hand = closed_cell_sets_on_hand - act_foam_cc,
      lifetime_usage_open = lifetime_usage_open + act_foam_oc,
      lifetime_usage_closed = lifetime_usage_closed + act_foam_cc
  WHERE company_id = v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 2: Run migration via Supabase MCP**

**Step 3: Test signup trigger by creating a test user via Supabase dashboard Auth tab**

**Step 4: Commit**

```bash
git add supabase/migrations/003_functions.sql
git commit -m "feat: add signup trigger and inventory lifecycle functions"
```

---

## Task 5: Create Supabase Storage Bucket

**Files:**
- Create: `supabase/migrations/004_storage.sql`

**Step 1: Create storage migration**

Create `supabase/migrations/004_storage.sql`:
```sql
-- Create private storage bucket for company files
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-files', 'company-files', false);

-- RLS: users can read files under their company path
CREATE POLICY "company file read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] = auth.company_id()::text
  );

-- RLS: admins can upload files under their company path
CREATE POLICY "admin file upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] = auth.company_id()::text
    AND auth.user_role() = 'admin'
  );

-- RLS: crew can upload photos (site photos during job)
CREATE POLICY "crew photo upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] = auth.company_id()::text
    AND (storage.foldername(name))[2] = 'photos'
    AND auth.user_role() = 'crew'
  );

-- RLS: admins can delete their company files
CREATE POLICY "admin file delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] = auth.company_id()::text
    AND auth.user_role() = 'admin'
  );
```

**Step 2: Run migration via Supabase MCP**

**Step 3: Commit**

```bash
git add supabase/migrations/004_storage.sql
git commit -m "feat: add storage bucket with tenant-scoped RLS"
```

---

## Task 6: Update TypeScript Types

**Files:**
- Modify: `types.ts`

**Step 1: Add Supabase-aligned types to `types.ts`**

Keep all existing types (they're used by the calculator UI). Add new types at the bottom:

```typescript
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
```

**Step 2: Commit**

```bash
git add types.ts
git commit -m "feat: add Supabase database types"
```

---

## Task 7: Build Auth Service Layer

**Files:**
- Create: `services/auth.ts`

**Step 1: Create auth service**

Create `services/auth.ts`:
```typescript
import { supabase } from '../lib/supabase';
import { DbProfile } from '../types';

export interface AuthSession {
  userId: string;
  email: string;
  companyId: string;
  companyName: string;
  role: 'admin' | 'crew';
  displayName: string | null;
}

/**
 * Sign up a new admin + company
 */
export const signUp = async (
  email: string,
  password: string,
  companyName: string,
  displayName: string
): Promise<AuthSession> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        company_name: companyName,
        display_name: displayName,
      },
    },
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Signup failed');

  // Wait briefly for trigger to create profile
  await new Promise((r) => setTimeout(r, 1000));

  return getSessionFromUser(data.user.id);
};

/**
 * Sign in with email/password (admin or crew)
 */
export const signIn = async (email: string, password: string): Promise<AuthSession> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Login failed');

  return getSessionFromUser(data.user.id);
};

/**
 * Sign out
 */
export const signOut = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
};

/**
 * Get current session (for page refresh recovery)
 */
export const getCurrentSession = async (): Promise<AuthSession | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    return await getSessionFromUser(user.id);
  } catch {
    return null;
  }
};

/**
 * Listen for auth state changes
 */
export const onAuthStateChange = (callback: (session: AuthSession | null) => void) => {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      callback(null);
      return;
    }
    try {
      const authSession = await getSessionFromUser(session.user.id);
      callback(authSession);
    } catch {
      callback(null);
    }
  });
};

/**
 * Helper: build AuthSession from user ID by fetching profile + company
 */
const getSessionFromUser = async (userId: string): Promise<AuthSession> => {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*, companies(name)')
    .eq('id', userId)
    .single();

  if (profileError || !profile) throw new Error('Profile not found');

  const { data: { user } } = await supabase.auth.getUser();

  return {
    userId: profile.id,
    email: user?.email || '',
    companyId: profile.company_id,
    companyName: (profile as any).companies?.name || '',
    role: profile.role,
    displayName: profile.display_name,
  };
};
```

**Step 2: Commit**

```bash
git add services/auth.ts
git commit -m "feat: add Supabase auth service"
```

---

## Task 8: Build Data Service Layers

**Files:**
- Create: `services/customers.ts`
- Create: `services/estimates.ts`
- Create: `services/warehouse.ts`
- Create: `services/settings.ts`
- Create: `services/storage.ts`

**Step 1: Create `services/customers.ts`**

```typescript
import { supabase } from '../lib/supabase';
import { CustomerProfile } from '../types';

export const fetchCustomers = async (): Promise<CustomerProfile[]> => {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name');

  if (error) throw new Error(error.message);
  return data || [];
};

export const upsertCustomer = async (customer: Partial<CustomerProfile> & { id?: string }): Promise<CustomerProfile> => {
  const { data, error } = await supabase
    .from('customers')
    .upsert(customer)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const deleteCustomer = async (id: string): Promise<void> => {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw new Error(error.message);
};
```

**Step 2: Create `services/estimates.ts`**

```typescript
import { supabase } from '../lib/supabase';
import { EstimateRecord } from '../types';

export const fetchEstimates = async (): Promise<EstimateRecord[]> => {
  const { data, error } = await supabase
    .from('estimates')
    .select('*, customers(*)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(mapDbEstimateToRecord);
};

export const upsertEstimate = async (estimate: Partial<EstimateRecord>): Promise<EstimateRecord> => {
  const dbEstimate = mapRecordToDbEstimate(estimate);
  const { data, error } = await supabase
    .from('estimates')
    .upsert(dbEstimate)
    .select('*, customers(*)')
    .single();

  if (error) throw new Error(error.message);
  return mapDbEstimateToRecord(data);
};

export const deleteEstimate = async (id: string): Promise<void> => {
  const { error } = await supabase.from('estimates').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const convertToWorkOrder = async (estimateId: string, userId: string): Promise<void> => {
  const { error } = await supabase.rpc('convert_to_work_order', {
    p_estimate_id: estimateId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
};

export const completeJob = async (estimateId: string, userId: string, actuals: any): Promise<void> => {
  const { error } = await supabase.rpc('complete_job', {
    p_estimate_id: estimateId,
    p_user_id: userId,
    p_actuals: actuals,
  });
  if (error) throw new Error(error.message);
};

export const subscribeToEstimates = (
  companyId: string,
  callback: (payload: any) => void
) => {
  return supabase
    .channel('estimates-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'estimates', filter: `company_id=eq.${companyId}` },
      callback
    )
    .subscribe();
};

// --- Mappers ---
// Maps DB row (snake_case, flat) to app's EstimateRecord shape
function mapDbEstimateToRecord(row: any): EstimateRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    date: row.created_at,
    customer: row.customers || { id: row.customer_id, name: '', address: '', city: '', state: '', zip: '', email: '', phone: '', notes: '', status: 'Active' },
    status: row.status,
    executionStatus: row.execution_status,
    inputs: row.inputs || {},
    results: row.results || {},
    materials: row.materials || {},
    totalValue: row.total_value,
    wallSettings: row.wall_settings || {},
    roofSettings: row.roof_settings || {},
    expenses: row.expenses || {},
    notes: row.notes,
    pricingMode: row.inputs?.pricingMode,
    sqFtRates: row.inputs?.sqFtRates,
    scheduledDate: row.scheduled_date,
    invoiceDate: row.invoice_date,
    invoiceNumber: row.invoice_number,
    paymentTerms: row.payment_terms,
    estimateLines: row.estimate_lines,
    invoiceLines: row.invoice_lines,
    workOrderLines: row.work_order_lines,
    actuals: row.actuals,
    financials: row.financials,
    sitePhotos: row.site_photos,
    pdfLink: row.pdf_url,
    workOrderSheetUrl: row.work_order_url,
    lastModified: row.updated_at,
  };
}

function mapRecordToDbEstimate(est: Partial<EstimateRecord>): any {
  const db: any = {};
  if (est.id) db.id = est.id;
  if (est.customerId) db.customer_id = est.customerId;
  if (est.status) db.status = est.status;
  if (est.executionStatus) db.execution_status = est.executionStatus;
  if (est.inputs) db.inputs = est.inputs;
  if (est.results) db.results = est.results;
  if (est.materials) db.materials = est.materials;
  if (est.expenses) db.expenses = est.expenses;
  if (est.financials) db.financials = est.financials;
  if (est.actuals) db.actuals = est.actuals;
  if (est.wallSettings) db.wall_settings = est.wallSettings;
  if (est.roofSettings) db.roof_settings = est.roofSettings;
  if (est.totalValue !== undefined) db.total_value = est.totalValue;
  if (est.notes !== undefined) db.notes = est.notes;
  if (est.scheduledDate) db.scheduled_date = est.scheduledDate;
  if (est.invoiceDate) db.invoice_date = est.invoiceDate;
  if (est.invoiceNumber) db.invoice_number = est.invoiceNumber;
  if (est.paymentTerms) db.payment_terms = est.paymentTerms;
  if (est.estimateLines) db.estimate_lines = est.estimateLines;
  if (est.invoiceLines) db.invoice_lines = est.invoiceLines;
  if (est.workOrderLines) db.work_order_lines = est.workOrderLines;
  if (est.sitePhotos) db.site_photos = est.sitePhotos;
  if (est.pdfLink) db.pdf_url = est.pdfLink;
  return db;
}
```

**Step 3: Create `services/warehouse.ts`**

```typescript
import { supabase } from '../lib/supabase';
import { DbFoamStock, DbWarehouseItem } from '../types';

export const fetchFoamStock = async (): Promise<DbFoamStock | null> => {
  const { data, error } = await supabase
    .from('foam_stock')
    .select('*')
    .single();

  if (error) return null;
  return data;
};

export const updateFoamStock = async (updates: Partial<DbFoamStock>): Promise<void> => {
  const { error } = await supabase
    .from('foam_stock')
    .update(updates)
    .eq('company_id', updates.company_id);

  if (error) throw new Error(error.message);
};

export const fetchWarehouseItems = async (): Promise<DbWarehouseItem[]> => {
  const { data, error } = await supabase
    .from('warehouse_stock')
    .select('*')
    .order('name');

  if (error) throw new Error(error.message);
  return data || [];
};

export const upsertWarehouseItem = async (item: Partial<DbWarehouseItem>): Promise<DbWarehouseItem> => {
  const { data, error } = await supabase
    .from('warehouse_stock')
    .upsert(item)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const deleteWarehouseItem = async (id: string): Promise<void> => {
  const { error } = await supabase.from('warehouse_stock').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const fetchInventoryTransactions = async (estimateId?: string): Promise<any[]> => {
  let query = supabase
    .from('inventory_transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (estimateId) query = query.eq('estimate_id', estimateId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
};
```

**Step 4: Create `services/settings.ts`**

```typescript
import { supabase } from '../lib/supabase';
import { DbCompanySettings } from '../types';

export const fetchSettings = async (): Promise<DbCompanySettings | null> => {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .single();

  if (error) return null;
  return data;
};

export const updateSettings = async (updates: Partial<DbCompanySettings>): Promise<void> => {
  const { error } = await supabase
    .from('company_settings')
    .update(updates)
    .eq('company_id', updates.company_id);

  if (error) throw new Error(error.message);
};
```

**Step 5: Create `services/storage.ts`**

```typescript
import { supabase } from '../lib/supabase';

const BUCKET = 'company-files';

export const uploadFile = async (
  companyId: string,
  path: string,
  file: File | Blob,
  contentType?: string
): Promise<string> => {
  const fullPath = `${companyId}/${path}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fullPath, file, {
      contentType,
      upsert: true,
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);
  return data.publicUrl;
};

export const uploadPdf = async (
  companyId: string,
  estimateId: string,
  pdfBlob: Blob
): Promise<string> => {
  return uploadFile(companyId, `pdfs/${estimateId}.pdf`, pdfBlob, 'application/pdf');
};

export const uploadPhoto = async (
  companyId: string,
  estimateId: string,
  file: File,
  fileName: string
): Promise<string> => {
  return uploadFile(companyId, `photos/${estimateId}/${fileName}`, file);
};

export const uploadLogo = async (companyId: string, file: File): Promise<string> => {
  return uploadFile(companyId, `logos/${file.name}`, file, file.type);
};

export const deleteFile = async (companyId: string, path: string): Promise<void> => {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([`${companyId}/${path}`]);

  if (error) throw new Error(error.message);
};
```

**Step 6: Commit**

```bash
git add services/customers.ts services/estimates.ts services/warehouse.ts services/settings.ts services/storage.ts
git commit -m "feat: add Supabase data service layers"
```

---

## Task 9: Rewire Auth in LoginPage & Context

**Files:**
- Modify: `components/LoginPage.tsx`
- Modify: `context/CalculatorContext.tsx`
- Modify: `types.ts` (update UserSession)
- Delete: `services/api.ts` (after all references removed)
- Delete: `hooks/useSync.ts` (after all references removed)

**Step 1: Update `UserSession` in `types.ts`**

Replace the existing `UserSession` interface:
```typescript
export interface UserSession {
  userId: string;
  email: string;
  companyId: string;
  companyName: string;
  role: 'admin' | 'crew';
  displayName: string | null;
}
```

**Step 2: Update `LoginPage.tsx`**

Replace imports of `loginUser`, `signupUser`, `loginCrew` from `services/api` with:
```typescript
import { signIn, signUp } from '../services/auth';
```

Update the `handleSubmit` function:
- Admin login: `const session = await signIn(formData.username, formData.password);`
- Admin signup: `const session = await signUp(formData.username, formData.password, formData.companyName, formData.companyName);`
- Crew login: `const session = await signIn(formData.username, formData.crewPin);`

Note: Crew now uses email/password like admins. The "PIN" field becomes a password field. The crew tab label can stay but the UX changes to email + password.

**Step 3: Update `CalculatorContext.tsx`**

Replace the `useSync` initialization pattern with Supabase auth listener. In the `CalculatorProvider`:

```typescript
import { getCurrentSession, onAuthStateChange, AuthSession } from '../services/auth';
import { fetchSettings } from '../services/settings';
import { fetchCustomers } from '../services/customers';
import { fetchEstimates } from '../services/estimates';
import { fetchFoamStock, fetchWarehouseItems } from '../services/warehouse';

// Inside CalculatorProvider, add useEffect for auth:
useEffect(() => {
  const init = async () => {
    const session = await getCurrentSession();
    if (session) {
      dispatch({ type: 'SET_SESSION', payload: session });
      await loadAppData(dispatch);
    } else {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };
  init();

  const { data: { subscription } } = onAuthStateChange(async (session) => {
    dispatch({ type: 'SET_SESSION', payload: session });
    if (session) await loadAppData(dispatch);
  });

  return () => subscription.unsubscribe();
}, []);
```

Create `loadAppData` function:
```typescript
async function loadAppData(dispatch: React.Dispatch<Action>) {
  dispatch({ type: 'SET_LOADING', payload: true });
  try {
    const [settings, customers, estimates, foamStock, warehouseItems] = await Promise.all([
      fetchSettings(),
      fetchCustomers(),
      fetchEstimates(),
      fetchFoamStock(),
      fetchWarehouseItems(),
    ]);

    dispatch({
      type: 'LOAD_DATA',
      payload: {
        companyProfile: settings?.company_profile || DEFAULT_STATE.companyProfile,
        yields: settings?.yields || DEFAULT_STATE.yields,
        costs: settings?.costs || DEFAULT_STATE.costs,
        pricingMode: settings?.pricing_mode || 'level_pricing',
        sqFtRates: settings?.sqft_rates || DEFAULT_STATE.sqFtRates,
        expenses: settings?.expenses_defaults || DEFAULT_STATE.expenses,
        customers: customers,
        savedEstimates: estimates,
        warehouse: {
          openCellSets: foamStock?.open_cell_sets_on_hand || 0,
          closedCellSets: foamStock?.closed_cell_sets_on_hand || 0,
          items: warehouseItems.map(w => ({
            id: w.id,
            name: w.name,
            quantity: w.quantity_on_hand,
            unit: w.unit,
            unitCost: w.unit_cost,
          })),
        },
        lifetimeUsage: {
          openCell: foamStock?.lifetime_usage_open || 0,
          closedCell: foamStock?.lifetime_usage_closed || 0,
        },
      },
    });
    dispatch({ type: 'SET_INITIALIZED', payload: true });
  } catch (e) {
    console.error('Load failed:', e);
    dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'error', message: 'Failed to load data.' } });
  } finally {
    dispatch({ type: 'SET_LOADING', payload: false });
  }
}
```

**Step 4: Remove old sync imports from all components**

Search for all imports of `services/api` and `hooks/useSync` and replace with the new service calls.

**Step 5: Delete old files**

```bash
rm services/api.ts hooks/useSync.ts backend/Code.js
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: rewire auth and data loading to Supabase, remove GAS backend"
```

---

## Task 10: Rewire Component Data Mutations

**Files:**
- Modify: All components that call `syncUp`, `markJobPaid`, `createWorkOrderSheet`, `completeJob`, `deleteEstimate`, `savePdfToDrive`, `uploadImage`, `logCrewTime`

**Step 1: Audit all imports from `services/api`**

Run: `grep -r "services/api" components/ hooks/ --include="*.tsx" --include="*.ts"`

For each component found:
- Replace `syncUp` calls → direct Supabase service calls (`upsertEstimate`, `updateSettings`, etc.)
- Replace `deleteEstimate` → `services/estimates.deleteEstimate`
- Replace `markJobPaid` → `supabase.from('estimates').update({ status: 'Paid' })`
- Replace `createWorkOrderSheet` → `services/estimates.convertToWorkOrder`
- Replace `completeJob` → `services/estimates.completeJob`
- Replace `savePdfToDrive` → `services/storage.uploadPdf`
- Replace `uploadImage` → `services/storage.uploadPhoto`

**Step 2: Replace auto-sync with per-mutation saves**

The old pattern was: mutate local state → debounced `syncUp` blob. New pattern: mutate via Supabase service call → update local state from response. Each save button or action directly calls the appropriate service function.

**Step 3: Verify build**

Run:
```bash
npm run build
```

Expected: no TypeScript errors, no missing imports.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: rewire all component mutations to Supabase services"
```

---

## Task 11: Add Real-Time Subscriptions

**Files:**
- Create: `hooks/useRealtimeSync.ts`
- Modify: `context/CalculatorContext.tsx`

**Step 1: Create `hooks/useRealtimeSync.ts`**

```typescript
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useCalculator } from '../context/CalculatorContext';
import { fetchEstimates } from '../services/estimates';
import { fetchFoamStock, fetchWarehouseItems } from '../services/warehouse';

export const useRealtimeSync = (companyId: string | null) => {
  const { dispatch } = useCalculator();

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel('realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'estimates', filter: `company_id=eq.${companyId}` },
        async () => {
          // Refetch estimates on any change
          const estimates = await fetchEstimates();
          dispatch({ type: 'UPDATE_DATA', payload: { savedEstimates: estimates } });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'foam_stock', filter: `company_id=eq.${companyId}` },
        async () => {
          const foamStock = await fetchFoamStock();
          if (foamStock) {
            dispatch({
              type: 'UPDATE_DATA',
              payload: {
                warehouse: {
                  openCellSets: foamStock.open_cell_sets_on_hand,
                  closedCellSets: foamStock.closed_cell_sets_on_hand,
                  items: [], // will be merged
                },
                lifetimeUsage: {
                  openCell: foamStock.lifetime_usage_open,
                  closedCell: foamStock.lifetime_usage_closed,
                },
              },
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'warehouse_stock', filter: `company_id=eq.${companyId}` },
        async () => {
          const items = await fetchWarehouseItems();
          dispatch({
            type: 'UPDATE_NESTED_DATA',
            category: 'warehouse',
            field: 'items',
            value: items.map(w => ({ id: w.id, name: w.name, quantity: w.quantity_on_hand, unit: w.unit, unitCost: w.unit_cost })),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, dispatch]);
};
```

**Step 2: Wire into CalculatorProvider or SprayFoamCalculator**

Add `useRealtimeSync(session?.companyId ?? null)` in the main app shell after session is established.

**Step 3: Enable Realtime in Supabase**

Via Supabase dashboard or SQL:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE estimates;
ALTER PUBLICATION supabase_realtime ADD TABLE foam_stock;
ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_stock;
```

**Step 4: Commit**

```bash
git add hooks/useRealtimeSync.ts context/CalculatorContext.tsx
git commit -m "feat: add real-time subscriptions for estimates and inventory"
```

---

## Task 12: Create Edge Function for Crew Invites

**Files:**
- Create: `supabase/functions/invite-crew/index.ts`

**Step 1: Create Edge Function**

Create `supabase/functions/invite-crew/index.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: corsHeaders });
    }

    const { email, displayName } = await req.json();

    // Invite the crew member
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        company_id: profile.company_id,
        display_name: displayName || email,
      },
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, userId: data.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

**Step 2: Deploy via Supabase MCP or CLI**

**Step 3: Add invite function to `services/auth.ts`**

```typescript
export const inviteCrew = async (email: string, displayName: string): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-crew`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, displayName }),
    }
  );

  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
};
```

**Step 4: Commit**

```bash
git add supabase/functions/ services/auth.ts
git commit -m "feat: add Edge Function for crew invites"
```

---

## Task 13: Clean Up & Final Verification

**Files:**
- Delete: `backend/Code.js`
- Delete: `services/api.ts`
- Delete: `hooks/useSync.ts`
- Modify: `constants.ts` (remove GAS URL)

**Step 1: Remove all legacy files**

```bash
rm -rf backend/
rm services/api.ts
rm hooks/useSync.ts
```

**Step 2: Clean constants.ts**

Replace with:
```typescript
// App constants (Supabase config is in lib/supabase.ts via env vars)
export const APP_VERSION = '2.0.0';
```

**Step 3: Verify no dead imports**

Run:
```bash
npm run lint
npm run build
```

Fix any TypeScript errors from missing imports or type mismatches.

**Step 4: Test full flow manually**

1. Open app → should show login page
2. Sign up new company → should create account, redirect to dashboard
3. Add a customer → should persist to Supabase
4. Create an estimate → should save
5. Convert to work order → should reserve inventory
6. Invite crew member → crew receives email
7. Crew logs in → sees CrewDashboard with assigned work orders
8. Crew completes job → inventory updates, admin sees changes in real-time

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: remove legacy GAS backend, clean up dead imports"
```

---

## Execution Summary

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Install Supabase client & env config | Low |
| 2 | Create database schema | Medium |
| 3 | Create RLS policies | Medium |
| 4 | Signup trigger & inventory functions | High |
| 5 | Storage bucket | Low |
| 6 | Update TypeScript types | Low |
| 7 | Auth service layer | Medium |
| 8 | Data service layers (5 files) | Medium |
| 9 | Rewire auth in LoginPage & Context | High |
| 10 | Rewire all component mutations | High |
| 11 | Real-time subscriptions | Medium |
| 12 | Edge Function for crew invites | Medium |
| 13 | Clean up & verification | Low |
