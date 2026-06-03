'use client'
import { ThemeProvider } from 'next-themes'
import { EgmTopBar } from './_components/EgmTopBar'
import { EgmNav } from './_components/EgmNav'

export default function EgmLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      themes={['light', 'dark', 'system']}
    >
      <div className="egm min-h-screen flex">
        <EgmNav />
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top bar: hidden on desktop (sidebar has branding), visible on mobile */}
          <div className="md:hidden">
            <EgmTopBar />
          </div>
          {/* Content — bottom padding on mobile for the tab bar */}
          <main className="flex-1 pb-20 md:pb-0">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  )
}
