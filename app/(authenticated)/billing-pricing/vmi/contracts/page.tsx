import { redirect } from "next/navigation";

export default function VmiContractsRedirectPage() {
  redirect("/billing-pricing?section=configuration&subtab=contracts");
}
