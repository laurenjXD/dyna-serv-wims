import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      // Migration workbooks are uploaded through a Server Action before they
      // are retained in the private Supabase storage bucket.
      bodySizeLimit: "50mb",
    },
    middlewareClientMaxBodySize: "50mb",
  },
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      // The Documents Center previews authoritative same-origin print pages
      // inside an iframe. SAMEORIGIN preserves clickjacking protection for
      // external sites while allowing that internal preview to render.
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    ];

    if (process.env.VERCEL_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
