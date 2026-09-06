// Keep the authenticated shell responsive while the landing page resolves its
// initial authorization and dashboard queries.
export default function AuthenticatedLoading() {
  return (
    <main
      className="flex min-h-[50vh] items-center justify-center p-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="space-y-2">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-royal-blue/20 border-t-brand-royal-blue" />
        <p className="font-body text-body-md text-text-grey">Loading your workspace…</p>
      </div>
    </main>
  );
}
