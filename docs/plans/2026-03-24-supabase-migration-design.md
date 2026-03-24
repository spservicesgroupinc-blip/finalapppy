# RFE App: Google Apps Script → Supabase Migration Design

## Overview

Migrate the RFE Spray Foam Estimation PWA from a Google Apps Script + Google Sheets backend to Supabase (Auth, Postgres, Storage, Real-time). Multi-tenant SaaS with per-company isolation via Row Level Security.

## Decisions

- **Approach**: Supabase Direct (frontend talks to Supabase via JS client, no custom backend server)
- **Auth**: All users (admin + crew) get real Supabase auth accounts. No shared PINs.
- **Storage**: Supabase Storage replaces Google Drive for PDFs, photos, logos.
- **Migration**: Clean break — fresh Supabase instance, no data migration from GAS.
- **Phasing**: Phase 1 = Auth + core data + inventory flow. Phase 2 = advanced features.

## Multi-Tenancy Model

Every data table has a `company_id` column. RLS policies enforce that `auth.uid()` resolves to a `profiles` row which contains the user's `company_id`. All queries are scoped to that company. No cross-tenant visibility.

## Database Schema

### companies
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### profiles (1:1 with auth.users)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | references auth.users |
| company_id | uuid FK → companies | |
| role | text | 'admin' or 'crew' |
| display_name | text | |
| created_at | timestamptz | |

### company_settings
| Column | Type | Notes |
|--------|------|-------|
| company_id | uuid PK FK → companies | |
| company_profile | jsonb | address, phone, logo, etc. |
| yields | jsonb | open/closed cell yields + strokes |
| costs | jsonb | material + labor rates |
| pricing_mode | text | 'level_pricing' or 'sqft_pricing' |
| sqft_rates | jsonb | wall/roof rates |
| expenses_defaults | jsonb | default expense template |

### customers
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| company_id | uuid FK → companies | |
| name | text | |
| address | text | |
| city | text | |
| state | text | |
| zip | text | |
| email | text | |
| phone | text | |
| notes | text | |
| status | text | 'Active', 'Archived', 'Lead' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### estimates
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| company_id | uuid FK → companies | |
| customer_id | uuid FK → customers | |
| status | text | 'Draft', 'Work Order', 'Invoiced', 'Paid', 'Archived' |
| execution_status | text | 'Not Started', 'In Progress', 'Completed' |
| inputs | jsonb | calculator inputs (mode, dimensions, etc.) |
| results | jsonb | calculation results |
| materials | jsonb | foam sets + inventory snapshot |
| expenses | jsonb | labor, trip, fuel, other |
| financials | jsonb | revenue, COGS, profit, margin |
| actuals | jsonb | crew-reported actual usage |
| wall_settings | jsonb | foam type, thickness, waste% |
| roof_settings | jsonb | foam type, thickness, waste% |
| total_value | numeric | |
| notes | text | |
| scheduled_date | date | |
| invoice_date | date | |
| invoice_number | text | |
| payment_terms | text | |
| estimate_lines | jsonb | |
| invoice_lines | jsonb | |
| work_order_lines | jsonb | |
| site_photos | text[] | storage URLs |
| pdf_url | text | |
| work_order_url | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### foam_stock
| Column | Type | Notes |
|--------|------|-------|
| company_id | uuid PK FK → companies | |
| open_cell_sets_on_hand | integer | |
| open_cell_sets_reserved | integer | |
| closed_cell_sets_on_hand | integer | |
| closed_cell_sets_reserved | integer | |
| lifetime_usage_open | numeric | |
| lifetime_usage_closed | numeric | |

### warehouse_stock
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| company_id | uuid FK → companies | |
| name | text | |
| quantity_on_hand | numeric | |
| quantity_reserved | numeric | |
| unit | text | |
| unit_cost | numeric | |

### estimate_materials (line items per estimate)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| estimate_id | uuid FK → estimates | |
| warehouse_item_id | uuid FK → warehouse_stock (nullable) | |
| name | text | |
| quantity_estimated | numeric | |
| quantity_actual | numeric (nullable) | filled by crew on completion |
| unit | text | |
| unit_cost | numeric | |

### inventory_transactions (audit log)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| company_id | uuid FK → companies | |
| estimate_id | uuid FK → estimates | |
| warehouse_item_id | uuid FK → warehouse_stock (nullable) | |
| type | text | 'reserve', 'release', 'consume', 'adjust' |
| quantity | numeric | positive = add, negative = deduct |
| notes | text | |
| performed_by | uuid FK → profiles | |
| created_at | timestamptz | |

## Inventory Lifecycle (Postgres Functions)

### convert_to_work_order(estimate_id)
1. Set `estimates.status = 'Work Order'`
2. For each `estimate_materials` row: `warehouse_stock.quantity_reserved += quantity_estimated`
3. Insert `inventory_transactions` with type `'reserve'`
4. For foam: `foam_stock.*_reserved += estimated sets`

### complete_job(estimate_id, actuals)
1. Set `estimates.execution_status = 'Completed'`
2. For each material line:
   - `warehouse_stock.quantity_reserved -= quantity_estimated`
   - `warehouse_stock.quantity_on_hand -= quantity_actual`
   - Insert `inventory_transactions` with type `'consume'`
   - If delta (actual vs estimated) != 0: insert `'adjust'` transaction
3. For foam: same reserve→consume logic, update `lifetime_usage`

## Auth Model

### Signup (Admin)
1. `supabase.auth.signUp(email, password)`
2. Database trigger creates: `companies` row, `profiles` row (role: admin), `foam_stock` defaults, `company_settings` defaults

### Admin Adds Crew
1. Admin invites crew via Edge Function calling `auth.admin.inviteUserByEmail()`
2. Creates `profiles` row (role: crew, same `company_id`)
3. Crew sets password via invite link

### Login
1. Both roles use email/password via `supabase.auth.signInWithPassword()`
2. App reads `profiles.role` to determine UI (admin → full app, crew → CrewDashboard)

### RLS Pattern
```sql
-- Every table:
CREATE POLICY "tenant_isolation" ON <table>
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Crew restrictions: read-only on most tables, can only update estimates in 'Work Order' status
```

## File Storage

```
Supabase Storage bucket: company-files (private)
├── {company_id}/pdfs/{estimate_id}.pdf
├── {company_id}/photos/{estimate_id}/{filename}
└── {company_id}/logos/{filename}

RLS: users can only access paths under their company_id
```

## Sync Model (replaces GAS blob sync)

- **Reads**: Direct per-table queries via Supabase client
- **Writes**: Direct per-row inserts/updates
- **Real-time**: Supabase subscriptions on `estimates` table for live crew↔admin updates
- **Offline**: localStorage fallback, queue writes, flush on reconnect

## Files Deleted
- `backend/Code.js` — entire GAS backend
- `services/api.ts` — GAS API client
- `hooks/useSync.ts` — blob sync hook

## Files Created
- `lib/supabase.ts` — client initialization
- `hooks/useEstimatesQuery.ts` — estimate CRUD + subscriptions
- `hooks/useCustomersQuery.ts` — customer CRUD
- `hooks/useWarehouse.ts` — inventory + foam stock queries
- `hooks/useRealtimeSync.ts` — real-time subscription manager
- `services/storage.ts` — file upload/download helpers

## Phase 2 (Future)
- Purchase orders table + UI
- Material usage log table
- Crew time logging
- P&L reports from `financials` data
- Push notifications (PWA web push when jobs assigned/completed)
