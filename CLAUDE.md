# finanzas-familia — Referencia de Proyecto

## Usuario
- **Eric** — Head of Controlling en Nordex, Logroño (España)
- Pareja: **Ana**; hijos: **Leo** y **Biel**
- Declaración IRPF individual (Eric y Ana por separado)
- Stock options Nordex: dos paquetes (strikes 11,60€ y 26,31€, vesting 2028/2029)
- Aplicable Art. 7p IRPF por días trabajados fuera de España

## Proyecto vital activo
- **Apartamento Residencial Maristas** — entrega prevista mayo 2026
- Promotor: COBLANSA | Diseño interior: MAIO
- Módulo dedicado en la app: `maristas_adquisicion` + `maristas_equipamiento`

---

## Objetivo de la aplicación
Sistema de control presupuestario familiar al céntimo, multiusuario (Eric + Ana con accesos separados), con:
- Tracking de cuentas bancarias, ingresos, gastos, patrimonio
- Módulo Maristas
- Asesor IA integrado (Claude Sonnet vía Anthropic API, contexto fiscal español)
- Informes mensuales automáticos
- Futura ingesta automática PSD2 (fase 2) — ahora solo carga manual/CSV

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind CSS |
| Backend / BBDD / Auth | Supabase (Postgres + RLS + Auth con 2FA) |
| Despliegue | Vercel |
| Repo | GitHub (privado) |
| IA | Anthropic API (Claude Sonnet) |
| Futuro | GoCardless PSD2, n8n |

**Supabase:** proyecto YA creado, región Frankfurt, plan Free. Credenciales en `.env.local`.
**GitHub:** repositorio privado YA creado y vacío.
**Vercel:** cuenta creada vía GitHub login. Proyecto se conecta en Paso 5.

---

## CRÍTICO — Muro de privacidad

Implementado con **Row-Level Security de Postgres** (NO solo frontend).

| Cuenta | Eric | Ana |
|--------|------|-----|
| Kutxabank | ✅ solo Eric | ❌ |
| Trade Republic Eric | ✅ solo Eric | ❌ |
| MyInvestor Eric | ✅ solo Eric | ❌ |
| BBVA | ❌ | ✅ solo Ana |
| Trade Republic Ana | ❌ | ✅ solo Ana |
| MyInvestor Ana | ❌ | ✅ solo Ana |
| Santander común | ✅ | ✅ |
| MyInvestor común | ✅ | ✅ |
| MyInvestor Leo | ✅ | ✅ |
| MyInvestor Biel | ✅ | ✅ |

- Ingresos/nóminas: cada uno ve solo los suyos
- Cada usuario ve **una sola línea discontinua** indicando "Cuentas de [el otro] · privado" — sin cifra ni detalle

---

## Modelo de datos — 5 dimensiones por transacción

1. **Categoría funcional** (con subcategorías jerárquicas)
2. **Naturaleza**: `fijo_recurrente` | `variable_recurrente` | `extraordinario` | `inversion` | `ahorro`
3. **Titular**: `eric` | `ana` | `compartido`
4. **Proyecto**: `rutina` | `maristas_adquisicion` | `maristas_equipamiento` | ...
5. **Medio de pago / cuenta**

---

## Stock options Nordex (Fase 1)

- Tabla `stock_option_grants`: `package_name`, `grant_date`, `options_count`, `strike_price`, `vesting_date`, `expiration_date`
- Tabla `stock_prices`: `ticker`, `date`, `close_price`
- Precio NDX1 vía Yahoo Finance API (u otra gratuita), una vez al día
- Valor intrínseco = `max(0, precio_actual - strike) × options_count`, calculado al vuelo
- Entrada de grants: manual (datos estáticos)

---

## Estructura de tabs (mobile-first)

```
Inicio | Cuentas | Ingresos | Maristas | Asesor | Informes
```

---

## Fases de desarrollo

### Fase 0 — Cimientos seguros (ACTUAL)
Repo + Supabase + Vercel conectados, RLS básica, auth funcionando

**Pasos:**
1. Repo: `.gitignore`, `README.md`, estructura de carpetas
2. Proyecto Next.js + dependencias Supabase
3. Supabase: tabla `profiles`, primera RLS policy
4. Auth magic link + middleware SSR + login page + verificación local
4b. **Prueba local** (`npm run dev`) — todo verde antes de desplegar
5. Vercel: conectar repo, variables de entorno, deploy
6. Smoke test final (Eric y Ana aislados por RLS)

### Fase 1 — App navegable
Carga manual/CSV, 6 pantallas, asesor IA básico, stock options

### Fase 2 — Automatización
PSD2 (GoCardless) + Gmail parsing + n8n

### Fase 3 — Madurez
Simuladores, informes automáticos, pulido final

---

## Convenciones de código
- TypeScript estricto en todo el proyecto
- Tailwind CSS para estilos (no CSS modules, no styled-components)
- App Router de Next.js (no Pages Router)
- Variables de entorno en `.env.local` (nunca en repo)
- **RLS "deny by default"**: habilitar RLS en TODAS las tablas; primero policy restrictiva, luego aperturas explícitas. Nunca una tabla sin RLS.
- Auth: **magic link** (no email+password)

## Protocolo de trabajo
- Un paso a la vez; esperar "ok, siguiente" entre pasos
- Al final de cada paso: resumen de qué se hizo + qué debe verificar Eric
- Credenciales y secrets: SOLO en `.env.local` (gitignoreado), nunca en código commiteado
