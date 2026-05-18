# egmfin-jobs

Scripts de mantenimiento y carga de datos para EGMFin. Se ejecutan manualmente o vía cron, nunca en el servidor Next.js.

Variables de entorno necesarias (todas): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Copiar `.env.example` a `.env` y rellenar.

---

## Scripts

### `update_prices.py`

Actualiza precios de cierre de acciones/fondos en `holding_prices`.

### `sync_psd2.py`

Importa transacciones desde GoCardless (PSD2) a la tabla `transactions`.

### `recategorize_existing.py` *(T-007)*

Aplica las reglas activas de `classification_rules` a todas las transacciones con `category_id IS NULL`.

**Uso:**

```bash
# Dry-run (por defecto) — solo preview, no modifica la DB
python3 recategorize_existing.py
python3 recategorize_existing.py --dry-run

# Aplicar cambios (pide confirmación antes de escribir)
python3 recategorize_existing.py --apply
```

**Flujo recomendado:**
1. `--dry-run` → revisar el preview (qué txn matchea qué regla y qué campos se setean)
2. `--apply` si todo está bien → confirmar con `s`

**Lógica:**
- Solo afecta txns con `category_id IS NULL`.
- Solo usa reglas con `is_active = true`.
- Primera regla que matchea gana (order: `priority ASC`, `created_at ASC`).
- Solo setea los campos `set_*` no-null de la regla: `category_id`, `project_id`, `nature`.
- Los campos D-005 (`set_titular`, `set_account_id`, `set_is_reimbursable`) se omiten — son para remap en `sync_psd2.py` (deuda T-018).
