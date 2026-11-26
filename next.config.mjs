/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};
export default nextConfig;
