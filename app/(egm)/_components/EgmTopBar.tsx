'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AvatarChip } from '@/components/egm/AvatarChip'

export function EgmTopBar() {
  const router = useRouter()
  const [initial, setInitial] = useState('')
  const [scope, setScope] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user
      if (!user) return
      setInitial(user.email?.charAt(0) ?? '?')
      supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single()
        .then(({ data }: { data: { role: string } | null }) => {
          if (data?.role) setScope(data.role)
        })
    })
  }, [])

  if (!initial) return null

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '8px 32px',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--bg)',
      }}
    >
      <AvatarChip
        initial={initial}
        scope={scope}
        onClick={() => router.push('/configuracion')}
      />
    </div>
  )
}
