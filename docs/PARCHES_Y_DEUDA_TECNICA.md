# Parches y Deuda Técnica — EGMFin

Registro de decisiones no-obvias, workarounds y deuda técnica activa.  
Formato: `P-NNN · (fecha) · estado · descripción`

---

## Convención de identificadores

| Serie | Uso |
|-------|-----|
| **D-xxx** | Decisiones doctrinales |
| **T-xxx** | Deuda técnica (este archivo) |
| **P-xxx** | Parches / lecciones aprendidas |

No mezclar series. Al asignar un identificador nuevo, verificar el mayor en uso
**de esa serie** antes de fijarlo.

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

## P-012 · 12-may-2026 · **RESUELTO** (commit 2e6f4e2)
**Colisiones de external_id en sync_psd2 causan pérdida silenciosa de txns**

Sync PSD2 descargaba 164 txns desde Enable Banking pero solo persistía 162.

**Causa raíz:**
- Hash MD5 fallback en `sync_psd2.py` usaba solo 3 campos: `booking_date + amount(absoluto) + description`
- 21 txns sin `entry_reference` nativo (19 Kutxabank, 2 Santander): BIZUM sin concepto, COMISION, CUOTA PTMO, ANUL., TARJ.CRDTO
- Hash usaba `amount` sin signo → DBIT 3.25€ y CRDT 3.25€ colisionaban
- Hash sin counter intra-batch → 2x ANUL. TRANSF. idénticas (4-mar, 870€) colisionaban

**Casos concretos perdidos:**
- 30-abr Kutxabank: `COMISION CAJERO SERVIRED 3.25€` (DBIT y CRDT) → 1 perdida
- 4-mar Kutxabank: 2x `ANUL. TRANSF. 0049 COMUN extra 870€` idénticas → 1 perdida

**Fix aplicado:**
- IDs nativos EB con prefijo: `er_<entry_reference>`, `tid_<transaction_id>`
- Fallback SHA-256 con 11 campos: incluyendo `credit_debit_indicator`, contraparte, IBAN origen/destino, remittance completo
- Counter intra-batch (`_seq1`, `_seq2`) para duplicados verdaderos

**Verificación:** sync 12-may-2026 = 164/164 (vs 162/164 anterior con bug).

**Comportamiento PSD2 documentado:**
Las anulaciones (`ANUL.`, devoluciones cajero) son válidas: PSD2 muestra la verdad contable del banco. Reportes futuros pueden usar `is_reimbursable` / `reimbursed_at` (ya en schema) para neteado automático.

---

## P-013 · 13-may-2026 · **RESUELTO** (commit d413bd1)
**Sync diario borraba categorizaciones manuales de transacciones PSD2**

El loop LIVE de `sync_psd2.py` hacía `DELETE + INSERT` por cada txn descargada, sobreescribiendo todos los campos incluyendo los de categorización manual (`titular`, `account_id`, `nature`, `category_id`, `project_id`, `paid_by_user_id`, `is_reimbursable`, `reimbursed_at`).

**Caso real que dispara el parche:**
Txns de tarjeta de Ana que llegan vía cuenta Santander común se re-mapean manualmente a `titular='ana'` + cuenta `Tarjeta Santander Ana`. El siguiente sync diario las revertía a `titular='eric'` + cuenta Santander común.

**Fix aplicado:**
- Definida constante `BANK_FIELDS` con los 8 campos del banco que el sync puede tocar
- Batch SELECT previo: un solo query por cuenta, recupera filas existentes por `external_id`
- Clasificación en tres cubos: `to_insert` / `to_update` / `unchanged`
- UPDATE selectivo: solo `{f: rec[f] for f in BANK_FIELDS}`, nunca toca campos de categorización
- Helper `_bank_fields_changed()` normaliza `amount` a float para comparación correcta
- DRY_RUN acumula totales correctamente y muestra previews de INSERTs y UPDATEs

**Verificación:** DRY_RUN tras P-013 sobre las 160 txns previas = 0 insertarían / 0 actualizarían / 160 sin cambios. LIVE 14-may-2026: 6 txns nuevas insertadas / 0 actualizadas / 160 sin cambios.

---

## P-014 · (regla permanente)
**Next.js `<Link>` no acepta prop `disabled`**

Para estados deshabilitados en navegación interna con `<Link>`, conmutar el elemento (no la prop): `<Link>` cuando activo, `<span>` con estilos disabled cuando borde. Aplicado primero en `ControlPagination.tsx` (hotfix T-001, 15-may-2026). Patrón a replicar en cualquier paginación o navegación con bordes condicionales (drawer Fase 3 y posteriores).

---

## T-011 · 30-may-2026 · **RESUELTO**
**`raw_concept` almacenaba el payload JSON crudo de Enable Banking**

`sync_psd2.py` → `map_txn()` poblaba `raw_concept` con `json.dumps(txn)[:2000]` — el dict completo de Enable Banking serializado. La intención de la columna es almacenar el concepto bancario legible (remittance_information), no el JSON de transporte.

**Impacto:** DAT-1 garantizaba que `raw_concept` nunca era visible en UI, pero las reglas de clasificación (match_field='raw_concept') matcheaban contra JSON, no contra texto. El campo era inutilizable para reglas futuras del tipo "concepto contiene X".

