import 'server-only'
import { SignJWT, importPKCS8 } from 'jose'

const APP_ID      = process.env.ENABLE_BANKING_APPLICATION_ID!
const PEM_RAW     = process.env.ENABLE_BANKING_JWT_PRIVATE_KEY!
const REDIRECT_URL = process.env.ENABLE_BANKING_REDIRECT_URL!
const API_BASE    = 'https://api.enablebanking.com'

// env vars suelen tener \n literal en lugar de salto real
const PRIVATE_KEY_PEM = PEM_RAW.replace(/\\n/g, '\n')

export async function signJwt(): Promise<string> {
  const key = await importPKCS8(PRIVATE_KEY_PEM, 'RS256')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ iss: 'enablebanking.com', aud: 'api.enablebanking.com' })
    .setProtectedHeader({ alg: 'RS256', kid: APP_ID, typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)
}

export async function ebFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await signJwt()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Enable Banking ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export interface ConsentResponse {
  url: string
}

export async function startConsent({
  aspspName,
  aspspCountry,
  state,
}: {
  aspspName: string
  aspspCountry: string
  state: string
}): Promise<ConsentResponse> {
  // Enable Banking ASPSP max: 15552000s (180d). Margen 60s para evitar drift de reloj.
  const validUntil = new Date(Date.now() + (15552000 - 60) * 1000)

  return ebFetch<ConsentResponse>('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil.toISOString() },
      aspsp: { name: aspspName, country: aspspCountry },
      state,
      redirect_url: REDIRECT_URL,
      psu_type: 'personal',
    }),
  })
}

export interface EbAccount {
  uid: string
  account_id?: { iban?: string }
  identification_hash: string
  currency?: string
  [key: string]: unknown
}

export interface SessionResponse {
  session_id: string
  accounts: EbAccount[]
  access: { valid_until: string }
  [key: string]: unknown
}

export async function exchangeCode(code: string): Promise<SessionResponse> {
  return ebFetch<SessionResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}
