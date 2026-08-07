import type { Config } from "drizzle-kit";

// Migration files are still hand-authored in supabase/migrations per
// structure.md's NNNN_description.sql numbering; drizzle-kit's own
// generated output is pointed at the same folder so `database-builder`
// has one source of truth for schema history.
export default {
  schema: "./lib/db/schema/index.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
