import { readFile } from "node:fs/promises";
import path from "node:path";

// Serve the verified transparent high-resolution brand asset directly so
// browser previews and generated documents use the same source pixels.
export async function GET(): Promise<Response> {
  const logoPng = await readFile(path.join(process.cwd(), "public", "logo-hd.png"));

  return new Response(new Uint8Array(logoPng), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
    },
  });
}
