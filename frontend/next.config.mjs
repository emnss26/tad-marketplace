/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: {
    // Static export disables Image Optimization. Sprint 6 will reconsider.
    unoptimized: true,
  },
};

export default nextConfig;
