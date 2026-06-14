/**
 * Next.js configuration.
 *
 * The one job this file does is set up a server-side rewrite: every request the
 * browser makes to a relative /api/* path is proxied to the FastAPI backend
 * (default http://localhost:8000, overridable with the BACKEND_URL env var in
 * production). This is why the frontend can call the backend with plain relative
 * URLs and never has to know the backend's address or worry about CORS: in the
 * browser, /api/parcel and the page are the same origin, and Next.js forwards it
 * to the Python service behind the scenes.
 */
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
