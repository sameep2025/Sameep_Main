/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const { buildIndexingProtectionHeaders } = await import(
      "./src/utils/seoHeaders.mjs"
    );

    return buildIndexingProtectionHeaders();
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
    ],
  },
};

module.exports = nextConfig;
