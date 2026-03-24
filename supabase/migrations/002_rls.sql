-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Helper: get current user's company_id (public schema — auth schema requires elevated perms)
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS uuid AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- COMPANIES ----
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own company" ON companies
  FOR SELECT USING (id = public.get_my_company_id());

CREATE POLICY "admins update own company" ON companies
  FOR UPDATE USING (id = public.get_my_company_id() AND public.get_my_role() = 'admin');

-- ---- PROFILES ----
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see company profiles" ON profiles
  FOR SELECT USING (company_id = public.get_my_company_id());

-- Admins can insert (invite crew)
CREATE POLICY "admins insert profiles" ON profiles
  FOR INSERT WITH CHECK (company_id = public.get_my_company_id() AND public.get_my_role() = 'admin');

-- ---- COMPANY SETTINGS ----
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own settings" ON company_settings
  FOR SELECT USING (company_id = public.get_my_company_id());

CREATE POLICY "admins update settings" ON company_settings
  FOR UPDATE USING (company_id = public.get_my_company_id() AND public.get_my_role() = 'admin');

CREATE POLICY "admins insert settings" ON company_settings
  FOR INSERT WITH CHECK (company_id = public.get_my_company_id() AND public.get_my_role() = 'admin');

-- ---- CUSTOMERS ----
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read customers" ON customers
  FOR SELECT USING (company_id = public.get_my_company_id());

CREATE POLICY "admins manage customers" ON customers
  FOR ALL USING (company_id = public.get_my_company_id() AND public.get_my_role() = 'admin');

-- ---- ESTIMATES ----
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read estimates" ON estimates
  FOR SELECT USING (company_id = public.get_my_company_id());

CREATE POLICY "admins manage estimates" ON estimates
  FOR ALL USING (company_id = public.get_my_company_id() AND public.get_my_role() = 'admin');

CREATE POLICY "crew update work orders" ON estimates
  FOR UPDATE USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = 'crew'
    AND status = 'Work Order'
  );

-- ---- FOAM STOCK ----
ALTER TABLE foam_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read foam stock" ON foam_stock
  FOR SELECT USING (company_id = public.get_my_company_id());

CREATE POLICY "admins manage foam stock" ON foam_stock
  FOR ALL USING (company_id = public.get_my_company_id() AND public.get_my_role() = 'admin');

-- ---- WAREHOUSE STOCK ----
ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read warehouse" ON warehouse_stock
  FOR SELECT USING (company_id = public.get_my_company_id());

CREATE POLICY "admins manage warehouse" ON warehouse_stock
  FOR ALL USING (company_id = public.get_my_company_id() AND public.get_my_role() = 'admin');

-- ---- ESTIMATE MATERIALS ----
ALTER TABLE estimate_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read estimate materials" ON estimate_materials
  FOR SELECT USING (
    estimate_id IN (SELECT id FROM estimates WHERE company_id = public.get_my_company_id())
  );

CREATE POLICY "admins manage estimate materials" ON estimate_materials
  FOR ALL USING (
    estimate_id IN (SELECT id FROM estimates WHERE company_id = public.get_my_company_id())
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "crew update estimate materials" ON estimate_materials
  FOR UPDATE USING (
    estimate_id IN (
      SELECT id FROM estimates
      WHERE company_id = public.get_my_company_id() AND status = 'Work Order'
    )
    AND public.get_my_role() = 'crew'
  );

-- ---- INVENTORY TRANSACTIONS ----
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read inventory txns" ON inventory_transactions
  FOR SELECT USING (company_id = public.get_my_company_id());

-- Insert handled by Postgres functions (SECURITY DEFINER), not direct client inserts
