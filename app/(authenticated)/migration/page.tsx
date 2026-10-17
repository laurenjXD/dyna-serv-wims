import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { MigrationUploadForm } from "./_components/MigrationUploadForm";

export default async function MigrationPage() {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "parties.manage");
  if (permission.kind !== "authorized" || !permission.context.activeRoleKeys.includes("administrator")) {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">You do not have permission to run a data migration.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="text-center">
        <h1 className="font-heading text-headline-lg font-bold text-on-surface">Data Migration</h1>
        <p className="mx-auto mt-2 max-w-2xl font-body text-body-md text-text-grey">Move the approved UBoT VMI opening snapshot into the warehouse system in four controlled steps.</p>
      </div>
      <div className="mt-8"><MigrationUploadForm /></div>
    </div>
  );
}
