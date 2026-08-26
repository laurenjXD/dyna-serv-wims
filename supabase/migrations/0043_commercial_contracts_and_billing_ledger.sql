-- Migration 0043: Commercial Contracts, Configurable Pricing Rules, Double-Entry Billing Ledger, and SOA Document Packages

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE contract_status AS ENUM ('draft', 'pending_approval', 'active', 'suspended', 'expired', 'terminated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE contract_type AS ENUM ('vmi', 'trading', 'vmi_trading');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE billing_basis AS ENUM ('cbm_day', 'pallet', 'carton', 'unit', 'transaction', 'flat', 'trip', 'distance', 'weight', 'volume', 'hour', 'percentage');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE charge_category AS ENUM ('warehousing', 'handling_in', 'handling_out', 'delivery', 'documentation', 'loa', 'manpower', 'other', 'trading');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_ownership AS ENUM ('supplier_owned', 'customer_owned', 'warehouse_owned');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE billing_trigger AS ENUM ('upon_receipt', 'upon_consumption', 'upon_dispatch', 'upon_customer_confirmation', 'monthly_settlement');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE markup_type AS ENUM ('percentage', 'fixed_amount', 'fixed_selling_price');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE billing_event_status AS ENUM ('pending', 'processed', 'voided');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_entry_type AS ENUM ('debit', 'credit', 'adjustment', 'reversal', 'void', 'credit_memo', 'debit_memo');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE billing_period_status AS ENUM ('draft', 'billing_review', 'approved', 'posted', 'finalized', 'voided');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE billing_document_type AS ENUM ('soa', 'delivery_detail', 'loa_detail', 'surety_bond_detail', 'manpower_detail', 'summary_of_charges', 'warehousing_detail');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Tables

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number VARCHAR(50) NOT NULL UNIQUE,
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  contract_type contract_type NOT NULL DEFAULT 'vmi_trading',
  status contract_status NOT NULL DEFAULT 'draft',
  effective_date DATE NOT NULL,
  expiration_date DATE,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  exchange_rate_policy VARCHAR(50) NOT NULL DEFAULT 'monthly_rate',
  payment_terms VARCHAR(100) NOT NULL DEFAULT 'Net 30',
  warehouses_covered TEXT DEFAULT 'Main Warehouse',
  notes TEXT,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS contracts_party_id_idx ON contracts(party_id);
CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts(status);

CREATE TABLE IF NOT EXISTS contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  effective_from TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  effective_to TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  changes_summary TEXT,
  approved_by_user_id UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS contract_versions_contract_id_idx ON contract_versions(contract_id);

CREATE TABLE IF NOT EXISTS contract_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'principal',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version_id UUID NOT NULL REFERENCES contract_versions(id) ON DELETE CASCADE,
  charge_name VARCHAR(150) NOT NULL,
  charge_code VARCHAR(50) NOT NULL,
  charge_category charge_category NOT NULL,
  billing_basis billing_basis NOT NULL,
  rate NUMERIC(12, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  min_charge NUMERIC(12, 4),
  max_charge NUMERIC(12, 4),
  priority INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  is_taxable BOOLEAN DEFAULT TRUE NOT NULL,
  effective_from DATE,
  expiration_date DATE,
  applicable_warehouse VARCHAR(100),
  applicable_customer UUID REFERENCES parties(id),
  applicable_product_category VARCHAR(100),
  applicable_service VARCHAR(100),
  applicable_transaction_type VARCHAR(50),
  conditions_json TEXT,
  calculation_formula TEXT,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS pricing_rules_contract_version_id_idx ON pricing_rules(contract_version_id);
CREATE INDEX IF NOT EXISTS pricing_rules_charge_category_idx ON pricing_rules(charge_category);

CREATE TABLE IF NOT EXISTS vmi_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version_id UUID NOT NULL REFERENCES contract_versions(id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  inventory_ownership inventory_ownership NOT NULL DEFAULT 'supplier_owned',
  billing_trigger billing_trigger NOT NULL DEFAULT 'upon_consumption',
  min_stock NUMERIC(12, 4),
  max_stock NUMERIC(12, 4),
  reorder_point NUMERIC(12, 4),
  lead_time_days INTEGER DEFAULT 7,
  replenishment_method VARCHAR(50) DEFAULT 'min_max',
  settlement_timing VARCHAR(50) DEFAULT 'monthly',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS vmi_configurations_contract_version_id_idx ON vmi_configurations(contract_version_id);
CREATE INDEX IF NOT EXISTS vmi_configurations_party_id_idx ON vmi_configurations(party_id);

CREATE TABLE IF NOT EXISTS trading_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version_id UUID NOT NULL REFERENCES contract_versions(id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  supplier_cost NUMERIC(12, 4) NOT NULL,
  selling_price NUMERIC(12, 4) NOT NULL,
  markup_type markup_type NOT NULL DEFAULT 'percentage',
  markup_value NUMERIC(10, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  min_order_quantity NUMERIC(12, 4),
  effective_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS trading_prices_contract_version_id_idx ON trading_prices(contract_version_id);
CREATE INDEX IF NOT EXISTS trading_prices_party_item_idx ON trading_prices(party_id, item_id);

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_transaction_id VARCHAR(100) NOT NULL,
  source_transaction_type VARCHAR(50) NOT NULL,
  contract_id UUID REFERENCES contracts(id),
  contract_version_id UUID REFERENCES contract_versions(id),
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  charge_category VARCHAR(50) NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL,
  unit VARCHAR(30) NOT NULL,
  rate NUMERIC(12, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  amount_usd NUMERIC(14, 4) NOT NULL,
  tax_amount_usd NUMERIC(14, 4) DEFAULT 0.0000,
  billing_period_id UUID,
  status billing_event_status NOT NULL DEFAULT 'pending',
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_events_party_id_idx ON billing_events(party_id);
CREATE INDEX IF NOT EXISTS billing_events_source_idx ON billing_events(source_transaction_id, source_transaction_type);
CREATE INDEX IF NOT EXISTS billing_events_status_idx ON billing_events(status);

CREATE TABLE IF NOT EXISTS billing_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  reference_number VARCHAR(100) NOT NULL,
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id),
  billing_event_id UUID REFERENCES billing_events(id),
  entry_type ledger_entry_type NOT NULL,
  charge_category VARCHAR(50) NOT NULL,
  debit_amount_usd NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  credit_amount_usd NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(10, 4) NOT NULL DEFAULT 1.0000,
  notes TEXT,
  billing_period_id UUID,
  locked_at TIMESTAMP WITH TIME ZONE,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_ledger_party_id_idx ON billing_ledger(party_id);
CREATE INDEX IF NOT EXISTS billing_ledger_entry_date_idx ON billing_ledger(entry_date);
CREATE INDEX IF NOT EXISTS billing_ledger_period_id_idx ON billing_ledger(billing_period_id);

CREATE TABLE IF NOT EXISTS soas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soa_number VARCHAR(50) NOT NULL UNIQUE,
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES contracts(id),
  billing_period_id UUID NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(10, 4) NOT NULL,
  opening_balance_usd NUMERIC(14, 4) NOT NULL,
  current_charges_usd NUMERIC(14, 4) NOT NULL,
  debit_adjustments_usd NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  credits_usd NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  payments_applied_usd NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
  outstanding_balance_usd NUMERIC(14, 4) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  generated_by_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS soas_party_id_idx ON soas(party_id);
CREATE INDEX IF NOT EXISTS soas_billing_period_id_idx ON soas(billing_period_id);

CREATE TABLE IF NOT EXISTS soa_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soa_id UUID NOT NULL REFERENCES soas(id) ON DELETE CASCADE,
  charge_category VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  amount_usd NUMERIC(14, 4) NOT NULL,
  ledger_entry_id UUID REFERENCES billing_ledger(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS soa_lines_soa_id_idx ON soa_lines(soa_id);

CREATE TABLE IF NOT EXISTS billing_document_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soa_id UUID NOT NULL REFERENCES soas(id) ON DELETE CASCADE,
  document_type billing_document_type NOT NULL,
  document_number VARCHAR(50) NOT NULL,
  generated_file_url TEXT,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  generated_by_user_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS billing_document_packages_soa_id_idx ON billing_document_packages(soa_id);

CREATE TABLE IF NOT EXISTS credit_debit_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_number VARCHAR(50) NOT NULL UNIQUE,
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id),
  billing_period_id UUID,
  type VARCHAR(20) NOT NULL,
  amount_usd NUMERIC(14, 4) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'issued',
  issued_by_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS credit_debit_memos_party_id_idx ON credit_debit_memos(party_id);
