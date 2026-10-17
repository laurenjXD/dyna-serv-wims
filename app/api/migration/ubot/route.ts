import { NextResponse } from "next/server";
import { stageUbotMigration } from "@/lib/actions/data-migration";
import { limitPrivilegedRequest } from "@/lib/security/upstash-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function requestIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "The workbook exceeds the 50 MB upload limit." }, { status: 413 });
    }

    const rate = await limitPrivilegedRequest(requestIdentifier(request));
    if (!rate.success) {
      return NextResponse.json(
        { ok: false, error: rate.limit === 0 ? "Migration upload protection is not configured." : "Too many migration uploads. Try again later." },
        { status: rate.limit === 0 ? 503 : 429 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (file instanceof File && file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "The workbook exceeds the 50 MB upload limit." }, { status: 413 });
    }

    const result = await stageUbotMigration(formData);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[migration/ubot] upload failed", error);
    return NextResponse.json(
      { ok: false, error: "The workbook upload could not be processed." },
      { status: 500 },
    );
  }
}
