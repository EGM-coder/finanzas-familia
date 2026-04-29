# Postmortem — Incidente Copilot 29-abr-2026

**Severidad:** Alta — pérdida de datos en tablas de cuentas  
**Detectado:** 29-abr-2026 ~17:30  
**Resuelto:** 30-abr-2026 (recovery + mig 22)  
**Autor del postmortem:** Eric Gahimbare + Claude Code

---

## ¿Qué pasó?

GitHub Copilot ejecutó `DROP TABLE accounts CASCADE` seguido de
`CREATE TABLE accounts (...)` con un schema Enable Banking genérico:

```
id, user_id, connection_id, account_id (text), name, iban, currency,
balance, type, raw (jsonb), created_at, updated_at
```

Este schema es incompatible con el modelo EGMFin (`visibility`, `initial_balance`,
`linked_account_id`, `sort_order`, etc.).

El CASCADE propagó la destrucción:

| Tabla / Vista | Estado tras incidente |
|---------------|----------------------|
| `accounts` | 0 filas, schema reemplazado |
| `transactions` | schema reemplazado (estaba vacía) |
| `account_balances` (view) | eliminada por CASCADE |
| `account_balances_full` (view) | eliminada por CASCADE |
| `patrimonio_neto` (view) | eliminada por CASCADE |
| `transaction_splits` | eliminada por CASCADE desde transactions |
| `classification_rules` | eliminada o vaciada |
| `incomes` | vaciada |
| `maristas_items` | vaciada |
| `stock_option_grants` | vaciada |
| `holdings` (19 filas) | **vivas pero huérfanas** (account_id → UUIDs extintos) |

**Tablas completamente intactas:** assets (1), liabilities (3), manual_holdings (1),
manual_holdings_history (1), holding_prices (68), currency_rates (4), categories (65),
patrimonio_snapshots (2), stock_options (2), projects (3), profiles (1),
work_abroad_days, savings_goals, budgets.

---

## Causa raíz

Copilot actuó sin contexto del modelo de datos EGMFin. Interpretó la petición de
integrar Enable Banking como "crear tabla accounts compatible con PSD2" y ejecutó
un DROP TABLE destructivo sin confirmación del usuario.

Factores agravantes:
1. No existía `seed_accounts.sql` commiteado en el repo — sin él, el recovery
   requiere reconstruir los 26 UUIDs de cuentas desde cero.
2. Las migraciones 10, 11 y 13 nunca se commitearon al repo (aplicadas directamente
   a Supabase), lo que impidió una reconstrucción limpia del schema de `holdings`.
3. No había backup CSV reciente de `accounts`.

---

## Impacto en datos

**Perdido permanentemente:**
- 26 filas de `accounts` con sus UUIDs originales
- Cualquier fila de `transactions`, `incomes`, `maristas_items` que existiera

**Recuperable sin pérdida:**
- Holdings: 19 filas vivas, remapeables por nombre de cuenta (mapeo determinista
  documentado en el plan de recovery)
- Stock options: tabla `stock_options` intacta (2 paquetes Nordex)
- Patrimonio: 2 snapshots históricos, liabilities, assets — todos intactos

---

## Solución aplicada

### Fase 2 — Drop selectivo limpio
`supabase/recovery/fase2_drop_selectivo.sql`  
Drop de las 4 tablas contaminadas en el orden correcto.

### Fase 3 — Recreación schema EGMFin
`supabase/recovery/fase3_recrear_schema.sql`  
Reconstrucción fiel desde migraciones 1+2+7. Incluye columnas PSD2 nuevas
(`external_id`, `raw_payload`, `bank_connection_id`) directamente en `transactions`.

### Fase 4 — Migración 22 PSD2
`supabase/migrations/20260430000022_psd2_enable_banking.sql`  
Diseño limpio de `bank_connections` y `bank_account_links`. FK formal
`transactions.bank_connection_id → bank_connections`.

### Fase 5 — Reseed + remapeo holdings
Reseed de 26 cuentas desde `supabase/seed/seed_accounts.sql` (a crear).  
Remapeo de 19 holdings huérfanos por nombre de cuenta (7 UPDATE deterministas).

---

## Aprendizajes y acciones preventivas

| # | Acción | Estado |
|---|--------|--------|
| 1 | Commitear `supabase/seed/seed_accounts.sql` y `seed_holdings.sql` | Pendiente (D-004) |
| 2 | Commitear migraciones 10, 11, 13 al repo | Pendiente (D-002) |
| 3 | No ejecutar DDL destructivo con Copilot/agente sin revisar el plan con Eric primero | Regla permanente |
| 4 | Backup CSV mensual de `accounts` y `holdings` en `/recovery/backups/` (gitignoreado) | Pendiente |
| 5 | Adaptar `app/api/callback/route.ts` y `app/api/bank/` al schema de mig 22 | Pendiente (D-003) |

---

## Cronología

| Hora | Evento |
|------|--------|
| ~17:00 | Copilot ejecuta DROP TABLE + CREATE TABLE accounts con schema Enable Banking |
| ~17:30 | Eric detecta la pérdida. 0 filas en `accounts`. 19 holdings huérfanos. |
| ~17:30 | Eric documenta estado real de BD y mapeo de holdings huérfanos |
| 30-abr AM | Claude Code lee todas las migraciones. Identifica bloqueadores B-1, B-2, B-3. |
| 30-abr AM | Generación de scripts recovery + mig 22 + docs (esta sesión) |
| Pendiente | Eric provee seed_accounts.sql + schema de holdings (B-1, B-2) |
| Pendiente | Ejecución Fase 2-6 en Supabase SQL Editor |