**Solución:**
- `sync_psd2.py` · `map_txn()`: `raw_concept = ' | '.join(remittance_information)` si no vacío, `None` si vacío. Sin fallback a reference_number (description mantiene el suyo).
- `backfill_raw_concept_t011.py`: script standalone idempotente con dry-run/apply. Parsea el JSON de las txns existentes y reconstruye el valor limpio con el mismo criterio.

**Verificación:** backfill --apply 30-may-2026 = 170 éxitos, 0 fallos. SELECT post-apply: 0 filas con `raw_concept LIKE '{%'`.

---

## P-015 · 31-may-2026 · **ACTIVO** (regla permanente)
**Colisiones de número lógico en migraciones**

Los sufijos numéricos cortos (22, 23, 24, 25, 29, 30…) aparecen en más de una tanda de fechas distintas. Ejemplo: `20260506000023` (psd2_grants) y `20260517000023` (grants_classification_rules) comparten sufijo 23 pero son archivos distintos.

**Por qué no es un bug:** Supabase ordena y rastrea migraciones por el **nombre completo del archivo** (`schema_migrations` almacena el nombre entero). El timestamp del prefijo garantiza el orden de aplicación correcto.

**Por qué no se renumera:** `supabase db push` identifica migraciones ya aplicadas por nombre. Renombrar un archivo ya aplicado lo haría aparecer como migración nueva y se aplicaría dos veces, corrompiendo el historial.

**Regla:** al crear una migración, verificar que el **prefijo timestamp completo** `YYYYMMDDNNNNNN` sea único en `supabase/migrations/`. El sufijo numérico corto puede colisionar entre fechas; no es identificador único.

---

## P-016 · 01-jun-2026 · **RESUELTO**
**Sync PSD2 fallaba en silencio: job verde con 0 inserciones, 2 semanas de datos congelados**

El job de sync (`sync_psd2.py`) terminaba con exit 0 (verde en GitHub Actions) aunque ninguna transacción se insertara. Causa: `fetch_account_transactions` pedía `date_from = now − 90 días`; el límite regulatorio PSD2 sin SCA es estrictamente < 90 días. Kutxabank y Santander devolvían 422 Client Error, el `except Exception` lo logueaba como `❌ Error fetching` y continuaba. El job sumaba 0 transacciones pero terminaba verde. Dos semanas de datos congelados sin ninguna alerta.

**Fix doble (commits 94173e4 + este):**

1. **Ventana 90 → 89 días** (`DAYS_BACK` y default de `fetch_account_transactions`): margen seguro bajo el tope PSD2. Sigue configurable vía env var `DAYS_BACK`.
2. **4xx ahora marca exit ≠ 0:** se distingue `requests.exceptions.HTTPError` del resto de excepciones. Si el código HTTP es 4xx, el job acumula el contador `accounts_with_4xx` y termina con `sys.exit(1)` tras procesar todas las cuentas (no aborta a mitad — las cuentas siguientes se procesan igualmente). GitHub Actions marca el run rojo y llega notificación. Los 5xx y otras excepciones transitorias siguen con `continue` sin romper el job.

**Lección:** un sync que falla en verde es peor que uno que se cae con estruendo. Las alertas silenciosas no son alertas.

---

## P-017 · 02-jun-2026 · **ACTIVO** (regla permanente)
**SCHEMA.md §4 declaró GRANTs que no existían → drift invalidó un diagnóstico**

`categories` aparecía en §4 con `✓ RLS` en INSERT/UPDATE. Esa marca se escribió por inferencia ("Grupo C, debería tener GRANT") sin verificar contra las migraciones reales. Resultado: al diagnosticar el error de creación de categorías, la primera hipótesis fue "no es 42501 porque §4 dice que el GRANT existe" — lo que retrasó el diagnóstico correcto.

**Causa raíz del drift:** §4 se escribe manualmente y se actualiza solo cuando un GRANT falla en producción. Las tablas que nunca tuvieron un flujo UI de escritura mantienen la marca `✓ RLS` aunque el GRANT real no exista en ninguna migración.

**Regla:** al marcar `✓` en §4, la fuente de verdad debe ser el `grep` de migraciones, no la inferencia. Formato correcto: `✓ mig N` si hay GRANT explícito, `✗` si no lo hay. `✓ RLS` solo debe usarse si una migration previa ya añadió el GRANT implícitamente (caso poco probable — documentarlo si ocurre).

**Auditoría pendiente:** otras filas de §4 con `✓ RLS` en INSERT/UPDATE deben verificarse contra migraciones. Candidatos con riesgo: `savings_goals`, `assets`, `liabilities`, `incomes`, `work_abroad_days`, `transaction_splits` — ninguna tiene migración de GRANT explícita.

---

## P-018 · 02-jun-2026 · **DEUDA LATENTE** (no arreglar aún)
**`accounts` (mig 01) carece de GRANT INSERT/UPDATE para `authenticated`**

`accounts` está en la misma migración que `categories` (mig 01 `maestros.sql`) y tiene el mismo problema estructural: ninguna migración añade `GRANT INSERT, UPDATE ON accounts TO authenticated`. La tabla funciona en lectura (SELECT existe), pero cualquier flujo UI de creación/edición de cuentas fallará con 42501.

