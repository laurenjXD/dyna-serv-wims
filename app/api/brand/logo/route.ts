import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// PDF engines do not consistently support the filters embedded in logo.svg.
// Serve one opaque, high-resolution PNG for printable documents instead.
export async function GET(): Promise<Response> {
  const logoSvg = await readFile(path.join(process.cwd(), "public", "logo.svg"));
  const logoPng = await sharp(logoSvg, { density: 288 })
    .flatten({ background: "#ffffff" })
    .resize(768, 768, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();

  return new Response(new Uint8Array(logoPng), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
    },
  });
}
