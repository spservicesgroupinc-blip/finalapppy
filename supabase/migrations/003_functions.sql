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
