/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy all /api/* requests to the FastAPI backend, which performs every
  // external-API / data lookup (the browser no longer calls geo.admin directly).
  // Defaults to localhost:8000; override with BACKEND_URL in production.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination:
          (process.env.BACKEND_URL || 'http://localhost:8000') + '/api/:path*',
      },
    ];
  },
};

export default nextConfig;
