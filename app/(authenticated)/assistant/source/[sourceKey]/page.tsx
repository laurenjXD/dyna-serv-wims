import Link from "next/link";
import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AssistantSourcePage({ params }: { params: Promise<{ sourceKey: string }> }) {
  const { sourceKey } = await params;
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "ai_assistant.read");
  if (permission.kind !== "authorized" || permission.context.activeRoleKeys.includes("party_user")) notFound();

  const supabase = await createClient();
  const { data: source } = await supabase.from("knowledge_sources")
    .select("id,source_key,title,source_path,version")
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (!source) notFound();

  const { data: chunks } = await supabase.from("knowledge_chunks")
    .select("chunk_index,heading,content")
    .eq("source_id", source.id)
    .order("chunk_index", { ascending: true });
  if (!chunks?.length) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <Link href="/" className="text-sm font-medium text-primary underline underline-offset-2">Back to WIMS</Link>
      <header className="rounded-2xl border border-border bg-background p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approved internal manual · {source.version}</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">{source.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Source: {source.source_path}</p>
      </header>
      <div className="space-y-4">
        {chunks.map((chunk) => (
          <article key={chunk.chunk_index} className="rounded-xl border border-border bg-background p-5">
            <h2 className="mb-3 font-semibold text-foreground">{chunk.heading}</h2>
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{chunk.content}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
