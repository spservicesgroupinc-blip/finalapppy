# Supabase Setup Guide

## Quick Setup (5 minutes)

### Step 1: Run Database Migrations

1. Go to your Supabase Dashboard: https://app.supabase.com/project/sgtkunigahgzdtkngzzu
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Open the file `supabase/setup.sql` from this project
5. **Copy the entire contents** and paste into the SQL Editor
6. Click **Run** (or press Ctrl+Enter)
7. You should see "SUCCESS. No rows returned" - this is expected!

### Step 2: Verify Setup

In the Supabase Dashboard:

1. Go to **Authentication → Users** - should be empty (no users yet)
2. Go to **Table Editor** - you should see these tables:
   - companies
   - profiles
   - company_settings
   - foam_stock
   - customers
   - estimates
   - warehouse_stock
   - estimate_materials
   - inventory_transactions

### Step 3: Test Login/Signup

1. Start the dev server (should already be running)
2. Open http://localhost:5173 in your browser
3. Click **"Don't have an account? Sign up"**
4. Fill in:
   - **Email**: your email (e.g., test@example.com)
   - **Password**: create a password (min 6 characters)
   - **Company Name**: your company (e.g., "Acme Insulation")
   - **Your Name**: your name (e.g., "John Doe")
5. Click **Create Account**

### Step 4: Verify User Created

After signup, go back to Supabase Dashboard:

1. **Authentication → Users** - you should see your new user
2. **Table Editor → profiles** - you should see a profile with role "admin"
3. **Table Editor → companies** - you should see your company
4. **Table Editor → company_settings** - default settings created
5. **Table Editor → foam_stock** - initial stock (all zeros) created

## What Was Set Up

### Tables Created
- **companies**: Your organization (tenant)
- **profiles**: User profiles linked to auth.users
- **company_settings**: Default yields, costs, pricing
- **foam_stock**: Open/Closed cell foam inventory
- **customers**: Customer database
- **estimates**: Foam estimates and work orders
- **warehouse_stock**: Inventory items
- **estimate_materials**: Materials per estimate
- **inventory_transactions**: Audit log for inventory

### Security (RLS)
Row Level Security ensures:
- Users only see data from their own company
- Admins can manage everything
- Crew can only update Work Orders

### Automatic Triggers
- **handle_new_user**: Creates company + profile when user signs up
- **update_updated_at**: Updates timestamps on modified records

### Functions
- **convert_to_work_order**: Reserves inventory when estimate becomes work order
- **complete_job**: Consumes inventory and reconciles actuals
- **get_my_company_id**: Helper to get user's company
- **get_my_role**: Helper to get user's role

## Environment Variables

The `.env` file is already configured with your Supabase credentials:

```
VITE_SUPABASE_URL=https://sgtkunigahgzdtkngzzu.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Troubleshooting

### "Profile not found" error
- The `handle_new_user` trigger should auto-create profiles
- Check if the trigger exists: Run `SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created'`

### "relation does not exist" error
- Tables weren't created - re-run the setup.sql file

### Can't sign up
- Check browser console for errors
- Verify `.env` file has correct Supabase URL and anon key
- Make sure email confirmation is disabled in Supabase (Authentication → Settings → Disable email confirmations for development)

## Next Steps

1. **Disable Email Confirmation** (for development):
   - Go to Authentication → Settings
   - Scroll to "Email Auth"
   - Uncheck "Enable email confirmations"

2. **Add Crew Members**:
   - After logging in as admin, you can invite crew members
   - Crew accounts are created with a company ID and PIN

3. **Configure Company Settings**:
   - Update yields, costs, and pricing in the app
   - Settings are stored in `company_settings` table

## Security Notes

⚠️ **Never share the service_role key** - it bypasses all security rules!
- The `.env` file only contains the `anon` key (safe for client-side)
- Service role key is only for server-side Edge Functions
