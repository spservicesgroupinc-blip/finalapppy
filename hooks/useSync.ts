
import { useEffect, useCallback } from 'react';
import { useCalculator, DEFAULT_STATE } from '../context/CalculatorContext';
import { fetchSettings, updateSettings } from '../services/settings';
import { fetchFoamStock, updateFoamStock, fetchWarehouseItems } from '../services/warehouse';
import { getCurrentSession } from '../services/auth';
import { supabase } from '../lib/supabase';
import { DbCompanySettings } from '../types';

/**
 * useSync — Supabase-only sync hook.
 *
 * DOWN: On login, loads company settings + warehouse from Supabase.
 * UP: When appData changes, persists settings + warehouse to Supabase (debounced).
 * Auth: Recovers Supabase session on page reload.
 */
export const useSync = () => {
  const { state, dispatch } = useCalculator();
  const { session, appData, ui } = state;

  // ── 1. SESSION RECOVERY on page reload ──────────────────────────────────
  useEffect(() => {
    const recoverSession = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const authSession = await getCurrentSession();
        if (authSession) {
          dispatch({
            type: 'SET_SESSION',
            payload: {
              username: authSession.email,
              companyName: authSession.companyName,
              companyId: authSession.companyId,
              role: authSession.role,
            },
          });
        } else {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    recoverSession();

    // Also listen for auth state changes (tab focus, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sbSession) => {
      if (event === 'SIGNED_OUT' || !sbSession) {
        dispatch({ type: 'LOGOUT' });
      }
    });

    return () => subscription.unsubscribe();
  }, [dispatch]);

  // ── 2. FETCH DATA FROM SUPABASE after session is established ────────────
  useEffect(() => {
    if (!session) return;

    const fetchData = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });

      try {
        // Fetch settings and warehouse in parallel
        const [settings, foamStock, warehouseItems] = await Promise.all([
          fetchSettings(),
          fetchFoamStock(),
          fetchWarehouseItems(),
        ]);

        const mergedState: Partial<typeof DEFAULT_STATE> = { ...DEFAULT_STATE };

        if (settings) {
          mergedState.companyProfile = { ...DEFAULT_STATE.companyProfile, ...settings.company_profile };
          mergedState.yields = { ...DEFAULT_STATE.yields, ...settings.yields };
          mergedState.costs = { ...DEFAULT_STATE.costs, ...settings.costs };
          mergedState.pricingMode = settings.pricing_mode || DEFAULT_STATE.pricingMode;
          mergedState.sqFtRates = { ...DEFAULT_STATE.sqFtRates, ...settings.sqft_rates };
          mergedState.expenses = { ...DEFAULT_STATE.expenses, ...settings.expenses_defaults };
        }

        if (foamStock) {
          mergedState.warehouse = {
            openCellSets: foamStock.open_cell_sets_on_hand ?? 0,
            closedCellSets: foamStock.closed_cell_sets_on_hand ?? 0,
            items: warehouseItems.map(item => ({
              id: item.id,
              name: item.name,
              quantity: item.quantity_on_hand,
              unit: item.unit,
              unitCost: item.unit_cost,
            })),
          };
          mergedState.lifetimeUsage = {
            openCell: foamStock.lifetime_usage_open ?? 0,
            closedCell: foamStock.lifetime_usage_closed ?? 0,
          };
        }

        dispatch({ type: 'LOAD_DATA', payload: mergedState });
        dispatch({ type: 'SET_INITIALIZED', payload: true });
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' });
        setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 3000);
      } catch (err) {
        console.error('Supabase sync down failed:', err);
        dispatch({ type: 'LOAD_DATA', payload: DEFAULT_STATE });
        dispatch({ type: 'SET_INITIALIZED', payload: true });
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
        dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'error', message: 'Failed to load data from cloud.' } });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    fetchData();
  }, [session, dispatch]);

  // ── 3. MANUAL FORCE REFRESH (pull from Supabase) ────────────────────────
  const forceRefresh = useCallback(async () => {
    if (!session) return;
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });

    try {
      const [settings, foamStock, warehouseItems] = await Promise.all([
        fetchSettings(),
        fetchFoamStock(),
        fetchWarehouseItems(),
      ]);

      const mergedState: Partial<typeof DEFAULT_STATE> = {};

      if (settings) {
        mergedState.companyProfile = { ...DEFAULT_STATE.companyProfile, ...settings.company_profile };
        mergedState.yields = { ...DEFAULT_STATE.yields, ...settings.yields };
        mergedState.costs = { ...DEFAULT_STATE.costs, ...settings.costs };
        mergedState.pricingMode = settings.pricing_mode || DEFAULT_STATE.pricingMode;
        mergedState.sqFtRates = { ...DEFAULT_STATE.sqFtRates, ...settings.sqft_rates };
        mergedState.expenses = { ...DEFAULT_STATE.expenses, ...settings.expenses_defaults };
      }

      if (foamStock) {
        mergedState.warehouse = {
          openCellSets: foamStock.open_cell_sets_on_hand ?? 0,
          closedCellSets: foamStock.closed_cell_sets_on_hand ?? 0,
          items: warehouseItems.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity_on_hand,
            unit: item.unit,
            unitCost: item.unit_cost,
          })),
        };
        mergedState.lifetimeUsage = {
          openCell: foamStock.lifetime_usage_open ?? 0,
          closedCell: foamStock.lifetime_usage_closed ?? 0,
        };
      }

      dispatch({ type: 'UPDATE_DATA', payload: mergedState });
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' });
      setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 3000);
    } catch (err) {
      console.error('Force refresh failed:', err);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
    }
  }, [session, dispatch]);

  // ── 4. MANUAL SYNC (push settings + warehouse to Supabase) ──────────────
  const handleManualSync = useCallback(async () => {
    if (!session) return;
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });

    try {
      const settingsPayload: Partial<DbCompanySettings> = {
        company_id: session.companyId,
        company_profile: appData.companyProfile,
        yields: appData.yields,
        costs: appData.costs,
        pricing_mode: appData.pricingMode,
        sqft_rates: appData.sqFtRates,
        expenses_defaults: appData.expenses,
      };

      await updateSettings(settingsPayload);

      // Sync warehouse foam counts
      await updateFoamStock({
        company_id: session.companyId,
        open_cell_sets_on_hand: appData.warehouse.openCellSets,
        closed_cell_sets_on_hand: appData.warehouse.closedCellSets,
        lifetime_usage_open: appData.lifetimeUsage.openCell,
        lifetime_usage_closed: appData.lifetimeUsage.closedCell,
      });

      dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' });
      dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'success', message: 'Saved to Cloud' } });
      setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 3000);
    } catch (err: any) {
      console.error('Manual sync failed:', err);
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' });
      dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'error', message: 'Sync failed. Check connection.' } });
    }
  }, [session, appData, dispatch]);

  return { handleManualSync, forceRefresh };
};