**Por qué no se arregla ahora:** no existe flujo UI de escritura sobre `accounts` para usuarios autenticados (las cuentas se crean manualmente en Supabase Dashboard con service role, o via Python jobs). Añadir el GRANT de forma especulativa, sin el flujo que lo necesita, viola el principio de no añadir lo que no se usa.

**Acción cuando se construya el flujo:** añadir `GRANT INSERT, UPDATE ON public.accounts TO authenticated` en la misma migración que el flujo UI de creación de cuentas (p.ej. panel de cuentas de Ana, o gestión de cuentas en /configuracion). No antes.

---

## P-019 · 04-jun-2026 · **RESUELTO** (T-036, mig 45-46)
**Dos esquemas de external_id incompatibles generaban duplicados en transactions**

El ingesta PSD2 usó en distintos momentos dos esquemas de `external_id`:
- **`h_<md5>`** (hash-based): el hash incluía `booking_date` (vacío en PENDING) y `remittance_information` (cambia entre PENDING y BOOKED). Mismo cargo bancario → hash distinto → dos filas.
- **`er_YYYY-MM-DD.N`** (posicional, entry_reference): indexación por fecha y posición en el JSON de la API.

Ambos esquemas coexistían y no se deduplicaban entre sí. Resultado: 5 transacciones reales ingresadas dos veces con `external_id` distintos → doble conteo en Control, Planner y vistas.

**Lección:** el `external_id` para deduplicación PSD2 debe ser el `entry_reference` nativo del banco cuando exista (campo estable, asignado por el banco al confirmar la transacción, idéntico entre PENDING y BOOKED). Usar hash propio sobre campos que cambian entre estados garantiza duplicados.

**Solución aplicada:** columna `transactions.superseded_by uuid FK self` (mig-45). Las 5 filas `h_` marcadas como `superseded_by = <id_er_canónico>`. Las vistas `v_spent_by_category_month`, `v_spent_by_category_week`, `v_fixed_expenses_observed` y todas las queries directas del frontend filtran `superseded_by IS NULL`. Totalmente reversible: `SET superseded_by = NULL` para rehabilitar.

---

## P-020 · 13-jun-2026 · **RESUELTO**
**CategoryCombobox: selección en cualquier nivel de la taxonomía (fix bug hojas-only en 3 niveles)**

Con la taxonomía expandida a tres niveles (ej. Alimentación → Supermercado → Vino), los nodos intermedios dejaron de ser seleccionables en el picker de categorización. "Supermercado" (af369d7d, 28 transacciones) desapareció de la lista al ganar el hijo "Vino", aunque seguía siendo un `category_id` válido en `transactions`.

**Raíz:** `CategoryCombobox` computaba `branchIds` (IDs con al menos un hijo) y filtraba `selectables = categories.filter(c => !branchIds.has(c.id))` — solo hojas puras. Al crecer la taxonomía, cualquier nodo intermedio quedaba invisible.

**Solución:** eliminada la lógica `branchIds`/`selectables`. Reemplazada por `treeItems(rootId)` (DFS desde la raíz del grupo) que devuelve todos los nodos con su profundidad. El rendering usa `paddingLeft: 14 * depth` para la indentación visual. Todos los nodos no-raíz son seleccionables. Archivo: `app/(egm)/control/_components/CategoryCombobox.tsx`.

**Fuera de alcance:** roll-up de totales padre-incluye-hijos en reporting (hilo separado).

---

## P-021 · 13-jun-2026 (registrado 28-jun-2026) · **PERMANENTE**
**Commiteado ≠ pusheado ≠ desplegado — ritual de cierre obligatorio**

Deploy estuvo en ERROR con trabajo sin pushear. "Working tree clean" de Claude Code refleja solo lo que tocó en esa sesión, no el estado global del repo. El indicador de Vercel es el único artefacto de verdad sobre el deploy.

**Ritual de cierre de cada sesión de trabajo:**
1. Eric ejecuta `git status -sb` — confirma que no quedan commits colgados.
2. Push (`git push`) si hay commits locales.
3. Verifica deploy READY en el dashboard de Vercel (egmfin.vercel.app) antes de cerrar.

**Por qué permanente:** el ciclo commit→push→deploy tiene tres saltos independientes; falla en silencio si se omite cualquiera. No es un bug a resolver: es un ritual a interiorizar.

---

## P-023 · 04-jul-2026 · **PERMANENTE**
**fn_supersede_pending_booked: normalizar descripción antes de emparejar PENDING→BOOKED**

Los bancos mutan la descripción entre el evento PENDING (h_) y el BOOKED (er_):
- Santander añade ":" al concepto: `CONCEPTO Alquiler` → `CONCEPTO: Alquiler`
- Kutxabank duplica el concepto: `OP.NET COMUN` → `OP.NET COMUN  OP.NET COMUN`

La v1 exigía `description IS NOT DISTINCT FROM` → los pares no casaban → −2.025,66 € de gasto duplicado visible (5 pares, verificado 04-jul-2026).

**Regla:** antes de comparar descripciones en cualquier deduper PSD2, aplicar:
`norm(x) = trim(regexp_replace(lower(replace(x, ':', '')), '\s+', ' ', 'g'))`
Emparejar por: `norm(e)=norm(h)` OR `norm(h) ⊂ norm(e)` OR `norm(e) ⊂ norm(h)`.
Emparejamiento 1:1 estricto mediante `ROW_NUMBER` por ambos lados del par.

