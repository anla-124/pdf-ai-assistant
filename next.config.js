/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@google-cloud/documentai'],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
}

module.exports = nextConfig