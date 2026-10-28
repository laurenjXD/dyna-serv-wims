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
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    ];

    if (process.env.VERCEL_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      {
        source: "/sw.js",
        headers: [
          ...headers,
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      { source: "/(.*)", headers },
    ];
  },
};

export default nextConfig;
