/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Empty turbopack config silences the "webpack config present" error in dev.
  // The webpack config below still applies for production builds (next build).
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      // tesseract.js uses __dirname-based paths that break when webpack bundles it.
      // Keep it as a native require so the real filesystem path is used at runtime.
      const neverBundle = ['tesseract.js', 'canvas'];

      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        ({ request }, callback) => {
          if (request && request.startsWith('node:')) {
            return callback(null, `commonjs ${request}`);
          }
          if (request && neverBundle.some(pkg => request === pkg || request.startsWith(`${pkg}/`))) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
}

export default nextConfig
