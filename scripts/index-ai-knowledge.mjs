import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const ROOT = process.cwd();
const SOURCES = [
  ["document-printing-and-compliance", "Document printing and compliance", "docs/user-manual/document-printing-and-compliance.md"],
  ["edge-cases-and-troubleshooting", "Edge cases and troubleshooting", "docs/user-manual/edge-cases-and-troubleshooting.md"],
  ["incoming-receiving-and-wrr", "Incoming receiving and WRR", "docs/user-manual/incoming-receiving-and-wrr.md"],
  ["inventory-and-withdrawals", "Inventory and withdrawals", "docs/user-manual/inventory-and-withdrawals.md"],
  ["master-data-and-organizations", "Master data and Organizations", "docs/user-manual/master-data-and-organizations.md"],
  ["outgoing-picking-and-dispatch", "Outgoing picking and dispatch", "docs/user-manual/outgoing-picking-and-dispatch.md"],
];

function chunkMarkdown(markdown) {
  const chunks = [];
  let heading = "Overview";
  let paragraphs = [];
  let body = "";
  const flush = () => {
    if (!body.trim()) return;
    chunks.push({ heading, content: body.trim() });
    body = "";
  };
  for (const line of markdown.split(/\r?\n/)) {
    const header = line.match(/^#{1,4}\s+(.+)$/);
    if (header) {
      flush();
      heading = header[1].trim().slice(0, 240);
      continue;
    }
    const clean = line.trim();
    if (!clean) {
      if (paragraphs.length) {
        const paragraph = paragraphs.join(" ");
        if (body && body.length + paragraph.length > 4500) flush();
        body += `${body ? "\n\n" : ""}${paragraph}`;
        paragraphs = [];
      }
      continue;
    }
    paragraphs.push(clean);
  }
  if (paragraphs.length) body += `${body ? "\n\n" : ""}${paragraphs.join(" ")}`;
  flush();
  return chunks;
}

function requireEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required environment setting: ${key}`);
  return value;
}

async function embed(texts, model, provider, apiKey, baseUrl) {
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": baseUrl, "X-Title": "Dyna-Serv WIMS Knowledge Index" },
    body: JSON.stringify({
      model,
      input: texts,
      provider: { only: [provider], allow_fallbacks: false, data_collection: "deny", zdr: true },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("OpenRouter embedding request failed; no content was indexed.");
  const payload = await response.json();
  const rows = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
  if (rows.length !== texts.length || rows.some((row) => row.embedding?.length !== 1536)) {
    throw new Error("Embedding response has an unexpected shape or vector dimension.");
  }
  return rows.map((row) => row.embedding);
}

if (process.env.AI_CHAT_ENABLED !== "true" || process.env.AI_CHAT_PRIVACY_REVIEWED !== "true") throw new Error("Indexing is disabled. Verify the approved OpenRouter endpoint/privacy settings before enabling assistant requests and indexing.");
const databaseUrl = requireEnv("DATABASE_URL");
const apiKey = requireEnv("OPENROUTER_API_KEY");
const chatModel = requireEnv("OPENROUTER_MODEL");
const embeddingModel = requireEnv("OPENROUTER_EMBEDDING_MODEL");
const provider = requireEnv("OPENROUTER_PROVIDER_ONLY");
const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: databaseUrl.includes("supabase") ? "require" : undefined });

try {
  // Refuse a partial index when any source or embedding fails. Each source is
  // replaced atomically so users never see a half-indexed manual version.
  for (const [key, title, relativePath] of SOURCES) {
    const sourcePath = resolve(ROOT, relativePath);
    const markdown = await readFile(sourcePath, "utf8");
    const digest = createHash("sha256").update(markdown).digest("hex");
    const version = digest.slice(0, 12);
    const chunks = chunkMarkdown(markdown);
    const vectors = [];
    for (let offset = 0; offset < chunks.length; offset += 32) {
      const batch = chunks.slice(offset, offset + 32);
      vectors.push(...await embed(batch.map((chunk) => `${title}\n${chunk.heading}\n${chunk.content}`), embeddingModel, provider, apiKey, baseUrl));
    }

    await sql.begin(async (transaction) => {
      const [source] = await transaction`
        INSERT INTO public.knowledge_sources (source_key, title, source_path, content_sha256, version, published, audience, effective_at, retired_at)
        VALUES (${key}, ${title}, ${relativePath}, ${digest}, ${version}, true, 'internal', now(), NULL)
        ON CONFLICT (source_key) DO UPDATE SET title = EXCLUDED.title,
          source_path = EXCLUDED.source_path, content_sha256 = EXCLUDED.content_sha256,
          version = EXCLUDED.version, published = true, effective_at = now(), retired_at = NULL,
          updated_at = now()
        RETURNING id`;
      await transaction`DELETE FROM public.knowledge_chunks WHERE source_id = ${source.id}`;
      for (let i = 0; i < chunks.length; i++) {
        const embedding = `[${vectors[i].join(",")}]`;
        await transaction`
          INSERT INTO public.knowledge_chunks (source_id, chunk_index, heading, content, embedding)
          VALUES (${source.id}, ${i}, ${chunks[i].heading}, ${chunks[i].content}, ${embedding}::extensions.vector(1536))`;
      }
    });
    console.log(`Indexed ${key} (${chunks.length} sections, version ${version}).`);
  }
  console.log(`Manual index complete using configured model ${chatModel}.`);
} finally {
  await sql.end();
}
