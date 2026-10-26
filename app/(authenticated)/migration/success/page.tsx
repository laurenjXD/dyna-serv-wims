import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardList, PackageCheck } from "@/components/ui/icons";

type MigrationSuccessPageProps = {
  searchParams: Promise<{ rows?: string }>;
};

export default async function MigrationSuccessPage({ searchParams }: MigrationSuccessPageProps) {
  const params = await searchParams;
  const committedRows = Number.parseInt(params.rows ?? "", 10);
  const hasCommittedRows = Number.isFinite(committedRows) && committedRows >= 0;
  const rowSummary = hasCommittedRows
    ? `${committedRows.toLocaleString()} opening balance row${committedRows === 1 ? "" : "s"} ${committedRows === 1 ? "was" : "were"} committed successfully.`
    : "The opening balance rows were committed successfully.";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-4 py-12 lg:px-8">
      <section className="w-full rounded-3xl border border-success/25 bg-surface-white p-8 text-center shadow-elevation-2 sm:p-12" aria-labelledby="migration-success-title">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 size={36} aria-hidden="true" />
        </span>
        <p className="mt-6 font-label text-label font-bold uppercase tracking-wide text-success">Migration complete</p>
        <h1 id="migration-success-title" className="mt-2 font-heading text-headline-md font-bold text-on-surface">Opening seed confirmed</h1>
        <p className="mx-auto mt-3 max-w-xl font-body text-body-md text-text-grey">{rowSummary} The opening stock is now available in WIMS for normal warehouse workflows.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/inventory" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-blue px-6 font-label text-label font-bold text-white hover:bg-brand-navy"><PackageCheck size={18} /> View inventory</Link>
          <Link href="/migration" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-brand-blue px-6 font-label text-label font-bold text-brand-blue hover:bg-brand-blue/10"><ClipboardList size={18} /> Back to migration</Link>
        </div>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center gap-2 font-label text-label font-bold text-text-grey hover:text-brand-navy"><ArrowLeft size={16} /> Go to dashboard</Link>
      </section>
    </div>
  );
}
