-- specs/12-vmi-billing D.9 / specs/04 §22 / specs/10 generated_documents.
-- Extend the single immutable document projection model for VMI's four
-- period-level artifacts. Their source is a vmi_billing_period rather than an
-- inventory commitment; no public storage path or new document table exists.

ALTER TABLE public.generated_documents
  DROP CONSTRAINT IF EXISTS generated_documents_type_check;
--> statement-breakpoint

ALTER TABLE public.generated_documents
  ADD CONSTRAINT generated_documents_type_check
  CHECK (document_type IN (
    'pick_list',
    'acknowledgement_receipt',
    'vmi_billing_statement',
    'vmi_warehousing_charges',
    'vmi_statement_of_account',
    'vmi_letter_of_authority'
  ));
--> statement-breakpoint

ALTER TABLE public.generated_documents
  DROP CONSTRAINT IF EXISTS generated_documents_source_type_check;
--> statement-breakpoint

ALTER TABLE public.generated_documents
  ADD CONSTRAINT generated_documents_source_type_check
  CHECK (source_type IN (
    'inventory_commitment',
    'inventory_transaction',
    'vmi_billing_period'
  ));
