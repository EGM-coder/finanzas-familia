# Vigilancia de EGMFin

> La vigilancia de EGMFin vive fuera de EGMFin (P-031).
> Incidente 23-sep → 08-oct-2026: GitHub desactivó los crons, Supabase pausó la base,
> y las alarmas internas murieron con ella. Nadie se enteró en 15 días.

El vigilante es **Healthchecks.io** (cuenta de Eric). Avisa por correo cuando un check:
- recibe un ping `/fail`, o
- **deja de recibir pings** dentro de su período + gracia (cron muerto, runner caído, workflow desactivado).

## Cómo se conecta

- Secret de repo: **`HC_PING_KEY`** (Healthchecks → Project Settings → Ping key). Es lo único que hay que guardar; nunca va en el repo.
- URL de ping: `https://hc-ping.com/<HC_PING_KEY>/<slug>[/start|/fail]?create=1`.
  `create=1` autoprovisiona el check la primera vez que llega un ping con ese slug.
- Helper: `egmfin-jobs/hc.py`. Nunca lanza excepción; sin `HC_PING_KEY` no hace nada (lo loguea).

## Checks

| Slug | Lo pinguea | Dispara `fail` cuando | Período a configurar | Gracia sugerida |
|------|-----------|-----------------------|----------------------|-----------------|
| `egmfin-sync-psd2` | `sync_psd2.py` (diario 22:35 UTC) | exit ≠ 0 (errores 4xx de consentimiento) o excepción | 1 día | 3 h |
| `egmfin-update-prices` | `update_prices.py` (diario 22:30 UTC) | exit ≠ 0 = ningún precio obtenido. `partial` (algún fondo sin NAV) = **ok** | 1 día | 3 h |
| `egmfin-close-week` | `close_week.py` (lunes 06:00 UTC) | exit ≠ 0 (fn_close_week falla, LLM falla, UPDATE falla) | **7 días** | 6 h |
| `egmfin-alarmas` | `check_alarms.py` (step final de `sync_psd2`, corre aunque el sync falle; antes corre `parse_nominas.py --match-only`, T-043) | alguna vista `v_*_freshness` en `rojo`, o no puede leer Supabase (base pausada) | 1 día | 3 h |
| `egmfin-keepalive` | `keepalive.yml` (domingos 07:00 UTC) | el commit/push del keepalive falla | **7 días** | 1 día |

Los checks autoprovisionados nacen con período 1 día / gracia 1 h. **Hay que ajustar a mano** `egmfin-close-week` y `egmfin-keepalive` a 7 días, o mandarán un falso "down" cada día. Las gracias de 3 h cubren los retrasos habituales de los crons de GitHub.

## Qué cubre cada capa

| Fallo | Quién avisa |
|-------|-------------|
| Un job termina con error | Su check → `fail` |
| GitHub desactiva los crons / runner no arranca | Todos los checks → "down" por ausencia de ping |
| Supabase pausada o caída | `egmfin-alarmas` → `fail` ("no puede leer Supabase"); los jobs → `fail` |
| Dato desfasado (nómina sin casar, etc.) | `egmfin-alarmas` → `fail` con el motivo |
| Repo sin actividad 60 días → crons desactivados | Lo previene `keepalive.yml`; si falla, `egmfin-keepalive` |

## Qué hacer al recibir un correo

1. **Mira el slug y el cuerpo** del ping en Healthchecks (Events del check). En `fail` el cuerpo trae el motivo (≤ 500 caracteres).
2. **Según el check:**
   - `egmfin-sync-psd2` → GitHub Actions › sync_psd2 › log. Lo típico: consentimiento PSD2 caducado (renovar en Enable Banking).
   - `egmfin-update-prices` → log de update_prices. Todos los tickers sin precio = problema de yfinance o de red.
   - `egmfin-close-week` → log de close_week; revisar `weekly_closures` de la semana.
   - `egmfin-alarmas` →
     - "Nómina: abono … sin nómina casada" (> 15 días) → el casado diario no pudo casarlo: o falta la nómina, o no cuadra al céntimo, o hay dos abonos con el mismo período. Subir el PDF de la nómina al bucket `nominas` y lanzar `parse_nominas` (casa solo si cuadra al céntimo). Si no cuadra, casar a mano en /ingresos.
     - "Nómina: última nómina … hace N días" (> 75 días) → faltan dos nóminas: subir los PDFs y lanzar `parse_nominas`.
     - "no puede leer Supabase" → dashboard de Supabase; si está pausada, **Restore project**.
   - `egmfin-keepalive` → log de keepalive (permisos `contents: write`).
3. **Check en "down" sin `fail`** (no llegó ningún ping) → GitHub › Actions: ¿el workflow está desactivado ("This scheduled workflow is disabled…")? Reactivar con **Enable workflow** y lanzarlo a mano.
4. El check vuelve a verde solo con el siguiente ping `ok`.

## Probar el vigilante

```bash
cd egmfin-jobs
HC_PING_KEY=... python3 check_alarms.py --test-fail   # fuerza /fail en egmfin-alarmas (no escribe job_runs)
HC_PING_KEY=... python3 check_alarms.py               # restaura a ok
```

Sin la clave en local (lo normal, P-033): **Actions › hc_test › Run workflow**. Fuerza el `/fail`, espera 90 s y restaura a `ok`. Deben llegar dos correos: DOWN y UP.

También: Actions › sync_psd2 › Run workflow (el step "Check alarms" pinguea `egmfin-alarmas`).

Primera prueba real: 08-oct-2026.

## Añadir algo nuevo a la vigilancia

- **Job programado nuevo:** en `__main__`, `import hc; hc.run('egmfin-<nombre>', main)` y `HC_PING_KEY: ${{ secrets.HC_PING_KEY }}` en el `env` del step. Ajustar período en Healthchecks.
- **Alarma de datos nueva:** vista `public.v_<algo>_freshness` con columna `status ∈ {ok, ambar, rojo}`. `check_alarms` la descubre sola (OpenAPI de PostgREST); para un motivo legible, añadir un formateador en `DESCRIBERS` de `check_alarms.py`.
