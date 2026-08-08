import { z } from "zod";

// Non-negative decimal string: matches strings like "0", "0.5", "10.000"
// Rejects negatives, non-numeric strings, and bare JS numbers.
const nonNegativeDecimalString = z
  .string()
  .refine(
    (val) => /^\d+(\.\d+)?$/.test(val) && parseFloat(val) >= 0,
    { message: "Must be a non-negative decimal string (e.g. '10.500')" },
  );

/**
 * FifoOverrideSnapshotSchema — validated JSONB payload for fifo_override requests.
 *
 * Field names align with canonical 01-core-data-model column names per design.md §3.
 */
export const FifoOverrideSnapshotSchema = z.object({
  item_id: z.string().min(1),
  item_code: z.string().min(1),
  lot_id: z.string().min(1),
  lot_number: z.string().min(1),
  location_id: z.string().min(1),
  location_code: z.string().min(1),
  requested_qty: nonNegativeDecimalString,
  available_qty_at_request: nonNegativeDecimalString,
  flow_type: z.enum(["vmi", "trading", "supplies"]),
  actor_user_id: z.string().min(1),
  reason: z.string().min(10, { message: "reason must be at least 10 characters" }),
  // allocation_version is a positive integer — zero and negatives are invalid, decimals are invalid.
  allocation_version: z
    .number()
    .int({ message: "allocation_version must be an integer" })
    .positive({ message: "allocation_version must be a positive integer" }),
  requested_at: z.string().min(1),
});

export type FifoOverrideSnapshot = z.infer<typeof FifoOverrideSnapshotSchema>;
