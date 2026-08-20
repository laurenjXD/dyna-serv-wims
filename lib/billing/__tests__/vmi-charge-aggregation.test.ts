// RED-step tests for lib/billing/vmi-charge-aggregation.ts (does not exist
// yet — Task D.3, from-scratch module).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md Task Group D, D.3 — "Implement
//     documentation/delivery aggregation — Sums vmi_charge_lines by type
//     within the period; converts delivery PHP total to USD via the
//     period's locked FX rate. Verified: ₱40,896.00 / 61.71 = $662.71."
//   specs/12-vmi-billing/design.md §2.4 — the exact algorithm under test:
//       "documentation_usd = SUM(vmi_charge_lines.amount WHERE charge_type
//         = 'documentation' AND charge_date within period)
//         -- Each row defaults to contract.documentation_default_rate_usd
//         at entry time (source = 'auto') but is independently editable
//         per line (still source = 'auto' — 'manual' is reserved for
//         charge types with no contract-derived default at all, i.e.
//         delivery and every ad-hoc type).
//       delivery_php = SUM(vmi_charge_lines.amount WHERE charge_type =
//         'delivery' AND currency = 'PHP' AND charge_date within period)
//       delivery_usd = delivery_php / period.locked_exchange_rate_php"
//     Verified: ₱40,896.00 / 61.71 = 662.71, exact.
//   specs/12-vmi-billing/design.md §2.5 — ad-hoc charge aggregation:
//       "ad_hoc_charges_usd = SUM(vmi_charge_lines.amount WHERE charge_type
//         IN ('handling_and_stripping','cargo_transfer_fee','rtv',
//         'admin_fee','insurance','other') AND charge_date within period,
//         converted to USD)"
//   specs/12-vmi-billing/requirements.md FR-4.3/4.4 — Delivery is always a
//     manual entry in PHP, converted at the period's locked FX rate;
//     Documentation/Delivery/ad-hoc are all vmi_charge_lines rows.
//     "Warehousing and Handling are never represented as vmi_charge_lines;
//     they are always sourced from movement-replay aggregates" — the
//     acceptance criterion the defensive enum test (below) protects.
//   specs/12-vmi-billing/requirements.md FR-6.3 — "summing all nine of
//     June's real line items reproduces the statement's $3,023.80 grand
//     total exactly" (the delivery component of that sum is this module's
//     own $662.71 regression case).
//   specs/12-vmi-billing/tasks.md Task Group G, G.5 — "June fixture delivery
//     total | ₱40,896.00 / 61.71 = $662.71 exactly"; "Warehousing
//     charge_type submitted to vmi_charge_lines | Rejected by the
//     application-layer validator (design.md §1.4)" (D.2's own concern, not
//     re-tested here — but the enum genuinely contains no such value, which
//     this file's defensive test independently verifies at the aggregation
//     layer per requirements.md FR-4.4).
//
// Acceptance criterion under test (requirements.md FR-4.3/4.4, design.md
// §2.4/§2.5, tasks.md D.3/G.5): documentation/delivery/ad-hoc totals are
// period + party scoped SUMs over vmi_charge_lines, with delivery (and any
// future non-USD ad-hoc line) converted to USD via the period's locked FX
// rate — never Warehousing/Handling, which never appear in this table at
// all (FR-4.1/4.4).
//
// ---------------------------------------------------------------------------
// SCHEMA/DEPENDENCY VERIFICATION PERFORMED BEFORE WRITING THIS FILE:
//
//   lib/db/schema/vmi_billing.ts:
//     vmiChargeLines: partyId, chargeType (vmi_charge_type enum:
//       'documentation' | 'delivery' | 'handling_and_stripping' |
//       'cargo_transfer_fee' | 'rtv' | 'admin_fee' | 'insurance' | 'other'
//       — NO 'handling'/'warehousing' value exists in this enum at all),
//       amount (decimal, serializes as string from the DB), currency
//       (varchar(3): 'PHP' for delivery, 'USD' for everything else per the
//       column comment), chargeDate (date, 'YYYY-MM-DD').
//     vmiBillingPeriods.lockedExchangeRatePhp — the period's immutably
//       locked FX rate this module's delivery/ad-hoc conversion consumes
//       (never a live/current forex_rates read at aggregation time).
//
//   lib/actions/vmi-charge-lines.ts (Task D.2, already implemented) —
//     VERIFIED (not assumed) how currency is actually resolved per charge
//     type at entry time, per its own resolveNonDocumentationCharge():
//       function resolveNonDocumentationCharge(chargeType, amount) {
//         if (chargeType === "delivery") return { amount, currency: "PHP", source: "manual" };
//         return { amount, currency: "USD", source: "manual" }; // every ad-hoc type
//       }
//     Confirms: as currently implemented, every ad-hoc charge_type (and
//     documentation) is hard-written as currency='USD' — there is no live
//     path today that ever writes a PHP-denominated ad-hoc row. This
//     module's aggregation function nonetheless accepts the period's locked
//     FX rate and applies row-level currency-aware conversion (never
//     assuming "ad-hoc is always USD" as a hardcoded invariant baked into
//     the SUM itself), per design.md §2.5's literal "converted to USD"
//     wording and this task's explicit instruction to future-proof against
//     a PHP-denominated ad-hoc line if D.2's currency resolution is ever
//     extended. The "USD sums straight, no division" case and the
//     "hypothetical PHP ad-hoc line IS converted" case are both tested
//     below as distinct, independently meaningful assertions.
//
//   lib/billing/vmi-handling.ts (Task D.1, most recent sibling aggregation
//     module) — mirrored for module shape/style: a pure compute function
//     over already-typed rows, plus a thin `db`-injected DB-facing
//     orchestration function (VmiXDbLike = { select: (...args: any[]) =>
//     any }), decimal-string raw rows mapped to numbers before the pure
//     layer runs, real drizzle-orm `and`/`eq`/`between` used in the
//     DB-facing query the same way getVmiHandlingForPeriod does.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/billing/vmi-charge-aggregation.ts (for
// backend-builder), established by this RED step:
//
//   export const AD_HOC_VMI_CHARGE_TYPES = [
//     "handling_and_stripping", "cargo_transfer_fee", "rtv", "admin_fee",
//     "insurance", "other",
//   ] as const;
//
//   export type VmiChargeLineForAggregation = {
//     partyId: string;
//     chargeType: string; // trusted string, not narrowed to the DB enum —
//                          // see the defensive enum-safety test below
//     amount: number;
//     currency: string; // 'USD' | 'PHP'
//     chargeDate: string; // 'YYYY-MM-DD'
//   };
//
//   export type VmiChargeAggregationScope = {
//     partyId: string;
//     periodStartDate: string; // 'YYYY-MM-DD', inclusive
//     periodEndDate: string;   // 'YYYY-MM-DD', inclusive
//     lockedExchangeRatePhp: number;
//   };
//
//   export type VmiChargeAggregationResult = {
//     documentationUsd: number;
//     deliveryPhp: number;
//     deliveryUsd: number;
//     adHocChargesUsd: number;
//   };
//
//   // Pure. Filters chargeLines to (partyId match) AND (chargeDate within
//   // [periodStartDate, periodEndDate] inclusive) BEFORE summing by type —
//   // this filtering is itself the party/period scoping this module must
//   // guarantee even if a caller's SQL layer ever under-filters (see the
//   // "belt-and-suspenders" DB-facing test below).
//   export function computeVmiChargeAggregation(
//     chargeLines: VmiChargeLineForAggregation[],
//     scope: VmiChargeAggregationScope,
//   ): VmiChargeAggregationResult;
//
//   // DB-facing, thin orchestration layer (same "db injected explicitly"
//   // precedent as vmi-handling.ts's getVmiHandlingForPeriod):
//   //   1. db.select(...).from(vmiChargeLines).where(partyId, chargeDate
//   //      BETWEEN periodStartDate/periodEndDate) -> raw charge-line rows.
//   //   2. Map decimal-string amount -> number.
//   //   3. computeVmiChargeAggregation(mappedRows, scope).
//   export type VmiChargeAggregationDbLike = { select: (...args: any[]) => any };
//   export async function getVmiChargeAggregationForPeriod(
//     db: VmiChargeAggregationDbLike,
//     scope: VmiChargeAggregationScope,
//   ): Promise<VmiChargeAggregationResult>;
//
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";
import {
  computeVmiChargeAggregation,
  getVmiChargeAggregationForPeriod,
  AD_HOC_VMI_CHARGE_TYPES,
  type VmiChargeLineForAggregation,
  type VmiChargeAggregationScope,
} from "../vmi-charge-aggregation";
import { vmiChargeLines } from "@/lib/db/schema/vmi_billing";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const PARTY_A = "party-a";
const PARTY_B = "party-b";

