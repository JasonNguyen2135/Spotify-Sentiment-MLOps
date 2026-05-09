import './globals.css'
import type { Metadata } from 'next'
import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/context/AuthContext'
import { ProjectProvider } from '@/context/ProjectContext'

export const metadata: Metadata = {
  title: 'User Sentiment Analysis Platform',
  description: 'Enterprise-grade sentiment analysis for user feedback',
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
          <ProjectProvider>
            <Navbar />
            <main className="container mx-auto mt-8 px-4">
              {children}
            </main>
          </ProjectProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
