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
