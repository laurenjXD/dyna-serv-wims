import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { MigrationUploadForm } from "./_components/MigrationUploadForm";

export default async function MigrationPage() {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "parties.manage");
  if (permission.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">You do not have permission to run a data migration.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-container">
      <div>
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">Data Migration</h1>
        <p className="mt-1 font-body text-body-md text-text-grey">Seed the simulation from an approved opening inventory workbook.</p>
      </div>
      <div className="mt-6"><MigrationUploadForm /></div>
    </div>
  );
}
