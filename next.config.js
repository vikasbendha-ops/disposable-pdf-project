const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/direct/:token",
          destination: "/api/direct/:token",
        },
      ],
    };
  },
  webpack: (config) => {
    config.resolve.alias["@"] = path.join(__dirname, "frontend/src");
    return config;
  },
};

module.exports = nextConfig;
