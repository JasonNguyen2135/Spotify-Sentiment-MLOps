/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone', // Tối ưu cho Docker
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    }
}

module.exports = nextConfig
