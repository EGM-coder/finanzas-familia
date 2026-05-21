import { Suspense } from 'react'
import { SettingsNav } from './_components/SettingsNav'

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 37px)' }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid var(--rule)',
          padding: '40px 24px 40px 32px',
        }}
      >
        <Suspense fallback={null}>
          <SettingsNav />
        </Suspense>
      </aside>
      <main style={{ flex: 1, minWidth: 0, padding: '40px 48px', maxWidth: 680 }}>
        {children}
      </main>
    </div>
  )
}
