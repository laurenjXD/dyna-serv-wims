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
  },
};

export default nextConfig;
