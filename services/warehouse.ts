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