Adicionalmente: heredar la decisión humana (category_id, project_id, nature, is_reimbursable)
del h_ al er_ si el campo er_ es NULL — preserva la clasificación hecha en PENDING.

Resuelto en mig-66. Limitación residual → T-040 (fecha valor distinta entre PENDING y BOOKED).

---

## P-024 · 05-jul-2026 · **PERMANENTE**
**No desviar a subcuenta de tarjeta lo que no tiene feed granular — el agregado pertenece a la cuenta donde ocurre**

`classification_rules` con `set_account_id` puede enrutar transacciones a una subcuenta de tarjeta. Esto es correcto SOLO si esa tarjeta tiene un feed PSD2 propio con movimientos línea a línea. Si el banco expone únicamente el IBAN (una sola cuenta CACC), los cargos de liquidación agregada (`TARJ.CRDTO …`) son movimientos del IBAN, no de la subcuenta.

**Lo ocurrido:** rule#d03dbac0 (priority 30, `starts_with 'TARJ.CRDTO 4921'`, `set_account_id → Tarjeta Kutxabank Eric`) desviaba el cargo mensual de liquidación a la subcuenta de crédito. El consentimiento PSD2 de Kutxabank expone solo el IBAN. Resultado: 5 liquidaciones (mar–jul 2026, −5.734,93 €) estaban mal enrutadas → IBAN inflado 5.734,93 €; subcuenta con "deuda" artificial de 4.880,55 € (P-002 sobre initial_balance 854,38 sin base real).

**Fix (mig-68, 05-jul-2026):**
1. `classification_rules` rule#d03dbac0 → `is_active = false`.
2. 5 txns `TARJ.CRDTO` movidas de Tarjeta Kutxabank Eric → Kutxabank IBAN (conservando `category_id`, `nature` y toda decisión existente). Idempotente por `WHERE account_id = card_id`.
3. Tarjeta Kutxabank Eric → `initial_balance = 0`, `is_active = false`.
4. Kutxabank = 6.927,10 € (verificado post-fix = saldo banco real).

**Regla permanente:** antes de crear una regla con `set_account_id` apuntando a una subcuenta de tarjeta, verificar en `raw_session`/`bank_account_links` que exista un feed activo para esa tarjeta. Las liquidaciones agregadas (`TARJ.CRDTO`, `LIQUIDACION TARJETA`…) siempre van al IBAN.

---

## P-026 · 05-jul-2026 · **PERMANENTE**
**Ninguna operación destructiva sin solicitud explícita — proponer y esperar aprobación**

Regla de colaboración: operaciones `DELETE`, `TRUNCATE`, `DROP`, purgas masivas de datos o cualquier acción irreversible sobre la BD o el repositorio solo se ejecutan cuando el prompt las solicita de forma explícita. Si el asistente detecta que una operación destructiva parece necesaria o conveniente, la propone en texto y espera confirmación antes de ejecutarla.

**Por qué:** durante el fix de P-025 se ejecutó un `DELETE` de entradas fin-de-semana en holding_prices sin que el prompt lo pidiera. La purga borró el histórico EU, dejando MC con 1 sola fila. El histórico fue reconstruible vía backfill, pero el incidente consumió tiempo y requirió trabajo extra.

**Cómo aplicar:** ante cualquier duda sobre si una acción es destructiva, aplicar la regla. El coste de esperar una confirmación es bajo; el coste de borrar datos legítimos es alto. Incluye: borrado de filas o tablas, `git reset --hard`, `git push --force`, eliminación de ficheros de código o migrations, purgas en bucle o batch.

---

## P-025 · 05-jul-2026 · **PERMANENTE**
**Un job que degrada en silencio no es un job — exit code refleja completitud**

`update_prices.py` llevaba desde el 29-jun sin actualizar los tickers EU (MC.PA, RMS.PA, RACE.MI, REP.MC, VHYL.AS, NDX1.DE). Dos bugs independientes:

1. **yfinance sin versión fijada:** el workflow hacía `pip install yfinance` sin pin. La versión 1.4.x (publicada ~29-jun) rompió silenciosamente la descarga de exchanges europeos devolviendo DataFrame vacío. El script imprimía "sin datos" para cada ticker EU y terminaba con **exit 0** → Actions lo marcaba verde.

2. **Fecha estampada = TODAY en vez de la fecha real del cierre:** `upsert_holding_price` usaba `date.today().isoformat()` para la columna `date`. Los fines de semana (sin mercado abierto) el script almacenaba precios con fecha sábado/domingo en lugar de la fecha del último cierre real. Esto generó ~160 entradas fantasma de tipo "mismo precio, fecha incorrecta" desde mayo de 2026.

**Fix (05-jul-2026):**
- `requirements.txt` creado con `yfinance>=1.5.1` (versión que volvió a funcionar con EU).
- `update_prices.yml`: `pip install -r egmfin-jobs/requirements.txt` en lugar de `pip install yfinance supabase python-dotenv`.
- `fetch_price` / `fetch_eur_rate` ahora devuelven `price_date = hist.index[-1].date().isoformat()` (fecha real del cierre del índice yfinance).
- `upsert_holding_price` recibe `price_date` como parámetro; el DELETE+INSERT usa esa fecha.
- `main()` acumula tickers fallidos y llama `sys.exit(1)` si `failed` no está vacío → Actions marca el run en rojo.
- 160 entradas fantasma (fecha = fin de semana, BTC e IE0032620787 excluidos) purgadas de la BD.