function baseScope(overrides: Partial<VmiChargeAggregationScope> = {}): VmiChargeAggregationScope {
  return {
    partyId: PARTY_A,
    periodStartDate: "2026-06-01",
    periodEndDate: "2026-06-30",
    lockedExchangeRatePhp: 61.71,
    ...overrides,
  };
}

function chargeLine(
  overrides: Partial<VmiChargeLineForAggregation> = {},
): VmiChargeLineForAggregation {
  return {
    partyId: PARTY_A,
    chargeType: "documentation",
    amount: 10,
    currency: "USD",
    chargeDate: "2026-06-05",
    ...overrides,
  };
}

// Raw DB row shape (decimal columns serialize as strings) — mirrors
// vmi-handling.test.ts's rawLedgerRow()/rawHandlingContractVersion()
// precedent exactly.
function rawChargeLineRow(overrides: Record<string, unknown> = {}) {
  return {
    partyId: PARTY_A,
    chargeType: "documentation",
    amount: "10.0000",
    currency: "USD",
    chargeDate: "2026-06-05",
    ...overrides,
  };
}

// Minimal chainable mock query builder — same call-order-based pattern as
// vmi-handling.test.ts's makeChain.
function makeChain(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  const resolved = Promise.resolve(rows);
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  chain.finally = resolved.finally.bind(resolved);
  return chain;
}

