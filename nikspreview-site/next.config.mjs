/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '${API_BASE_URL}/api/:path*', // proxy backend API
      },
    ];
  },
};

export default nextConfig;