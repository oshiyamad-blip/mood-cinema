import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 外部 LLM API 通信は API Route 経由のみ許可（CSP は vercel.json or middleware で管理）
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk", "@notionhq/client"],
  },
};

export default nextConfig;