**Regla:** todo job de ingestión debe: (a) fijar versiones de dependencias externas en `requirements.txt`; (b) propagar el error como exit code 1, nunca silenciarlo; (c) usar la fecha real del dato, no la fecha de ejecución del proceso.

---

## P-022 · 28-jun-2026 · **PERMANENTE**
**SECURITY DEFINER + GRANT TO role no basta — REVOKE FROM PUBLIC en cada función SECURITY DEFINER nueva**

Postgres concede `EXECUTE` a `PUBLIC` por defecto al crear una función. PostgREST expone toda función del schema `public` a `anon`. Resultado: una función `SECURITY DEFINER` escritora (weekly_closures, transactions, snapshots) era callable por cualquier petición no autenticada, saltándose el RLS completamente.

Detectado en auditoría post-mig61: `fn_close_week`, `fn_supersede_pending_booked` y `capture_patrimonio_snapshot` tenían `anon_exec=true`.

**Regla:**
- En cada función `SECURITY DEFINER` nueva: inmediatamente después del `CREATE OR REPLACE`, incluir `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC` y `GRANT EXECUTE ... TO <rol_intencionado>`.
- Helpers de RLS (`can_*`, `user_role`) que necesiten ser evaluados por RLS policies: conservar `authenticated`; considerar T-039 para endurecer `anon`.
- Verificar siempre con `has_function_privilege('anon', oid, 'EXECUTE')` tras aplicar (P-021: aplicado ≠ verificado).

Resuelto en mig-62 para los 3 writers. T-039 pendiente para los 6 helpers.

---

## Doctrinas activas

