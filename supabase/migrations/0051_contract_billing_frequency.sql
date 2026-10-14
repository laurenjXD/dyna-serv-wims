CREATE TYPE public.billing_frequency AS ENUM ('weekly', 'monthly', 'daily', 'per_ar', 'per_transaction');
ALTER TABLE public.contracts ADD COLUMN billing_frequency public.billing_frequency NOT NULL DEFAULT 'monthly';
