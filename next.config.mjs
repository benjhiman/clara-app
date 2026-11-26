/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // Las migraciones de la base se leen al arrancar: hay que incluirlas en el paquete de Vercel
  outputFileTracingIncludes: { "/**": ["./drizzle/**"] },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};
export default nextConfig;
