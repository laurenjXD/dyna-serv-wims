DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'billing_frequency'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.billing_frequency AS ENUM ('weekly', 'monthly', 'daily', 'per_ar', 'per_transaction');
  END IF;

  -- `contracts` is deployment-specific and is not part of this repository's
  -- canonical schema. Apply the additive column wherever that optional table
  -- exists, but never make a clean canonical install fail because it does not.
  IF to_regclass('public.contracts') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'contracts'
         AND column_name = 'billing_frequency'
     ) THEN
    ALTER TABLE public.contracts
      ADD COLUMN billing_frequency public.billing_frequency NOT NULL DEFAULT 'monthly';
  END IF;
END
$$;
