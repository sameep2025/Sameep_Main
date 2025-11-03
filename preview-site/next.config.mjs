/** @type {import('next').NextConfig} */

const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : "https://Sameep-V3.ap-south-1.elasticbeanstalk.com";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE_URL}/api/:path*`, // proxy backend API
      },
    ];
  },
};

export default nextConfig;
