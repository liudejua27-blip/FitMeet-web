/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['three'],
  experimental: { optimizePackageImports: ['framer-motion', 'gsap'] },
};
export default nextConfig;
