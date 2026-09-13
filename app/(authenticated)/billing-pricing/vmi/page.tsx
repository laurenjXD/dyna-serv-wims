import BillingPricingPage from "../page";

/**
 * Focused VMI workspace entry point.
 *
 * The Billing & Pricing hub remains the canonical implementation so users
 * keep one consistent navigation shell, while this route gives office users
 * a direct bookmark for the VMI workflow described by task E.1.
 */
export default function VmiBillingPage() {
  return BillingPricingPage({
    searchParams: Promise.resolve({ section: "vmi", tab: "vmi" }),
  });
}
