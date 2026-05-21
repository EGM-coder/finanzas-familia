'use client'
import { ThemeProvider } from 'next-themes'
import { EgmTopBar } from './_components/EgmTopBar'

export default function EgmLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      themes={['light', 'dark', 'system']}
    >
      <div className="egm min-h-screen">
        <EgmTopBar />
        {children}
      </div>
    </ThemeProvider>
  )
}
