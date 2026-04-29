# Parches y Deuda Técnica — EGMFin

Registro de decisiones no-obvias, workarounds y deuda técnica activa.  
Formato: `P-NNN · (fecha) · estado · descripción`

---

## P-001 · 27-abr-2026 · **RESUELTO** (mig 20)
**Roboadvisor MyInvestor sin cotización pública en `holdings`**

El holding "Robot Advisor (perfil agregado)" de MyInvestor común no tiene ticker ni ISIN
con precio en `holding_prices`. La vista `holdings_valued` devolvía NULL en `current_value_eur`.

**Solución:** migración 20 introduce `manual_holdings` para activos sin cotización.
El roboadvisor se migró de `holdings` a `manual_holdings`. La vista `account_balances_full`
suma `manual_holdings.current_value_eur` además de `holdings_valued`.

**Cómo mantenerlo:** actualizar `manual_holdings.current_value_eur` mensualmente
con el valor del extracto de MyInvestor (UPDATE manual en Supabase Table Editor).

---

## P-002 · 27-abr-2026 · **ACTIVO** (vive en frontend)
**Signo de tarjetas de crédito en `account_balances_full`**

Las tarjetas acumulan gastos como amounts negativos (convenio EGMFin).
La vista `account_balances_full` multiplica por -1 el saldo de cuentas tipo `card`
para mostrar la deuda como número positivo (ej. "has gastado 450 €" no "-450 €").

**Dónde vive:** columna `current_balance` en `account_balances_full`:
```sql
WHEN a.type = 'card' THEN
  -1 * (a.initial_balance + COALESCE(SUM(t.amount), 0))
```

**Impacto frontend:** `CuentasClient.tsx` muestra saldo de tarjeta en rojo (`C.negative`)
cuando `current_balance > 0` — es decir, cuando hay deuda pendiente.

---

## P-005 · 27-abr-2026 · **RESUELTO** (mig 18)
**UNIQUE constraint débil en `holding_prices` + `update_prices.py` duplicaba filas**

El script de actualización de precios (GitHub Actions) hacía INSERT sin dedup,
generando filas duplicadas `(ticker, date)`. Las consultas LATERAL devolvían
precios aleatorios según `created_at`.

**Solución:** migración 18 añade `UNIQUE(ticker, date)` robusto (primero elimina
duplicados existentes) y cambia el script a DELETE + INSERT para ser idempotente.

---

## P-006 · 27-abr-2026 · **ACTIVO** (decisión de diseño)
**Precio de NDX1.DE en `holding_prices` sin holding asociado**

`stock_options_valued` necesita `holding_prices` para calcular el valor intrínseco
de las opciones Nordex. Pero NDX1.DE no tiene un holding en `holdings` (las opciones
no son acciones en cartera).

**Solución:** se inserta el precio de NDX1.DE directamente en `holding_prices`
con `ticker = 'NDX1.DE'` e ISIN NULL. El script `update_prices.py` lo actualiza diariamente
porque `stock_options.ticker` está incluido en `get_unique_tickers()`.

**Riesgo:** si alguien filtra `holding_prices` asumiendo que todo precio tiene un holding,
obtendrá filas "huérfanas". Usar JOIN con `holdings` si solo se quieren precios de cartera.

---

## P-007 · 27-abr-2026 · **RESUELTO** (mig 17)
**`account_balances_full` no exponía `is_active` ni `sort_order`**

`page.tsx` en `/cuentas` filtra `.eq('is_active', true)` y ordena `.order('sort_order')`.
Sin esas columnas, PostgREST devolvía 0 filas silenciosamente (no error).

**Solución:** migración 17 añade `is_active` y `sort_order` a `account_balances_full`.

---

## P-008 · 27-abr-2026 · **ACTIVO**
**`holding_prices` acepta filas con ticker NULL e ISIN NULL**

No hay constraint que exija al menos uno de los dos. Una fila con ambos NULL
nunca matcheará en `holdings_valued` y contamina la tabla silenciosamente.

**Workaround activo:** el script `update_prices.py` nunca inserta sin ticker.
Pero no hay garantía DB-level. Pendiente: añadir CHECK `(ticker IS NOT NULL OR isin IS NOT NULL)`.

---

## P-009 · (regla permanente)
**Verificar nombres reales de columnas antes de cualquier query nuevo**

Varias columnas tienen nombres que difieren del "nombre lógico" esperado:
- `holdings.avg_price_eur` (no `purchase_price_eur` ni `cost_basis`)
- `holding_prices.close_eur` (no `price_eur`)
- `account_balances_full.current_balance` (incluye holdings; no es solo tx)

**Regla:** antes de cualquier query nuevo, verificar con `\d+ tabla` en SQL Editor
o con `SELECT column_name FROM information_schema.columns WHERE table_name = '...'`.

---

## P-010 · 30-abr-2026 · **RESUELTO** (mig 22 + recovery)
**`stock_option_grants` obsoleta, sustituida por `stock_options`**

La migración 5 creó `stock_option_grants` con schema mínimo (`user_id`, `package_name`,
`grant_date`, `options_count`, `strike_price`, `vesting_date`, `expiration_date`).

Posteriormente se creó `stock_options` (mig 16) con schema más rico:
`exercise_window_start/end`, `condition_pct`, `ticker`, sin `user_id` (opciones compartidas).

La tabla `stock_option_grants` quedó vacía y nunca se usó en frontend.

**Resolución:** `stock_option_grants` eliminada en recovery 30-abr-2026.
Toda referencia frontend debe apuntar a `stock_options` + vista `stock_options_valued`.

---

## P-011 · 30-abr-2026 · **RESUELTO** (recovery completo)
**Recovery tras incidente Copilot — 29-abr-2026**

Ver `docs/POSTMORTEM_29abr2026.md` para narrativa completa.

Tablas afectadas y acción tomada:
- `accounts` → DROP + recreación desde mig 1+7+10 inline
- `transactions` → DROP + recreación con columnas PSD2 nuevas (mig 22)
- `bank_connections` → DROP (schema Copilot incorrecto) + rediseño en mig 22
- `stock_option_grants` → DROP definitivo (ver P-010)

Holdings remapeados determinísticamente por nombre de cuenta (19 filas, 7 grupos).

---

## Deuda técnica pendiente

| ID | Descripción | Prioridad |
|----|-------------|-----------|
| D-001 | CHECK constraint en `holding_prices`: exigir ticker OR isin NOT NULL (ver P-008) | Baja |
| D-002 | Migraciones 10, 11, 13 no están commiteadas en el repo (solo en Supabase) | Media |
| D-003 | `app/api/callback/route.ts` y `app/api/bank/` usan schema de bank_connections de Copilot — adaptar a mig 22 | Alta |
| D-004 | `supabase/seed/` no existe en repo — crear seed_accounts.sql y seed_holdings.sql para recovery futura | Alta |
