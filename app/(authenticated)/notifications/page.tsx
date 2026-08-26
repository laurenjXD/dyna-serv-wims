// Internal Notification Queue — user-scoped operational notifications.

import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { listRecentNotifications } from "@/lib/db/queries/notifications";
import { db } from "@/lib/db/client";

export default async function NotificationQueuePage() {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "notifications.read");
  if (permission.kind !== "authorized") notFound();

  const rows = await listRecentNotifications(permission.context.userId, 50, db);

  return (
    <div className="mx-auto max-w-container">
      <div>
        <h1 className="font-heading text-headline-md font-extrabold text-on-surface">Notification Queue</h1>
        <p className="mt-1 font-body text-body-md text-text-grey">Review operational notifications assigned to your account.</p>
      </div>
      <section className="mt-6 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center"><p className="font-body text-body-md text-text-grey">No notifications in the queue.</p></div>
        ) : (
          <ul className="divide-y divide-outline-variant/30">
            {rows.map((row) => (
              <li key={row.id} className={`px-5 py-4 ${row.readAt ? "" : "border-l-4 border-primary bg-accent-indigo-50/40"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-heading text-body-lg font-bold text-on-surface">{row.title}</p>{row.body && <p className="mt-1 font-body text-body-md text-text-grey">{row.body}</p>}</div>
                  <span className="shrink-0 font-mono text-mono-sm text-text-grey">{row.createdAt.toLocaleString()}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 font-label text-mono-sm uppercase text-text-grey"><span>{row.category}</span>{row.flowType && <span>· {row.flowType}</span>}{!row.readAt && <span className="text-primary">· Unread</span>}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