| ID | Doctrina | Registrada |
|----|----------|------------|
| D-026 | **Todo saldo calculado debe tener ancla externa diaria; toda automatización reporta su propio pulso.** El caso Santander (3.600 € de desviación durante meses sin detección) y el caso EU-prices (5 días congelado sin alarma) evidenciaron que los datos de la app pueden divergir de la realidad bancaria sin que el sistema lo detecte. Dos mecanismos permanentes: (1) `balance_checks` — en cada sync PSD2, Enable Banking devuelve el saldo real del banco por cuenta; se guarda en BD y se compara contra `account_balances_full.current_balance` en `/estado`. Delta > 0,01 € → alerta roja. (2) `job_runs` — cada job insertable (sync_psd2, update_prices, …) inserta una fila al final: status ok/error/partial + detail jsonb. `/estado` muestra la última ejecución de cada job con indicador de frescura (rojo si > 36 h para PSD2, > 96 h para precios). | mig-69 · 05-jul-2026 |
| D-025 | **Tarjetas débito = lente de gasto, no portadoras de saldo. El saldo vive en la cuenta IBAN vinculada.** P-002 aplicaba a todas las subcuentas `type='card'` el modelo de deuda (saldo invertido). Las tarjetas Santander son DÉBITO: cada compra sale del IBAN al instante, no existe liquidación mensual. Con P-002 sin distinción: (a) el IBAN mostraba un saldo incorrecto (excluía los movimientos de sus tarjetas débito); (b) las tarjetas débito aparecían como "deuda positiva" en patrimonio. **Distinción:** `accounts.card_mode='debit'` → `current_balance = 0`; la cuenta IBAN padre suma los movimientos activos (`superseded_by IS NULL`) de todas sus tarjetas débito vinculadas. `card_mode='credit'` → P-002 sin cambios (Kutxabank). La `transactions_sum` sigue siendo suma bruta; el cambio está solo en `current_balance`. En la UI (`/cuentas` drill-down del IBAN): tarjetas débito mostradas como "Medios de pago" con gasto del mes, sin cifra de saldo/deuda. | mig-67 · 04-jul-2026 |
| D-005 | **Fuente única de categoría en Pedidos.** La categoría de un cargo PayPal/Amazon vive en UN SOLO SITIO: `transactions.category_id` del cargo enlazado. `purchase_orders` no guarda copia. Flujo: (1) si el pedido tiene cargo confirmado o manual → leer/escribir `transactions.category_id`; (2) si no tiene cargo → leer/escribir `purchase_order_lines.category_id` como provisional; (3) en el instante del enlace (`confirmMatch` o `linkManual`) → volcar la categoría provisional de la línea al cargo. Implementado en `app/(egm)/pedidos/_actions/pedidos.ts` · `updateOrderCategory`, `confirmMatch`, `linkManual`. | T-022a · 02-jun-2026 |
| D-024 | **El semáforo del cierre juzga solo gasto discrecional vs habitual; fijo_recurrente, traspasos y categorías sin histórico quedan fuera del JUICIO. `total_spent` sigue reflejando todo el gasto real.** `fijo_recurrente` es un compromiso, no una desviación: el alquiler, seguros y suscripciones no deben provocar rojo. La vista `v_discretionary_spend_by_category_week` añade `AND t.nature IS DISTINCT FROM 'fijo_recurrente'` al filtro de `v_spent_by_category_week`. `fn_close_week`: `total_spent` sigue leyendo `v_spent_by_category_week`; `semaforo`, `total_habitual`, `disc_spent_for_ratio` y `top_deviations` leen `v_discretionary_spend_by_category_week`. INNER JOIN en ratio y top_deviations → categorías sin histórico discrecional en las 8 semanas previas excluidas del juicio (no pueden ser "desviación sobre un habitual que no existe"). | mig-65 · 01-jul-2026 |
| D-023 | **El gasto con `project_id` queda fuera del basis de gasto-por-categoría.** Es un sobre transversal (reforma, viaje, equipamiento) — vive contabilizado en el proyecto, no como gasto habitual de categoría. Mismo mecanismo que `nature` saca los traspasos: filtro `AND t.project_id IS NULL` en las dos ramas (splits + directa) de `v_spent_by_category_week` y `v_spent_by_category_month`. La exclusión aplica a **todo** `project_id` sin distinción de `kind` (también corrige el leak latente de la reforma Maristas en el habitual). `projects.kind` ('general' \| 'viaje') es clasificación informativa, no palanca del filtro. Consumidores (`fn_close_week`, `v_category_budget_status`, `v_median_spend_3m_by_category`, Control, Planner): cambio sustractivo, no rompe shape. | mig-64 · 29-jun-2026 |
| D-022 | **Semáforo del cierre semanal = gasto vs habitual (mediana 8 semanas por categoría).** El presupuesto NO es la base del cierre semanal; se activa como capa propia (módulo VIII) el próximo año fiscal cuando haya evidencia suficiente. `total_budget` queda NULL en `weekly_closures` hasta entonces. `semaforo=NULL` = histórico insuficiente (< 4 semanas con dato) — estado temprano legítimo, NO error de datos. Gate de salud sin `budget_cobertura`. `close_week.py`: insights templados SIN LLM para `total_spent=0` ("Una semana en silencio.") y `semaforo=NULL` ("Aún sin histórico suficiente. Decide tú."). System prompt: comparar contra "lo habitual", nunca "presupuesto". | mig-63 · 29-jun-2026 |
| D-021 | **El drawer de /control es la superficie única de decisión de una transacción** — clasificación (con alta de categoría inline) y marcado pago-directo. Ambas decisiones viven donde ocurre el dato, no en pantallas separadas (Ajustes / cola de Pedidos). Pago-directo es ortogonal a clasificación: un cargo puede ser pago-directo y seguir necesitando categoría; no conflar las dos señales. Predicado canónico "sin clasificar" = `category_id IS NULL AND amount<0 AND superseded_by IS NULL` — idéntico a `fn_close_week`; lo que cuenta el contador es lo que filtra la pantalla. | mig-61 context · 28-jun-2026 |
| D-020 | **Insights IA = fraseo de hechos calculados. Gate de salud antes de frasear.** El LLM (claude-haiku) recibe solo hechos numéricos ya calculados por SQL y los redacta en castellano editorial. Reglas inviolables del system prompt: (1) cada frase anclada a un número del input; (2) describe SOLO la semana que terminó; (3) compara contra "lo habitual" (D-022, nunca "presupuesto"); (4) prohibido prescribir o recomendar; (5) prohibido inferir periodicidad ("toca"); (6) prohibido inventar señales no presentes en el input. Gate P-016: si `data_health ≠ 'ok'`, el job escribe `[{type:'health', reason:health_reason}]` SIN llamar al LLM — insight con confianza sobre dato roto = fallar en verde. El semaforo es fiable SOLO cuando `data_health='ok'`; el consumidor (UI, job) gatea por salud antes de leer semaforo. Implementado en `egmfin-jobs/close_week.py` + `fn_close_week()` (mig-61, reescrito mig-63). | mig-61/63 · 28/29-jun-2026 |

---

## Deuda técnica pendiente

