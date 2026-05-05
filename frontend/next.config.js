/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone', // Tối ưu cho Docker
    async rewrites() {
        return [
          {
            source: '/api/:path*',
            destination: `${process.env.BACKEND_API_URL || 'http://backend:8000'}/:path*`,
          },
        ]
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    }
}

module.exports = nextConfig
