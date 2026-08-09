// Action-layer validation entry point for WRR creation input.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5.1 — expected line fields
//   specs/07-incoming-receiving/design.md §5.2 — scan-line state discrepancy rules
//   specs/07-incoming-receiving/design.md §7.1 — disposition: 'store' | 'inspect'
//   specs/07-incoming-receiving/requirements.md R1.3 — validated before staging
//
// Business logic lives in lib/receiving/wrr-schema.ts; this module is the
// stable import point for callers that live in lib/actions/ (e.g. the receiving
// server action and any future actions that need to pre-validate WRR input
// without importing from the receiving sub-package directly).

export {
  validateCreateWrr,
} from "@/lib/receiving/wrr-schema";

export type {
  CreateWrrInput,
  CreateWrrLine,
  CreateWrrResult,
} from "@/lib/receiving/wrr-schema";
