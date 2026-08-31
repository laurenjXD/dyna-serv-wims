import { redirect } from "next/navigation";

export default function VmiPeriodsRedirectPage() {
  redirect("/billing-pricing?tab=vmi");
}
