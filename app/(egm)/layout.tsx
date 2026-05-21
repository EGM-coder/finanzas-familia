'use client'
import { ThemeProvider } from 'next-themes'
import { EgmTopBar } from './_components/EgmTopBar'

export default function EgmLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={['light', 'dark']}
    >
      <div className="egm min-h-screen">
        <EgmTopBar />
        {children}
      </div>
    </ThemeProvider>
  )
}
