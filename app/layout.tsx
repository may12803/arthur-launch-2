import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Arthur',
  description: 'Arthur',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-bg-base text-text-main`}>
        <div className="flex h-screen">
          <aside className="w-sidebar-width bg-glass-bg border-r border-glass-border">
            {/* Sidebar content */}
          </aside>
          <main className="flex-1 overflow-y-auto">
            <nav className="h-nav-height bg-glass-bg-strong border-b border-glass-border flex items-center px-page-margin">
              {/* Navigation content */}
            </nav>
            <div className="p-page-margin">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}
