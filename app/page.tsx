// Placeholder shell only. Real route groups/pages are created per-feature
// once that feature's tasks.md is Approved and frontend-builder picks it up.
// See specs/00-steering/structure.md and specs/00-steering/implementation-kickoff.md.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="font-heading font-bold text-headline-lg text-brand-navy">
        Dyna-Serv WIMS
      </h1>
      <p className="font-body text-body-md text-text-grey">
        Project skeleton scaffolded. Feature work begins once each
        spec&apos;s tasks.md is Approved.
      </p>
    </main>
  );
}
