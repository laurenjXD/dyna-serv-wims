import { toUserMessage } from "@/lib/ui/user-messages";

export function SettingsUnavailable({ title, error, href }: { title: string; error: string; href: string }) {
  return <section role="alert" className="rounded-2xl border border-status-held/30 bg-surface-white p-6">
    <h1 className="font-heading text-title-md text-on-surface">{title}</h1>
    <p className="mt-2 font-body text-body-md text-on-surface">{toUserMessage(error, "These settings could not be loaded. Refresh the page to try again.")}</p>
    <a href={href} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand-navy px-4 font-label text-label text-white">Reload page</a>
  </section>;
}
