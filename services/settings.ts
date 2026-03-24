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
