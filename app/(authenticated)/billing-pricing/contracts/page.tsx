import { redirect } from "next/navigation";

export default function ContractListPage() {
  redirect("/billing-pricing?tab=configuration");
}
