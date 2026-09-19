/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb', // charging logs can be large xlsx files
    },
  },
};

module.exports = nextConfig;
