import { redirect } from "next/navigation";

export default function ContractListPage() {
  redirect("/billing-pricing?section=configuration&subtab=contracts");
}
