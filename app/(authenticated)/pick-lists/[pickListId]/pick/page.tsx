import { redirect } from "next/navigation";

// The separate staging screen was retired. Keep this route as a safe redirect
// for existing bookmarks; all physical verification occurs at Dispatch.
export default async function RetiredPickExecutionPage({
  params,
}: {
  params: Promise<{ pickListId: string }>;
}) {
  const { pickListId } = await params;
  redirect(`/pick-lists/${pickListId}/dispatch`);
}
