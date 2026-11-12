import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PayPal toolkit and server SDK are server-only; keep them out of the bundler.
  serverExternalPackages: ["@paypal/agent-toolkit", "@paypal/paypal-server-sdk"],
  turbopack: {
    rules: {
      "*.css": {
        // Tailwind only for our own styles; vendor CSS in node_modules skips this loader.
        condition: { not: "foreign" },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
