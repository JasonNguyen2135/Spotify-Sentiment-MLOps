import './globals.css'
import type { Metadata } from 'next'
import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/context/AuthContext'

export const metadata: Metadata = {
  title: 'Spotify Sentiment MLOps',
  description: 'Analyze spotify reviews with AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main className="container mx-auto mt-8 px-4">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  )
}
