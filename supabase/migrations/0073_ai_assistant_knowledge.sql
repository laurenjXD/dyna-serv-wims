-- Internal, read-only assistant knowledge index.
-- Chat content is never stored. Only approved internal manual sections are indexed.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
--> statement-breakpoint

INSERT INTO public.permissions (resource, action, description)
VALUES ('ai_assistant', 'read', 'Use the internal read-only AI assistant and its approved knowledge sources.')
ON CONFLICT (resource, action) DO UPDATE SET is_active = true;
--> statement-breakpoint

INSERT INTO public.role_permissions (role_id, permission_id, scope_kind)
SELECT r.id, p.id, 'global'::public.scope_kind
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key IN ('warehouse_staff', 'supervisor', 'administrator')
  AND p.resource = 'ai_assistant' AND p.action = 'read'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

CREATE TABLE public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  title text NOT NULL,
  source_path text NOT NULL,
  content_sha256 text NOT NULL,
  version text NOT NULL,
  published boolean NOT NULL DEFAULT false,
  audience text NOT NULL DEFAULT 'internal' CHECK (audience = 'internal'),
  effective_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  heading text NOT NULL,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 6000),
  embedding extensions.vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, chunk_index)
);
--> statement-breakpoint

CREATE INDEX knowledge_chunks_embedding_hnsw_idx
  ON public.knowledge_chunks USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX knowledge_chunks_source_idx ON public.knowledge_chunks (source_id, chunk_index);
CREATE INDEX knowledge_sources_published_idx ON public.knowledge_sources (published, effective_at, retired_at);
GRANT USAGE ON SCHEMA extensions TO authenticated;
--> statement-breakpoint

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY knowledge_sources_internal_read ON public.knowledge_sources
  FOR SELECT TO authenticated
  USING (
    published AND retired_at IS NULL AND effective_at <= now()
    AND rbac_internal.has_permission('ai_assistant', 'read', 'global')
  );
CREATE POLICY knowledge_chunks_internal_read ON public.knowledge_chunks
  FOR SELECT TO authenticated
  USING (
    rbac_internal.has_permission('ai_assistant', 'read', 'global')
    AND EXISTS (
      SELECT 1 FROM public.knowledge_sources s
      WHERE s.id = knowledge_chunks.source_id AND s.published
        AND s.retired_at IS NULL AND s.effective_at <= now()
    )
  );
--> statement-breakpoint

GRANT SELECT ON public.knowledge_sources, public.knowledge_chunks TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.knowledge_sources, public.knowledge_chunks FROM anon, authenticated;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.search_internal_knowledge(
  query_embedding extensions.vector(1536),
  query_text text,
  result_limit integer DEFAULT 6
)
RETURNS TABLE (
  source_key text,
  source_title text,
  source_path text,
  source_version text,
  heading text,
  content text,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT s.source_key, s.title, s.source_path, s.version, c.heading, c.content,
      (1 - (c.embedding OPERATOR(extensions.<=>) query_embedding))::real AS semantic_score,
      ts_rank_cd(to_tsvector('english', c.heading || ' ' || c.content),
        websearch_to_tsquery('english', left(coalesce(query_text, ''), 1000)))::real AS lexical_score
    FROM public.knowledge_chunks c
    JOIN public.knowledge_sources s ON s.id = c.source_id
    WHERE s.published AND s.retired_at IS NULL AND s.effective_at <= now()
      AND rbac_internal.has_permission('ai_assistant', 'read', 'global')
    ORDER BY c.embedding OPERATOR(extensions.<=>) query_embedding
    LIMIT greatest(1, least(coalesce(result_limit, 6), 10))
  )
  SELECT source_key, title, source_path, version, heading, content,
    (0.8 * semantic_score + 0.2 * lexical_score)::real AS similarity
  FROM candidates
  ORDER BY (0.8 * semantic_score + 0.2 * lexical_score) DESC
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.search_internal_knowledge(extensions.vector, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_internal_knowledge(extensions.vector, text, integer) TO authenticated;
