
import React from 'react';
import { useCalculator, DEFAULT_STATE } from '../context/CalculatorContext';
import { EstimateRecord, CalculationResults, CustomerProfile, PurchaseOrder, InvoiceLineItem } from '../types';
import { upsertEstimate, deleteEstimate } from '../services/estimates';
import { upsertCustomer } from '../services/customers';
import { updateFoamStock, upsertWarehouseItem } from '../services/warehouse';
import { generateWorkOrderPDF, generateDocumentPDF } from '../utils/pdfGenerator';

export const useEstimates = () => {
  const { state, dispatch } = useCalculator();
  const { appData, ui, session } = state;

  // Keep a ref to the latest state for async closures
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ── Load an estimate back into the calculator form for editing ────────────
  const loadEstimateForEditing = (record: EstimateRecord) => {
    dispatch({
      type: 'UPDATE_DATA',
      payload: {
        mode: record.inputs.mode,
        length: record.inputs.length,
        width: record.inputs.width,
        wallHeight: record.inputs.wallHeight,
        roofPitch: record.inputs.roofPitch,
        includeGables: record.inputs.includeGables,
        isMetalSurface: record.inputs.isMetalSurface || false,
        additionalAreas: record.inputs.additionalAreas || [],
        wallSettings: record.wallSettings,
        roofSettings: record.roofSettings,
        expenses: { ...record.expenses, laborRate: record.expenses?.laborRate ?? appData.costs.laborRate },
        inventory: record.materials.inventory,
        customerProfile: record.customer,
        jobNotes: record.notes || '',
        scheduledDate: record.scheduledDate || '',
        invoiceDate: record.invoiceDate || '',
        invoiceNumber: record.invoiceNumber || '',
        paymentTerms: record.paymentTerms || 'Due on Receipt',
        pricingMode: record.pricingMode || 'level_pricing',
        sqFtRates: record.sqFtRates || { wall: 0, roof: 0 },
      },
    });
    dispatch({ type: 'SET_EDITING_ESTIMATE', payload: record.id });
    dispatch({ type: 'SET_VIEW', payload: 'estimate_detail' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Save / update an estimate ─────────────────────────────────────────────
  const saveEstimate = async (
    results: CalculationResults,
    targetStatus?: EstimateRecord['status'],
    extraData?: Partial<EstimateRecord>,
    shouldRedirect: boolean = true,
  ): Promise<EstimateRecord | null> => {
    if (!appData.customerProfile.name) {
      dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'error', message: 'Customer Name Required to Save' } });
      return null;
    }

    const estimateId = ui.editingEstimateId || Math.random().toString(36).substr(2, 9);
    const existingRecord = appData.savedEstimates.find(e => e.id === estimateId);
    const customerId = appData.customerProfile.id || Math.random().toString(36).substr(2, 9);

    let newStatus: EstimateRecord['status'] = targetStatus || existingRecord?.status || 'Draft';

    let invoiceNumber = appData.invoiceNumber;
    if (!invoiceNumber) {
      invoiceNumber = existingRecord?.invoiceNumber;
      if (newStatus === 'Invoiced' && !invoiceNumber) invoiceNumber = `INV-${Math.floor(Math.random() * 100000)}`;
    }

    const newEstimate: EstimateRecord = {
      id: estimateId,
      customerId,
      date: existingRecord?.date || new Date().toISOString(),
      scheduledDate: appData.scheduledDate,
      invoiceDate: appData.invoiceDate,
      paymentTerms: appData.paymentTerms,
      status: newStatus,
      invoiceNumber,
      customer: { ...appData.customerProfile },
      inputs: {
        mode: appData.mode,
        length: appData.length,
        width: appData.width,
        wallHeight: appData.wallHeight,
        roofPitch: appData.roofPitch,
        includeGables: appData.includeGables,
        isMetalSurface: appData.isMetalSurface,
        additionalAreas: appData.additionalAreas,
      },
      results: { ...results },
      materials: {
        openCellSets: results.openCellSets,
        closedCellSets: results.closedCellSets,
        inventory: [...appData.inventory],
      },
      totalValue: results.totalCost,
      wallSettings: { ...appData.wallSettings },
      roofSettings: { ...appData.roofSettings },
      expenses: { ...appData.expenses },
      notes: appData.jobNotes,
      pricingMode: appData.pricingMode,
      sqFtRates: appData.sqFtRates,
      executionStatus: existingRecord?.executionStatus || 'Not Started',
      actuals: existingRecord?.actuals,
      financials: existingRecord?.financials,
      workOrderSheetUrl: existingRecord?.workOrderSheetUrl,
      invoiceLines: extraData?.invoiceLines || existingRecord?.invoiceLines,
      workOrderLines: extraData?.workOrderLines || existingRecord?.workOrderLines,
      estimateLines: extraData?.estimateLines || existingRecord?.estimateLines,
      ...extraData,
    };

    // Optimistic local update
    let updatedEstimates = [...appData.savedEstimates];
    const idx = updatedEstimates.findIndex(e => e.id === estimateId);
    if (idx >= 0) updatedEstimates[idx] = newEstimate;
    else updatedEstimates.unshift(newEstimate);

    dispatch({ type: 'UPDATE_DATA', payload: { savedEstimates: updatedEstimates } });
    dispatch({ type: 'SET_EDITING_ESTIMATE', payload: estimateId });

    // Persist to Supabase in background
    upsertEstimate(newEstimate).catch(err =>
      console.error('Failed to sync estimate to Supabase:', err)
    );

    // Implicit customer upsert
    saveCustomer({ ...appData.customerProfile, id: customerId });

    if (shouldRedirect) {
      dispatch({ type: 'SET_VIEW', payload: 'estimate_detail' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const actionLabel =
      targetStatus === 'Work Order' ? 'Job Sold! Moved to Work Order' :
      targetStatus === 'Invoiced' ? 'Invoice Generated' :
      targetStatus === 'Paid' ? 'Payment Recorded' : 'Estimate Saved';
    dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'success', message: actionLabel } });

    return newEstimate;
  };

  // ── Delete an estimate ────────────────────────────────────────────────────
  const handleDeleteEstimate = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirm('Are you sure you want to delete this job?')) {
      dispatch({ type: 'UPDATE_DATA', payload: { savedEstimates: appData.savedEstimates.filter(e => e.id !== id) } });
      if (ui.editingEstimateId === id) {
        dispatch({ type: 'SET_EDITING_ESTIMATE', payload: null });
        dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
      }
      try {
        await deleteEstimate(id);
        dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'success', message: 'Job Deleted' } });
      } catch (err) {
        console.error('Delete failed on server:', err);
        dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'error', message: 'Deleted locally but server sync failed.' } });
      }
    }
  };

  // ── Mark job as Paid — calculates financials client-side ──────────────────
  const handleMarkPaid = async (id: string) => {
    const estimate = appData.savedEstimates.find(e => e.id === id);
    if (!estimate) return;

    dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'success', message: 'Recording Payment...' } });

    const act = estimate.actuals || estimate.materials || {} as any;
    const oc = Number(act.openCellSets || 0);
    const cc = Number(act.closedCellSets || 0);
    const chemCost = (oc * appData.costs.openCell) + (cc * appData.costs.closedCell);
    const labHrs = Number(act.laborHours || estimate.expenses?.manHours || 0);
    const labCost = labHrs * (estimate.expenses?.laborRate || appData.costs.laborRate || 0);
    let invCost = 0;
    (act.inventory || estimate.materials?.inventory || []).forEach((item: any) => {
      invCost += (Number(item.quantity) * Number(item.unitCost || 0));
    });
    const misc = (estimate.expenses?.tripCharge || 0) + (estimate.expenses?.fuelSurcharge || 0);
    const revenue = Number(estimate.totalValue) || 0;
    const totalCOGS = chemCost + labCost + invCost + misc;

    const updatedEstimate: EstimateRecord = {
      ...estimate,
      status: 'Paid',
      lastModified: new Date().toISOString(),
      financials: {
        revenue,
        chemicalCost: chemCost,
        laborCost: labCost,
        inventoryCost: invCost,
        miscCost: misc,
        totalCOGS,
        netProfit: revenue - totalCOGS,
        margin: revenue ? (revenue - totalCOGS) / revenue : 0,
      },
    };

    const updatedEstimates = appData.savedEstimates.map(e => e.id === id ? updatedEstimate : e);
    dispatch({ type: 'UPDATE_DATA', payload: { savedEstimates: updatedEstimates } });
    dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'success', message: 'Paid! Profit Calculated.' } });

    // Generate receipt PDF
    generateDocumentPDF(appData, estimate.results, 'RECEIPT', updatedEstimate);

    // Persist to Supabase
    upsertEstimate(updatedEstimate).catch(err =>
      console.error('Failed to sync paid status to Supabase:', err)
    );
  };

  // ── Save a customer ────────────────────────────────────────────────────────
  const saveCustomer = (customerData: CustomerProfile) => {
    let updatedCustomers = [...appData.customers];
    const existingIndex = updatedCustomers.findIndex(c => c.id === customerData.id);
    if (existingIndex >= 0) updatedCustomers[existingIndex] = customerData;
    else updatedCustomers.push(customerData);

    if (appData.customerProfile.id === customerData.id) {
      dispatch({ type: 'UPDATE_DATA', payload: { customers: updatedCustomers, customerProfile: customerData } });
    } else {
      dispatch({ type: 'UPDATE_DATA', payload: { customers: updatedCustomers } });
    }

    // Persist to Supabase
    upsertCustomer(customerData).catch(err =>
      console.error('Failed to sync customer to Supabase:', err)
    );
  };

  // ── Confirm Work Order + deduct inventory ─────────────────────────────────
  const confirmWorkOrder = async (results: CalculationResults, workOrderLines?: InvoiceLineItem[]) => {
    // 1. Deduct warehouse inventory locally
    const requiredOpen = Number(results.openCellSets) || 0;
    const requiredClosed = Number(results.closedCellSets) || 0;

    const newWarehouse = { ...appData.warehouse };
    newWarehouse.openCellSets = newWarehouse.openCellSets - requiredOpen;
    newWarehouse.closedCellSets = newWarehouse.closedCellSets - requiredClosed;

    if (appData.inventory.length > 0) {
      const inventoryUsage = appData.inventory.reduce((acc, item) => {
        const key = item.warehouseItemId || item.name;
        if (key) acc[key] = (acc[key] || 0) + (Number(item.quantity) || 0);
        return acc;
      }, {} as Record<string, number>);

      newWarehouse.items = newWarehouse.items.map(item => {
        const usedQty = inventoryUsage[item.id] || inventoryUsage[item.name];
        if (usedQty) return { ...item, quantity: item.quantity - usedQty };
        return item;
      });
    }

    // 2. Update local state
    dispatch({ type: 'UPDATE_DATA', payload: { warehouse: newWarehouse } });

    // 3. Save estimate as Work Order
    const record = await saveEstimate(results, 'Work Order', { workOrderLines }, false);

    if (record) {
      dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
      dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'success', message: 'Work Order Created!' } });

      // 4. Generate local PDF
      generateWorkOrderPDF(appData, record);

      // 5. Persist warehouse update to Supabase (background)
      if (session?.companyId) {
        updateFoamStock({
          company_id: session.spreadsheetId,
          open_cell_sets_on_hand: newWarehouse.openCellSets,
          closed_cell_sets_on_hand: newWarehouse.closedCellSets,
        }).catch(err => console.error('Failed to sync warehouse to Supabase:', err));

        // Also sync updated warehouse items
        newWarehouse.items.forEach(item => {
          upsertWarehouseItem({
            id: item.id,
            company_id: session.spreadsheetId,
            name: item.name,
            quantity_on_hand: item.quantity,
            unit: item.unit,
            unit_cost: item.unitCost,
            quantity_reserved: 0,
          }).catch(err => console.error('Failed to sync warehouse item:', err));
        });
      }
    }
  };

  // ── Create Purchase Order (restock) ──────────────────────────────────────
  const createPurchaseOrder = async (po: PurchaseOrder) => {
    const newWarehouse = { ...appData.warehouse };
    po.items.forEach(item => {
      if (item.type === 'open_cell') newWarehouse.openCellSets += item.quantity;
      if (item.type === 'closed_cell') newWarehouse.closedCellSets += item.quantity;
      if (item.type === 'inventory' && item.inventoryId) {
        const invItem = newWarehouse.items.find(i => i.id === item.inventoryId);
        if (invItem) invItem.quantity += item.quantity;
      }
    });

    const updatedPOs = [...(appData.purchaseOrders || []), po];
    dispatch({ type: 'UPDATE_DATA', payload: { warehouse: newWarehouse, purchaseOrders: updatedPOs } });
    dispatch({ type: 'SET_NOTIFICATION', payload: { type: 'success', message: 'Order Saved & Stock Updated' } });
    dispatch({ type: 'SET_VIEW', payload: 'warehouse' });

    // Sync foam stock to Supabase
    if (session?.companyId) {
      updateFoamStock({
        company_id: session.spreadsheetId,
        open_cell_sets_on_hand: newWarehouse.openCellSets,
        closed_cell_sets_on_hand: newWarehouse.closedCellSets,
      }).catch(err => console.error('Failed to sync warehouse after PO:', err));
    }
  };

  return {
    loadEstimateForEditing,
    saveEstimate,
    handleDeleteEstimate,
    handleMarkPaid,
    saveCustomer,
    confirmWorkOrder,
    createPurchaseOrder,
  };
};