| ID | Descripción | Prioridad |
|----|-------------|-----------|
| D-001 | CHECK constraint en `holding_prices`: exigir ticker OR isin NOT NULL (ver P-008) | Baja |
| D-002 | ~~Migraciones 10, 11, 13 no están commiteadas~~ — **OBSOLETA** (31-may-2026): archivos `...010_holdings`, `...011_account_balances_full`, `...013_currency_rates` presentes en `supabase/migrations/`. Estado ya superado. | — |
| D-003 | ~~`app/api/callback/route.ts` y `app/api/bank/` usan schema Copilot~~ — **OBSOLETA** (31-may-2026): `app/api/` no existe en el repo. Nada que limpiar. | — |
| D-004 | ~~`supabase/seed/` no existe~~ — **OBSOLETA** (31-may-2026): `supabase/seed/` existe y contiene `seed_accounts.sql` y `seed_holdings.sql`. | — |
| T-019 | **RESUELTA** (mig 29, 30-may-2026). Ver entrada T-019 arriba. | — |
| T-022a-pend | **Pendientes de T-022a:** (a) T-025 extracción de líneas Amazon; ~~(b) T-026a first_charge_date~~ **RESUELTA T-026a (03-jun-2026)**; (b2) T-026b matcher difuso de cuotas reales (aparcado); ~~(c) slice-1b map comercio→categoría IA~~ **RESUELTA T-023 (02-jun-2026)**; ~~(d) PV-3 indicador compromisos en Control~~ **RESUELTA T-027 (03-jun-2026)**; (e) Splits multi-categoría por pedido. | Media |
| T-023 | **RESUELTA** (02-jun-2026). `MERCHANT_CATEGORY_MAP` + `suggest_merchant_category()` + `backfill_ai_suggestions()` en `egmfin-jobs/parse_orders_gmail.py`. Backfill live: 12 líneas actualizadas (Apple→Streaming ×7, Google Payment→Streaming ×3, Iberia→Vuelos y transporte ×1, Leroy Merlin→Mantenimiento ×1). Idempotente verificado. | — |
| T-025 | **PENDIENTE.** Extracción de líneas de pedido desde emails Amazon. Amazon ES tiene 0 líneas (`purchase_order_lines`) porque el parser no extrae ítems del HTML de Amazon (formato distinto a PayPal). Impacto: categorización IA sin base para Amazon. | Media |
| T-026 | **PARCIALMENTE RESUELTA.** Auto-match cuotas financiadas. Subdividido en: (a) T-026a — dato first_charge_date correcto → **RESUELTA**; (b) T-026b — matcher difuso de cargos SEPA reales a cuotas → **APARCADO**, red de seguridad = enlace manual T-022a. Blocking: ID de email PayPal ≠ referencia SEPA del banco; no hay campo compartido fiable para matching automático. | Alta |
| T-026a | **RESUELTA** (03-jun-2026). `first_charge_date` del parser fijado a `order_date` (fecha del email/transacción) en lugar de `datetime.now()` (run date). Afectaba a `_parse_amazon_financing()` y `_parse_paypal_financing()`. Backfill via mig-41: 4 financiados corregidos (industrias plasticas 22-abr, KIWOKO 15-may, Leroy Merlin 30-may, TRADEINN 31-may). `v_purchase_commitments` proyecta correctamente: TRADEINN → may/jun/jul con cuota 38,66 €. | — |
| T-027 | **RESUELTA** (03-jun-2026). Slice 2a — Indicadores de estado en Pedidos (tres ejes: enlace ○/◐/●, pago N/M cuotas, clasificación D-005) + PV-3 en Control (sub-línea `● {merchant}` / `○ Cargo sin vincular` bajo la contrapartida). Sin DDL: usa `transactions.order_id` (mig 38). Archivos: `PedidosShell.tsx`, `PedidoDrawer.tsx`, `ControlMonthLedger.tsx`, `ControlTable.tsx`, `control/page.tsx`. | — |
| T-029 | **RESUELTA** (03-jun-2026). Control — carátula (PlannerShell como vista por defecto `?view=`), navegación de mes con popover 12 meses (MonthSwitcher), drill-down `?view=apuntes&nature=xxx` / `?view=apuntes&project_id=xxx`, "Todos los apuntes →", botones Pedidos + Presupuesto. Extracción `PlannerData` + `computePlannerData` a `_lib/plannerUtils.ts` para reutilización sin duplicar lógica. Sin DDL. [INTERP: "categoría" del drill-down = nature (fijo/variable/extraordinario) ya que PlannerShell muestra porNaturaleza; drill-down por categoría root = follow-up.] | — |
| T-028 | ~~**RESUELTA** (03-jun-2026). Nav de módulos MVP~~ → **CORREGIDA por T-030** (04-jun-2026): numeración improvisada, incluía Pedidos/Presupuesto en la nav. | — |
| T-030 | **RESUELTA** (04-jun-2026). Nav canónica Dossier V3: corrige T-028. MODULES = 6 exactos: I·Inicio→/inicio, II·Proyecto→null, III·Control→/control, IV·Horizonte→null, V·Análisis→null, VI·Ajustes→/configuracion. Disabled = `href: null` → `<span aria-disabled="true">` (no clicable, color ink-4), se aplica a sidebar Y tab bar (mismo array). Pedidos y Presupuesto fuera de la nav — acceso desde Control. Sin DDL. Archivo: `EgmNav.tsx`. | — |
| T-032 | **RESUELTA** en T-034 (04-jun-2026). Drawer deslizable + rechazar enlace: Handle Vaul visible en PedidoDrawer; CSS touch-action/pointer-events/transform en egm.css; acción `rejectMatch` + botón "Rechazar" en el footer junto a "Confirmar". | — |
| T-034 | **RESUELTA** (04-jun-2026). Tres fixes en un solo commit de código: (1) Bug "error al desenlazar" — mig-37 habilitó RLS en purchase_order_charges sin crear policy DELETE; mig-42 añadió GRANT DELETE pero sin policy el RLS deny-by-default bloqueaba → mig-44 añade `pol_charges_delete USING can_see_transaction(transaction_id)`. (2) T-032 (drawer deslizable + rechazar enlace): `rejectMatch` action (DELETE charge ai_proposed + match_status='sin_linkar'); botón Rechazar en footer del PedidoDrawer junto a Confirmar; Handle Vaul visible; CSS en egm.css: `touch-action: none` en handle, `pan-y` en drawer right, `pointer-events: auto` en overlay, `transform: none` en .egm (evita romper position:fixed de portales). (3) Rail detection: unificada a la misma lógica que T-031 (counterparty OR description OR raw_concept contiene 'paypal'/'amazon'); el cargo de Iberia pagado con PayPal detecta como raíl desde el campo description/raw_concept → PV-3 visible en Control y toggle "marcar directo" accesible en CategorizationDrawer sin necesitar un pedido. | — |
| T-033 | **RESUELTA** (04-jun-2026). Cargo directo de raíl: `transactions.is_direct_charge boolean NOT NULL DEFAULT false` (mig-43). PV-3 en Control pasa a tres estados solo para cargos de raíl (PayPal/Amazon, order_id no nulo, o is_direct_charge=true): ● vinculado (order_id), — directo (is_direct_charge), ○ sin vincular. Toggle en CategorizationDrawer: "Marcar como cargo directo" / "Quitar cargo directo", solo visible si order_id IS NULL y es raíl; actualización optimista + router.refresh. searchCandidates filtra is_direct_charge=false (cargos directos no se ofrecen para enlazar). Doctrina: los cargos de raíl pueden marcarse a mano como directos; el sistema nunca lo infiere. GRANT UPDATE en transactions ya existía (mig 22). Archivos: mig-43, toggleDirectCharge.ts, CategorizationDrawer.tsx, ControlTable.tsx, ControlMonthLedger.tsx, control/page.tsx, pedidos.ts. | — |
| T-036 | **RESUELTA** (04-jun-2026). Neutralización reversible de duplicados h_/er_: columna `transactions.superseded_by uuid NULL FK self` (mig-45); vistas `v_spent_by_category_month`, `v_spent_by_category_week`, `v_fixed_expenses_observed` filtran `superseded_by IS NULL` (mig-46); queries directas del frontend (inicio, planner, control, searchCandidates) añaden `.is('superseded_by', null)`; 5 filas h_ marcadas via service role con sus gemelas er_ canónicas. Lección documentada en P-019. Sin DELETE, sin pérdida de datos. | — |
| T-040 | **PENDIENTE.** `fn_supersede_pending_booked` exige `date` idéntica entre h_ y er_. Si el banco mueve la fecha valor entre PENDING y BOOKED (p.ej. cargo viernes → liquidado lunes), el par no casará y el gasto seguirá duplicado. Solución futura: ampliar la condición de fecha a `ABS(e.date - h.date) <= 3` (o similar) con filtro adicional para evitar falsos positivos en misma cuenta/importe cercanos. Registrada en P-023 como limitación conocida. Baja urgencia mientras no se observe en producción. | Baja |
| T-039 | **PENDIENTE.** Endurecer `anon` en los 6 helpers de RLS: `user_role()`, `can_see_account(uuid)`, `can_see_transaction(uuid)`, `can_see_order(uuid)`, `can_read_account(<sig>)`, `can_see_visibility(<sig>)`. Patrón: `REVOKE EXECUTE FROM PUBLIC; GRANT EXECUTE TO authenticated, service_role;` — nunca quitar `authenticated` o las policies RLS dejan de evaluarse. Hacer con migración propia, no en caliente. Baja urgencia: estos helpers no escriben datos (INVOKER), pero reducen superficie de ataque. Ver P-022. | Baja |
| T-037 | **DORMIDA** (mig-61, 28-jun-2026 / D-022, mig-63, 29-jun-2026). Prorrateo mensual→semanal implementado en mig-61 (`generate_series` por tramo), pero D-022 sustituye el semáforo vs-budget por vs-habitual en `fn_close_week` (mig-63). La lógica de prorrateo NO se borra — la usará el módulo de Presupuesto (módulo VIII) cuando se active el próximo FY. Hasta entonces `total_budget` queda NULL en `weekly_closures`. | — |
| T-035 | **RESUELTA** (04-jun-2026). Control roto tras T-033: mig-43 (`is_direct_charge`) commiteada en git pero nunca aplicada a la DB real → `column transactions.is_direct_charge does not exist` (42703) → `control/page.tsx` hacía `throw new Error()` al llegar al `view=apuntes` path. Fix: `is_direct_charge` extraído del SELECT principal; sub-query resiliente separada `directChargeQuery` (solo `id, is_direct_charge`); si la sub-query falla (columna inexistente), `directChargeMap` queda vacío y todos los cargos degradan a `false`. Merge via `directChargeMap.get(row.id) ?? false` en `enrichedRows`. La vista carátula (planner) nunca se vio afectada. Features T-034 (PV-3 tres estados, toggle "marcar directo", rail detection) intactas. Sin DDL. Archivos: `control/page.tsx`. | — |
| T-031 | **RESUELTA** (04-jun-2026). Enlace manual de Pedidos — tres mejoras: (A) `searchCandidates` filtra salidas (`amount<0`), mismo rail que el pedido (ilike counterparty/description `%paypal%`/`%amazon%`), ventana ±90d ordenada por proximidad de fecha en JS, límite 100. (B) `linkManual` soporta multi-cuota: calcula `installment_number` automáticamente (cuenta confirmed/manual existentes +1), recomputa `match_status` basándose en conteo real vs `installment_count`. (C) `unlinkCharge` nueva action: DELETE charge → clear `transactions.order_id` → D-005 copy-back `transactions.category_id` a `purchase_order_lines` → recomputa `match_status` (0→sin_linkar, parcial, completo). Pre-requisito: mig-42 GRANT DELETE en `purchase_order_charges` (INV-6). Drawer: ChargeLine con botón Desenlazar, render todos los cargos confirmados, panel enlace visible para cuotas pendientes de financiados, label dinámica "Enlazar siguiente cuota N/M". Archivos: `pedidos.ts`, `PedidoDrawer.tsx`, mig-42, SCHEMA.md §4+§5. | — |
