# EGMFin · Tablero de estado de desarrollo

> Fuente de verdad editorial del proyecto. Sincronizar con `app/(egm)/estado/tablero.json` en cada cierre de sesión.
> Última actualización: 28-jun-2026 · commit post-mig-61 · deploy READY.

---

## Bloque actual

**B2 · Muro multiusuario** — **cerrado**

Foco activo: **Cierre semanal automático** (mig-61 / Piezas 1–3)

---

## Hecho

| Ref | Entregable |
|-----|-----------|
| mód | Inicio · Control · Cuentas · Nóminas · Pedidos · Planner/ZBB — 6 módulos canónicos |
| psd2 | Sync live Kutxabank + Santander · cron 22:35 UTC |
| 55–58 | B2 muro privacidad: `shares`, `can_see_visibility`, fugas selladas (compartir = solo lectura) |
| 59 | Auto-dedupe PENDING→BOOKED: `fn_supersede_pending_booked` + hook en `sync_psd2.py` |
| 60 | `/estado` tablero vivo: `fn_pending_review_dups` (INVOKER) + superficie editorial |
| P-020 | CategoryCombobox: selección en cualquier nivel de la taxonomía |
| datos | Wooloomooloo + 20 duplicados de junio neutralizados |
| 61 | Cierre semanal: `fn_close_week` (DEFINER) + `v_last_closure_health` + gate D-020 |
| D-020 | Doctrina: LLM = fraseo de hechos calculados, gate de salud antes de frasear |
| P-021 | Ritual de cierre: commiteado ≠ pusheado ≠ desplegado (permanente) |

---

## Pendiente

- Primer cierre mensual como acto deliberado (snapshot recomputable, opción B)
- AI Advisor: sellado a DB + corpus de dominio versionado
- Integrar cuentas de inversión en Cuentas (cobertura PSD2)
- ZBB rethink: plan base instanciado + deltas
- Añadir secret `ANTHROPIC_API_KEY` en GitHub Actions antes del primer run del cron `close_week`

---

## Horizonte

| Ref | Tema |
|-----|------|
| II | Módulo Proyectos (+ viajes como tipo de project) |
| capa | 2 · Retribución · 3 · Previsión |
| HQ | Household HQ: módulo + capa digest · vista SQL de cadencias → primer entregable |
| T-007 | Attachments polimórficos (tickets, nóminas, facturas) |
| T-008 | Parsing automático de PDF de nóminas |
| fase5 | Admin UI de taxonomía/categorías |

---

## Decisiones abiertas

- **Viaje:** ¿tipo de `project` (reutiliza `project_id` + presupuesto, recomendado) o entidad propia?
- **`projects` / `maristas_items` visibles a Ana al entrar** — compartido por diseño, confirmar
- Ubicación final del acceso a `/estado` en la nav (provisional: "estado →" en Inicio)

---

## Deuda técnica activa

| ID | Descripción |
|----|-------------|
| grant | `GRANT UPDATE` en `accounts` para `authenticated` (reasignación de titular / herencia) |
| T-025 | Extracción de líneas de pedido desde emails Amazon |
| T-026b | Matcher difuso de cuotas SEPA reales (aparcado; red de seguridad = enlace manual) |
| links | `bank_account_links` no share-aware (conservador, sin fuga activa) |
| shares | `scope='aggregate'` reservado en enum, sin construir |
| vista | `v_median_income_3m` en null hasta ~julio (≥3 meses de histórico) |
| RLS-ANA | Test RLS tri-state con sesión real de Ana pendiente |

---

## Ritual de cierre de sesión (P-021)

1. `git status -sb` — sin commits colgados
2. `git push`
3. Verificar deploy **READY** en Vercel antes de cerrar