function createMockDb() {
  return { select: vi.fn() };
}

// ---------------------------------------------------------------------------
// computeVmiChargeAggregation — pure filter + sum layer.
// ---------------------------------------------------------------------------

describe("computeVmiChargeAggregation (D.3, pure filter+sum)", () => {
  // -------------------------------------------------------------------
  // 1. Documentation aggregation (design.md §2.4).
  // -------------------------------------------------------------------
  describe("documentation aggregation (AC: design.md §2.4 / FR-4.2)", () => {
    it("sums only charge_type = 'documentation' rows within the period, ignoring every other type", () => {
      const result = computeVmiChargeAggregation(
        [
          chargeLine({ chargeType: "documentation", amount: 10 }),
          chargeLine({ chargeType: "documentation", amount: 0 }), // real fixture's genuine $0.00 override (FR-4.2)
          chargeLine({ chargeType: "documentation", amount: 5.5 }),
          chargeLine({ chargeType: "delivery", amount: 40896, currency: "PHP" }),
          chargeLine({ chargeType: "rtv", amount: 100 }),
        ],
        baseScope(),
      );

      // 10 + 0 + 5.5 = 15.5 — delivery/rtv rows must NOT bleed into this total.
      expect(result.documentationUsd).toBeCloseTo(15.5, 4);
    });

    it("includes a genuine $0.00 override row in the sum rather than treating it as absent (FR-4.2's evidenced real-fixture behavior)", () => {
      const result = computeVmiChargeAggregation(
        [chargeLine({ chargeType: "documentation", amount: 0 })],
        baseScope(),
      );

      expect(result.documentationUsd).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // 2. Delivery aggregation with FX conversion — THE REAL JUNE FIXTURE
  //    REGRESSION CASE (tasks.md D.3's own citation, G.5's exact pass
  //    condition): ₱40,896.00 / 61.71 = $662.71, exact.
  // -------------------------------------------------------------------
  describe("delivery aggregation with FX conversion (AC: design.md §2.4 / FR-4.3 / tasks.md D.3,G.5)", () => {
    it(
      "(AC: THE REAL JUNE FIXTURE REGRESSION CASE) sums PHP delivery lines " +
        "for the period and divides by the period's locked_exchange_rate_php " +
        "to reproduce ₱40,896.00 / 61.71 = $662.71 exactly",
      () => {
        const result = computeVmiChargeAggregation(
          [
            // Batched by date + consignee per FR-4.3's real evidence — split
            // across multiple DR-linked delivery lines that sum to the real
            // fixture's ₱40,896.00 total.
            chargeLine({ chargeType: "delivery", amount: 15000, currency: "PHP", chargeDate: "2026-06-03" }),
            chargeLine({ chargeType: "delivery", amount: 18396, currency: "PHP", chargeDate: "2026-06-12" }),
            chargeLine({ chargeType: "delivery", amount: 7500, currency: "PHP", chargeDate: "2026-06-25" }),
          ],
          baseScope({ lockedExchangeRatePhp: 61.71 }),
        );

        expect(result.deliveryPhp).toBeCloseTo(40896.0, 2);
        expect(result.deliveryUsd).toBeCloseTo(662.71, 2);
      },
    );

    it("sums only charge_type = 'delivery' rows, ignoring documentation/ad-hoc rows entirely", () => {
      const result = computeVmiChargeAggregation(
        [
          chargeLine({ chargeType: "delivery", amount: 6171, currency: "PHP" }),
          chargeLine({ chargeType: "documentation", amount: 999 }),
          chargeLine({ chargeType: "admin_fee", amount: 999 }),
        ],
        baseScope({ lockedExchangeRatePhp: 61.71 }),
      );

      expect(result.deliveryPhp).toBeCloseTo(6171, 4);
      expect(result.deliveryUsd).toBeCloseTo(100, 4); // 6171 / 61.71 = 100
    });
  });

  // -------------------------------------------------------------------
  // 3. Ad-hoc charge aggregation (design.md §2.5).
  // -------------------------------------------------------------------
  describe("ad-hoc charge aggregation (AC: design.md §2.5)", () => {
    it("sums every ad-hoc charge_type in the enum's open list (handling_and_stripping, cargo_transfer_fee, rtv, admin_fee, insurance, other) as a straight USD sum, since D.2 currently hard-writes currency='USD' for every ad-hoc type", () => {
      const chargeLines = AD_HOC_VMI_CHARGE_TYPES.map((type, index) =>
        chargeLine({ chargeType: type, amount: (index + 1) * 10, currency: "USD" }),
      );
      // 10 + 20 + 30 + 40 + 50 + 60 = 210
      const result = computeVmiChargeAggregation(chargeLines, baseScope());

      expect(result.adHocChargesUsd).toBeCloseTo(210, 4);
    });

    it(
      "(AC: task's own explicit instruction — accept a locked FX rate " +
        "for ad-hoc even though no currently-evidenced case needs it) " +
        "converts a hypothetical PHP-denominated ad-hoc line at the " +
        "period's locked_exchange_rate_php, proving the function does not " +
        "hardcode 'ad-hoc is always USD' into the SUM itself",
      () => {
        const result = computeVmiChargeAggregation(
          [chargeLine({ chargeType: "insurance", amount: 6171, currency: "PHP" })],
          baseScope({ lockedExchangeRatePhp: 61.71 }),
        );

        expect(result.adHocChargesUsd).toBeCloseTo(100, 4); // 6171 / 61.71
      },
    );

    it("does not include documentation or delivery rows in ad_hoc_charges_usd", () => {
      const result = computeVmiChargeAggregation(
        [
          chargeLine({ chargeType: "documentation", amount: 500 }),
          chargeLine({ chargeType: "delivery", amount: 500, currency: "PHP" }),
          chargeLine({ chargeType: "rtv", amount: 25 }),
        ],
        baseScope(),
      );

      expect(result.adHocChargesUsd).toBeCloseTo(25, 4);
    });
  });

  // -------------------------------------------------------------------
  // 4. Party/period scoping.
  // -------------------------------------------------------------------
  describe("party/period scoping (AC: design.md §2.4/§2.5's 'AND charge_date within period', and the implicit party scope every VMI billing table carries)", () => {
    it("excludes charge lines belonging to a different party from every aggregate", () => {
      const result = computeVmiChargeAggregation(
        [
          chargeLine({ partyId: PARTY_A, chargeType: "documentation", amount: 10 }),
          chargeLine({ partyId: PARTY_B, chargeType: "documentation", amount: 9999 }),
          chargeLine({ partyId: PARTY_B, chargeType: "delivery", amount: 9999, currency: "PHP" }),
          chargeLine({ partyId: PARTY_B, chargeType: "rtv", amount: 9999 }),
        ],
        baseScope({ partyId: PARTY_A }),
      );

      expect(result.documentationUsd).toBeCloseTo(10, 4);
      expect(result.deliveryPhp).toBe(0);
      expect(result.deliveryUsd).toBe(0);
      expect(result.adHocChargesUsd).toBe(0);
    });

    it("excludes charge lines dated before periodStartDate or after periodEndDate", () => {
      const result = computeVmiChargeAggregation(
        [
          chargeLine({ chargeType: "documentation", amount: 10, chargeDate: "2026-05-31" }), // before period
          chargeLine({ chargeType: "documentation", amount: 20, chargeDate: "2026-06-01" }), // on start boundary — included
          chargeLine({ chargeType: "documentation", amount: 30, chargeDate: "2026-06-30" }), // on end boundary — included
          chargeLine({ chargeType: "documentation", amount: 40, chargeDate: "2026-07-01" }), // after period
        ],
        baseScope({ periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" }),
      );

      // Only the two boundary-inclusive rows (20 + 30 = 50) count.
      expect(result.documentationUsd).toBeCloseTo(50, 4);
    });

    it("excludes an out-of-range delivery row from both deliveryPhp and deliveryUsd", () => {
      const result = computeVmiChargeAggregation(
        [
          chargeLine({ chargeType: "delivery", amount: 61710, currency: "PHP", chargeDate: "2026-07-15" }), // outside period
          chargeLine({ chargeType: "delivery", amount: 6171, currency: "PHP", chargeDate: "2026-06-15" }), // inside period
        ],
        baseScope({ periodStartDate: "2026-06-01", periodEndDate: "2026-06-30", lockedExchangeRatePhp: 61.71 }),
      );

      expect(result.deliveryPhp).toBeCloseTo(6171, 4);
      expect(result.deliveryUsd).toBeCloseTo(100, 4);
    });
  });

  // -------------------------------------------------------------------
  // 5. Empty period.
  // -------------------------------------------------------------------
  describe("empty period (AC: zero charge lines produces zero aggregates, not an error)", () => {
    it("returns all-zero aggregates for an empty charge-line array, without throwing", () => {
      expect(() => computeVmiChargeAggregation([], baseScope())).not.toThrow();

      const result = computeVmiChargeAggregation([], baseScope());
      expect(result).toEqual({
        documentationUsd: 0,
        deliveryPhp: 0,
        deliveryUsd: 0,
        adHocChargesUsd: 0,
      });
    });

    it("returns a zero (not NaN/undefined) deliveryUsd even with zero delivery rows present but other charge types nonzero", () => {
      const result = computeVmiChargeAggregation(
        [chargeLine({ chargeType: "documentation", amount: 25 })],
        baseScope(),
      );

      expect(result.deliveryUsd).toBe(0);
      expect(Number.isNaN(result.deliveryUsd)).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // 6. Defensive test — warehousing/handling charge types (which don't
  //    exist in the real vmi_charge_type enum today, per D.2's validation)
  //    must never be picked up by the aggregation's own AD_HOC_VMI_CHARGE_TYPES
  //    membership check, even if such a value were ever passed in (e.g. a
  //    future careless enum extension).
  // -------------------------------------------------------------------
  describe(
    "defensive: warehousing/handling are never included, even by the " +
      "aggregation query's own logic (AC: requirements.md FR-4.1/4.4 — " +
      "'Warehousing and Handling are never represented as vmi_charge_lines')",
    () => {
      it("AD_HOC_VMI_CHARGE_TYPES itself contains neither 'warehousing' nor 'handling'", () => {
        expect(AD_HOC_VMI_CHARGE_TYPES).not.toContain("warehousing");
        expect(AD_HOC_VMI_CHARGE_TYPES).not.toContain("handling");
      });

      it(
        "a row with a hypothetical 'warehousing' or 'handling' chargeType " +
          "(never actually produced by the real enum, but defended against " +
          "here as a future-enum-extension safeguard) is excluded from " +
          "documentationUsd, deliveryPhp/deliveryUsd, AND adHocChargesUsd — " +
          "i.e. from every bucket, not just silently mis-bucketed into ad-hoc",
        () => {
          const result = computeVmiChargeAggregation(
            [
              chargeLine({ chargeType: "warehousing", amount: 9999 } as VmiChargeLineForAggregation),
              chargeLine({ chargeType: "handling", amount: 9999 } as VmiChargeLineForAggregation),
              chargeLine({ chargeType: "documentation", amount: 10 }),
            ],
            baseScope(),
          );

          expect(result.documentationUsd).toBeCloseTo(10, 4);
          expect(result.deliveryPhp).toBe(0);
          expect(result.deliveryUsd).toBe(0);
          expect(result.adHocChargesUsd).toBe(0);
        },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// getVmiChargeAggregationForPeriod — DB-facing orchestration.
// ---------------------------------------------------------------------------

describe("getVmiChargeAggregationForPeriod (D.3, DB-facing orchestration)", () => {
  it(
    "(AC: end-to-end wiring) queries vmi_charge_lines and returns the " +
      "correctly computed period aggregate, reproducing the real June " +
      "fixture's delivery figure ($662.71) via the full DB-facing path",
    async () => {
      const db = createMockDb();

      db.select.mockImplementationOnce(() =>
        makeChain([
          rawChargeLineRow({ chargeType: "documentation", amount: "10.0000", chargeDate: "2026-06-05" }),
          rawChargeLineRow({
            chargeType: "delivery",
            amount: "40896.0000",
            currency: "PHP",
            chargeDate: "2026-06-12",
          }),
          rawChargeLineRow({ chargeType: "rtv", amount: "50.0000", chargeDate: "2026-06-20" }),
        ]),
      );

      const result = await getVmiChargeAggregationForPeriod(
        db as never,
        baseScope({ lockedExchangeRatePhp: 61.71 }),
      );

      expect(result.documentationUsd).toBeCloseTo(10, 4);
      expect(result.deliveryPhp).toBeCloseTo(40896.0, 2);
      expect(result.deliveryUsd).toBeCloseTo(662.71, 2);
      expect(result.adHocChargesUsd).toBeCloseTo(50, 4);
    },
  );

  it("queries the vmi_charge_lines table (not some other table) via db.select(...).from(...)", async () => {
    const db = createMockDb();
    const fromCalls: unknown[] = [];

    db.select.mockImplementation(() => {
      const chain = makeChain([]);
      const originalFrom = chain.from;
      chain.from = vi.fn((table: unknown) => {
        fromCalls.push(table);
        return originalFrom(table);
      });
      return chain;
    });

    await getVmiChargeAggregationForPeriod(db as never, baseScope());

    expect(fromCalls).toContain(vmiChargeLines);
  });

  it(
    "(AC: belt-and-suspenders party/period scoping) even if the mocked " +
      "DB layer returns rows for another party and outside the date range " +
      "(simulating an under-filtered query), the returned aggregate is " +
      "still correctly scoped to the requested party/period — the pure " +
      "compute layer's own filtering is the actual scoping guarantee, not " +
      "merely trust in the SQL WHERE clause",
    async () => {
      const db = createMockDb();

      db.select.mockImplementationOnce(() =>
        makeChain([
          rawChargeLineRow({
            partyId: PARTY_A,
            chargeType: "documentation",
            amount: "10.0000",
            chargeDate: "2026-06-05",
          }),
          rawChargeLineRow({
            partyId: PARTY_B, // different party — must be excluded
            chargeType: "documentation",
            amount: "9999.0000",
            chargeDate: "2026-06-05",
          }),
          rawChargeLineRow({
            partyId: PARTY_A,
            chargeType: "documentation",
            amount: "9999.0000",
            chargeDate: "2026-07-15", // outside the period — must be excluded
          }),
        ]),
      );

      const result = await getVmiChargeAggregationForPeriod(
        db as never,
        baseScope({ partyId: PARTY_A, periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" }),
      );

      expect(result.documentationUsd).toBeCloseTo(10, 4);
    },
  );

  it("returns all-zero aggregates when the query returns zero rows for the period", async () => {
    const db = createMockDb();
    db.select.mockImplementationOnce(() => makeChain([]));

    const result = await getVmiChargeAggregationForPeriod(db as never, baseScope());

    expect(result).toEqual({
      documentationUsd: 0,
      deliveryPhp: 0,
      deliveryUsd: 0,
      adHocChargesUsd: 0,
    });
  });
});
