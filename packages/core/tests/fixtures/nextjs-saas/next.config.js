/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@/lib/*'],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
