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
