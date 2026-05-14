'use client'
import { ThemeProvider } from 'next-themes'

export default function EgmLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={['light', 'dark']}
    >
      <div className="egm min-h-screen">
        {children}
      </div>
    </ThemeProvider>
  )
}
