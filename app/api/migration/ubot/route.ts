import { NextResponse } from "next/server";
import { stageUbotMigration } from "@/lib/actions/data-migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = await stageUbotMigration(formData);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[migration/ubot] upload failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.cause instanceof Error ? error.cause.message : error.message : "The workbook upload failed." },
      { status: 500 },
    );
  }
}
