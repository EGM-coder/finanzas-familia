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
      if (!data.user) return
      setInitial(data.user.email?.charAt(0) ?? '?')
      supabase
        .from('profiles')
        .select('role')
        .eq('user_id', data.user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile?.role) setScope(profile.role)
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
