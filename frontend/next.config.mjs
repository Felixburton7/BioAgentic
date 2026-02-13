/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    return [
      {
        source: "/research/:path*",
        destination: `${backendUrl}/research/:path*`,
      },
      {
        source: "/auth",
        destination: `${backendUrl}/auth`,
      },
      {
        source: "/health",
        destination: `${backendUrl}/health`,
      },
    ];
  },
};

export default nextConfig;
