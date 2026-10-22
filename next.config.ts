import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Security headers on every response. Everything the app loads is its own, so the content policy allows only this
 * origin. Next.js needs inline scripts to start the page, and eval in development.
 */
const policy = (frameAncestors: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Ignored over plain HTTP (local development); enforces HTTPS once deployed.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The development badge would sit on top of the chat's send button in previews and embeds.
  devIndicators: false,
  async headers() {
    return [
      // The dashboard and the site can't be framed by anyone.
      { source: "/((?!chat/).*)", headers: [...common, { key: "Content-Security-Policy", value: policy("'none'") }, { key: "X-Frame-Options", value: "DENY" }] },
      // The chat a business embeds on its own site (the bubble, side panel and embedded window are this page in a
      // frame), so any site may frame it.
      { source: "/chat/:path*", headers: [...common, { key: "Content-Security-Policy", value: policy("*") }] },
    ];
  },
};

export default nextConfig;
