import { redirect } from "next/navigation";

export default function TradingPoliciesRedirectPage() {
  redirect("/billing-pricing?section=configuration&subtab=logistics");
}
