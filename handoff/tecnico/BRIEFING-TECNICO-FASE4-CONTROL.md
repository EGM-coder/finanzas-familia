# EGMFin · Briefing técnico · Fase 4 · Control

> **Para:** Claude Code · **De:** Claude Chat · **20 may 2026**
> **Cubre:** Fase 4 · Capa de **estructura** del módulo Control (III/VII).
> **Fuera de scope (explícito):** OCR de tickets, splits por línea, opacos, Configuración como módulo, Asesor IA. Todo eso es **capa de granularidad**, llega después.
>
> **Doctrina:** *Primero vemos · luego anticipamos · después decidimos.* Fases 1-3 = vemos. **Fase 4 = decidimos.** Estructura primero, granularidad después.
>
> **Fuentes de verdad (orden de lectura):**
> 1. Dossier V3 · doctrina
> 2. Briefing Design 19-may + Design Specs (referencia visual y conceptual)
> 3. `docs/SCHEMA.md` · fuente única de datos (migs 01-28)
> 4. `EGMFin_Estado_19may2026_v10_fase4_paso0.md` · D8/D9/D10 (este briefing los implementa)
> 5. Este documento · operativo
>
> **Reglas:** sin invento de columnas. RLS intocable. ZBB literal (diff=0). Stack visual D10 = Visx + SVG nativo + Framer Motion (no Recharts). Aislamiento `.egm`.

---

## 0 · Estado de partida (qué existe v10 y qué hace Fase 4)

### 0.1 · Lo que ya funciona en producción

| Capa | Estado |
|---|---|
| `/control` lectura | Funcional · tabla 6 columnas · paginación 50/pag · toggle Pendientes/Todas |
| Drawer de categorización (Fase 3) | Funcional · 5 controles · "Guardar como regla" inline · descarte silencioso · Cmd+Enter |
| `classification_rules` aplicación en INSERT | Funcional vía `sync_psd2.py` (refactor v10 Fase 1) |
| `recategorize_existing.py` (T-007) | Montado · pendiente ejecución manual |
| Cron PSD2 + cron precios | Operativos diarios |
| Taxonomía | Completa post-T012/T013/T014/T015 |
| Schema | Migs 01-28 documentadas en SCHEMA.md (T-006 cerrado en commit `c60bd35`) |
| Tabla `budgets` (mig 03) | Existe sin datos · espera Fase 4 |
| Datos reales | 168 txns PSD2 · ~78 categorizadas · ~90 pendientes (mayoría PayPal) |

### 0.2 · Lo que construye Fase 4 (capa estructura)

Cinco entregables principales:

1. **Vistas SQL agregadas** sobre `transactions` + `budgets` + `incomes` (mig 29).
2. **ZBB Planner mensual** con diff = 0 obligatorio · UPSERT en `budgets`.
3. **Cards de categorías** con gasto + barra + semáforo verde/ámbar/rojo.
4. **Cierre semanal** automático (domingo) · UPSERT en `weekly_closures` (mig 30).
5. **Cierre mensual** automático (día 1) · UPSERT en `monthly_closures` (mig 31).

### 0.3 · Lo que se reutiliza de Fase 3 (no reconstruir)

| Existente | Reutilización en Fase 4 |
|---|---|
| `CategorizationDrawer.tsx` (Vaul) | Patrón base para "drawer de asignar budget" |
| `CategoryCombobox.tsx` (cmdk jerárquico solo-hojas) | Sin cambios · reutilizar |
| `ProjectCombobox.tsx` (creatable inline) | Sin cambios · reutilizar |
| `updateTransaction` server action | Sin cambios · queda como base de Control |
| `createRule` / `deleteRule` server actions | Sin cambios |
| Patrón Sonner JSX raw (P-016) | Aplicar a toasts de Fase 4 |
| Patrón Portal Vaul + tokens (P-015) | Aplicar a drawer de budget |
| Imports al top (P-017) | Regla operativa |
| Acordeón sin maxHeight (P-018) | Sin maxHeight para sub-forms en Fase 4 |
| Aislamiento `.egm` (D-010) | Todo el código nuevo vive bajo `.egm` |
| `template.tsx` con fade 0.2s (T-001 hotfix) | Sin tocar |

### 0.4 · Lo que NO entra en Fase 4 (verificar antes de proponerlo)

- OCR de tickets (foto → IA por líneas).
- Split manual o por línea (`transaction_splits` queda vacía en V1).
- Reconstrucción de opacos (Amazon, PayPal, Bizum, supermercados con desglose).
- Inflación familiar.
- Configuración como módulo dedicado (parámetros globales, gestión de cuentas PSD2, etc.).
- Asesor IA cross-semanal/cross-mensual.
- Agrupación por counterparty repetida.
- Filtros avanzados en tabla de movimientos (cuenta, proyecto, nature, titular, rango, search).

Si Code propone alguno: rechazar y escalar a Eric.

---

## 1 · Mapa técnico de Fase 4

### 1.1 · Pantallas y subpantallas (web first, app paralela cuando aplique)

```
III · Control
├─ A. Semana (hero)            Web + App
│   ├─ Card semáforo
│   ├─ Cards de categorías
│   └─ Tickets recientes
├─ B. Mes
│   ├─ B1. Vista mensual
│   ├─ B2. Detalle categoría
│   └─ B3. Planner ZBB
├─ C. Movimientos              tabla actual de v10 · preservada · drill desde categorías
├─ D. Pendientes               cola actual · preservada
├─ E. Cierre semanal           overlay efímero domingo · persistido en weekly_closures
├─ F. Cierre mensual           overlay efímero día 1 · persistido en monthly_closures
└─ G. Histórico                web
    ├─ G1. Semanas             sub-tab
    └─ G2. Meses               sub-tab
```

**Cambio respecto a v10:** el layout `/control` se reorganiza. Cards de categorías y semáforo arriba. Tabla de movimientos preservada abajo o en sub-ruta (decisión técnica de Code en paso 1 de implementación).

### 1.2 · Navegación

| Plataforma | Patrón |
|---|---|
| **Web** | Entrada `III · Control`. Sub-tabs: `Semana · Mes · Movimientos · Pendientes · Histórico`. `Histórico` tiene a su vez dos sub-tabs internos: `Semanas · Meses`. |
| **App (futuro)** | TabBar `Control` → vista A · drill nativo iOS a B/C/D. Domingo E overlay. Día 1 F overlay. Fase 4 enfoca web; app puede iterarse después sin tocar schema. |

### 1.3 · Estados por pantalla (V1 mínimo)

| Pantalla | Estados |
|---|---|
| **A. Semana hero** | loading · mes-sin-planificar (CTA al planner) · sin-gasto-semana · normal-verde · normal-ámbar · excedido · error |
| **B3. Planner ZBB** | sin-ingresos (CTA editorial) · plantilla-copiada-de-mes-anterior · diff=0 (Confirmar habilitado) · diff>0 (sobra) · diff<0 (falta · Confirmar deshabilitado) |
| **B1/B2. Vistas mes** | normal · sin-budget · sin-actividad |
| **E. Cierre semanal** | normal-domingo · semana-sin-actividad · idempotente (re-abrir = mostrar el ya cerrado) |
| **F. Cierre mensual** | normal-día-1 · mes-sin-actividad · idempotente |
| **G1. Semanas** | lista cronológica DESC · vacía si aún no hay cierres |
| **G2. Meses** | lista cronológica DESC · vacía si aún no hay cierres |

### 1.4 · Dependencias entre vistas

```
A (hero) ←── lee vistas agregadas + budgets + weekly_closures (semana actual) + monthly_closures (mes actual)
   │
   ├─→ banner "mes sin planificar" ────→ B3 (Planner)
   ├─→ click categoría ────────────────→ B2 (detalle categoría)
   ├─→ click "Tickets recientes" ──────→ C (movimientos)
   ├─→ chip "N pendientes" ────────────→ D (cola actual)
   ├─→ domingo overlay ────────────────→ E (cierre semanal)
   └─→ día 1 overlay ──────────────────→ F (cierre mensual)

B3 (planner) ──→ UPSERT budgets → habilita A normal
E (cierre semanal) ──→ UPSERT weekly_closures → fila nueva en G1
F (cierre mensual) ──→ UPSERT monthly_closures → fila nueva en G2
G1/G2 ─── ambos viven en sub-tabs paralelos de Histórico
```

---

## 2 · Componentes para Code

> Lista cerrada. Props conceptuales. Code define firma exacta. `[refactor]` = ya existe en `egm-control.jsx` (maqueta) y se extrae a reutilizable Next.js.

### 2.1 · Sistema base (Bloque 0 · precondición)

Si no existen ya como reutilizables, crearlos. Si están dispersos en componentes actuales, extraerlos.

| Componente | Notas |
|---|---|
| `Hairline` | 1px · invariante claro/oscuro |
| `Label` | uppercase auto · 11px |
| `Num` | clase `.num` · tabular nums · mono |
| `Roman` | display serif italic |
| `Card` | sin radius · sin shadow · `soft` opcional |
| `Btn` | `fill` · `ghost` · primario |
| `Toggle` | cuadrado sin radius |
| `RadioChips` | grupo tipográfico (ya hay precedente en `TitularRadio` de Fase 3) |

### 2.2 · Componentes Fase 4

| Componente | Props conceptuales | Bloquea |
|---|---|---|
| `WeekHero` `[refactor]` | `weekSpend`, `weekBudgetProporcional`, `semaforo`, `todaySpend`, `pendingCount`, `loading` | A (hero) |
| `CategoryCard` `[refactor]` | `name`, `color`, `spent`, `planned`, `txnCount`, `semaforo`, `state: assigned/unassigned` | A (lista), B1, B2 |
| `RecentTicketsList` | `transactions[]` con `date`, `place`, `amount`, `category_name`, `category_color` | A |
| `ZbbPlanner` | `year`, `month`, `categories[]`, `incomeExpected`, `scope` | B3 |
| `BudgetDrawer` | drawer Vaul para editar `amount_planned` de una categoría · reusa patrón Fase 3 | B3 |
| `MonthOverview` | vista mensual con cards `CategoryCard` agregadas | B1 |
| `CategoryDetail` | drill: lista de txns de la categoría en el mes navegado | B2 |
| `CloseSplashWeekly` | overlay full-screen · stagger lento · "Empezar semana N+1" | E |
| `CloseSplashMonthly` | overlay full-screen · stagger lento · "Empezar mes M+1" | F |
| `WeeklyHistoryRow` | row de `weekly_closures` | G1 |
| `MonthlyHistoryRow` | row de `monthly_closures` | G2 |
| `HistoryTabs` | sub-tabs Semanas/Meses dentro de G | G |
| `SemaphoreBar` | barra de progreso + dot verde/ámbar/rojo · animada con Framer (bar-fill 1.2s) | `CategoryCard`, `WeekHero` |

### 2.3 · Grafo de dependencias

```
egm.css (tokens)
  └─ base (Hairline, Label, Num, Roman, Card, Btn, Toggle, RadioChips)
       ├─ SemaphoreBar
       ├─ WeekHero ─→ RecentTicketsList ─→ CategoryCard (lista corta)
       ├─ CategoryCard ─→ SemaphoreBar
       ├─ ZbbPlanner ─→ BudgetDrawer (Vaul · patrón Fase 3)
       ├─ MonthOverview ─→ CategoryCard (lista larga)
       ├─ CategoryDetail ─→ ControlTable (refactor para filtrar por category_id)
       ├─ CloseSplashWeekly · CloseSplashMonthly
       └─ HistoryTabs ─→ WeeklyHistoryRow + MonthlyHistoryRow
```

### 2.4 · Componentes bloqueantes

- `SemaphoreBar`, `CategoryCard`, `WeekHero` bloquean A.
- `ZbbPlanner` + `BudgetDrawer` bloquean B3.
- `CloseSplashWeekly` bloquea E (depende también de migración `weekly_closures`).
- `CloseSplashMonthly` bloquea F (depende también de migración `monthly_closures`).

---

## 3 · Flujos operativos

### 3.1 · Planner ZBB (B3)

```
TRIGGER:
  · usuario navega a /control/mes/planner
  · O banner "Define el presupuesto del mes" en A
↓
SECUENCIA:
  1. cargar categorías activas (visibles según scope actual)
  2. cargar budgets existentes para year/month/scope (si los hay)
  3. cargar ingreso esperado:
     · scope personal   → MEDIAN últimos 3 meses de incomes WHERE user_id=auth.uid()
                          si <3 meses → 0 (Eric edita manualmente)
     · scope compartido → valor manual de localStorage (default 0 hasta que Configuración exista)
  4. cargar sugerencia por categoría:
     · MEDIAN gasto últimos 3 meses por category_id
     · si <3 meses datos → 0 (decisión humana)
  5. usuario edita amount_planned por categoría
  6. footer live:
     · Σ amount_planned ↔ ingreso esperado
     · diff = ingreso - Σ
     · diff = 0  → Confirmar enabled · copy "Cuadra"
     · diff > 0  → Confirmar enabled · copy "Sobran X €"
     · diff < 0  → Confirmar DISABLED · copy "Faltan X €"
  7. tap Confirmar → UPSERT budgets por categoría
↓
SIDE EFFECTS:
  - UPSERT budgets ON CONFLICT (year, month, category_id, visibility) DO UPDATE
  - persistir "última plantilla aceptada" en localStorage (botón "Copiar de mes anterior")
↓
INVARIANTES:
  - ZBB literal: budget=0 al iniciar el mes · sin autoseed
  - diff=0 obligatorio para "cuadra"
  - visibility del budget = scope activo
  - no se puede saltar el planner: A muestra banner hasta que el mes esté planificado
```

### 3.2 · Cierre semanal automatizado (E)

```
TRIGGER:
  · dayOfWeek === 0 (domingo · zona horaria Europe/Madrid)
  · AND primera apertura de Control del día por el usuario
  · AND no existe ya weekly_closures WHERE week_start = lunes_actual AND scope = scope_actual
↓
SECUENCIA:
  1. calcular semana ISO actual (lunes a domingo)
  2. consultar vista agregada:
     · total_spent = Σ transactions.amount donde amount < 0 entre lunes y domingo
     · total_budget = Σ budgets.amount_planned mes actual × (7 / días_del_mes)
     · semaforo = func(total_spent, total_budget)
       - verde: ≤ 90%
       - ámbar: 90% < x ≤ 100%
       - rojo: > 100%
     · top_deviations = top 3 categorías por |spent − planned_proporcional|
     · insights = [] en V1 (Asesor IA llega después)
  3. mostrar CloseSplashWeekly full-screen · stagger 1.2s
  4. tap "Empezar semana N+1" → UPSERT weekly_closures · cerrar splash
↓
SIDE EFFECTS:
  - UPSERT weekly_closures ON CONFLICT (week_start, scope) DO UPDATE
  - lunes la vista ya no aparece (idempotente)
  - fila nueva visible en G1 (Histórico · Semanas)
↓
INVARIANTES:
  - una sola fila por (week_start, scope)
  - re-abrir mismo cierre = UPDATE no INSERT
  - vista efímera UI, dato persistente
  - scope del cierre = scope activo del usuario al cerrar
```

### 3.3 · Cierre mensual automatizado (F)

```
TRIGGER:
  · día del mes === 1 (primera apertura del día por el usuario)
  · AND no existe ya monthly_closures WHERE year = año_pasado_efectivo AND month = mes_pasado AND scope = scope_actual
  · "mes pasado" = el mes que acaba de terminar (no el actual)
↓
SECUENCIA:
  1. calcular mes cerrado (year, month del mes que terminó)
  2. consultar vista agregada:
     · total_spent = Σ transactions.amount mes cerrado, scope, amount < 0
     · total_budget = Σ budgets.amount_planned (year, month, scope)
     · semaforo = igual lógica que semanal
     · top_deviations = top 5 categorías por |spent − planned| del mes
     · category_breakdown = jsonb con [{ category_id, spent, planned }] de TODAS las categorías
     · comparison_with_prev_month = jsonb con { prev_spent, prev_budget, delta_spent } si hay datos
     · insights = []
  3. mostrar CloseSplashMonthly full-screen · stagger 1.5s (más rico que el semanal)
  4. tap "Empezar mes M+1" → UPSERT monthly_closures · cerrar splash
↓
SIDE EFFECTS:
  - UPSERT monthly_closures ON CONFLICT (year, month, scope) DO UPDATE
  - día 2 la vista ya no aparece
  - fila nueva visible en G2 (Histórico · Meses)
  - banner aparece en A si nuevo mes aún sin planificar → CTA a B3
↓
INVARIANTES:
  - una sola fila por (year, month, scope)
  - re-abrir = UPDATE
  - scope del cierre = scope activo al cerrar
```

### 3.4 · Categorización fina (preservar Fase 3)

```
SIN CAMBIOS respecto a Fase 3.
El drawer CategorizationDrawer queda intacto.
Fase 4 sólo añade botón "Categorizar" en CategoryCard.unassigned para drill a D.
```

### 3.5 · Asignar budget desde CategoryCard

```
TRIGGER: tap en CategoryCard estado unassigned o tap en "Editar budget" de categoría existente
↓
SECUENCIA:
  1. abrir BudgetDrawer (Vaul · slide-from-right 480px)
  2. mostrar:
     · nombre + dot color + sugerencia mediana 3m
     · input amount_planned (mono)
     · selector visibility (3 opciones tri-state)
     · copy editorial: "Cada euro nombrado. Decide tú."
  3. tap Guardar
↓
SIDE EFFECTS:
  - UPSERT budgets · fade-out card · update local
  - toast Sonner "Presupuesto definido · Deshacer"
↓
INVARIANTES:
  - cierre dirty (Esc/X/click fuera) = descarte silencioso + toast Deshacer (patrón Fase 3 B4)
  - Cmd+Enter dispara Guardar
```

---

## 4 · Migraciones necesarias (tres nuevas)

> Code define DDL exacta. Sigue convención `supabase/migrations/YYYYMMDDHHMM_*.sql`.

### 4.1 · Mig 29 · Vistas SQL agregadas

Vistas `security_invoker = true` sobre `transactions`, `budgets`, `incomes`. Nombres tentativos (Code afina):

| Vista | Propósito |
|---|---|
| `v_spent_by_category_month` | gasto agregado por (year, month, category_id, visibility) |
| `v_spent_by_category_week` | gasto agregado por (week_start, category_id, visibility) |
| `v_category_budget_status` | join de `budgets` con `v_spent_by_category_month` para semáforo |
| `v_median_spend_3m_by_category` | mediana últimos 3 meses por category_id (para sugerencias) |
| `v_median_income_3m` | mediana últimos 3 meses de incomes por user_id (para ingreso esperado) |

**Reglas:**
- Todas con `security_invoker = true` (delega RLS al user que ejecuta).
- Sin GRANTs especiales · authenticated hereda permisos de tablas base.
- Si la lógica de mediana en SQL puro es engorrosa, alternativa: vista con `percentile_cont(0.5)` o función helper.
- Actualizar `docs/SCHEMA.md` en el mismo commit.

### 4.2 · Mig 30 · `weekly_closures`

| Columna | Tipo |
|---|---|
| `id` | `uuid PK` default `gen_random_uuid()` |
| `week_start` | `date NOT NULL` (lunes ISO) |
| `week_end` | `date NOT NULL` (domingo ISO) |
| `scope` | `text NOT NULL CHECK IN ('privada_eric','privada_ana','compartida')` |
| `total_spent` | `numeric(12,2) NOT NULL` |
| `total_budget` | `numeric(12,2) NOT NULL` |
| `semaforo` | `text NOT NULL CHECK IN ('verde','ambar','rojo')` |
| `top_deviations` | `jsonb NOT NULL default '[]'::jsonb` |
| `insights` | `jsonb NOT NULL default '[]'::jsonb` |
| `closed_at` | `timestamptz NOT NULL default now()` |
| `created_at` | `timestamptz NOT NULL default now()` |
| `updated_at` | `timestamptz NOT NULL default now()` (trigger `set_updated_at`) |

**Constraints:**
- `UNIQUE (week_start, scope)`
- `CHECK (week_end = week_start + 6)`

**Índices:**
- `(week_start DESC)` para G1
- `(scope, week_start DESC)`

**RLS** (security_invoker estándar del proyecto):
- `SELECT/INSERT/UPDATE` permitido si `scope IN ('privada_'||user_role(), 'compartida')`
- Sin `DELETE` policy

**GRANTs:**
- `authenticated`: SELECT, INSERT, UPDATE
- `service_role`: full

**Test manual post-push** (igual patrón que migs anteriores).

Actualizar `docs/SCHEMA.md` en el mismo commit.

### 4.3 · Mig 31 · `monthly_closures`

| Columna | Tipo |
|---|---|
| `id` | `uuid PK` |
| `year` | `int NOT NULL` |
| `month` | `int NOT NULL CHECK (month BETWEEN 1 AND 12)` |
| `scope` | `text NOT NULL CHECK IN ('privada_eric','privada_ana','compartida')` |
| `total_spent` | `numeric(12,2) NOT NULL` |
| `total_budget` | `numeric(12,2) NOT NULL` |
| `semaforo` | `text NOT NULL CHECK IN ('verde','ambar','rojo')` |
| `top_deviations` | `jsonb NOT NULL default '[]'::jsonb` |
| `category_breakdown` | `jsonb NOT NULL default '[]'::jsonb` |
| `comparison_with_prev_month` | `jsonb default null` |
| `insights` | `jsonb NOT NULL default '[]'::jsonb` |
| `closed_at` | `timestamptz NOT NULL default now()` |
| `created_at` | `timestamptz NOT NULL default now()` |
| `updated_at` | `timestamptz NOT NULL default now()` |

**Constraints:**
- `UNIQUE (year, month, scope)`

**Índices:**
- `(year DESC, month DESC)`
- `(scope, year DESC, month DESC)`

**RLS:** igual patrón que `weekly_closures`.

**GRANTs:** igual.

**Test manual post-push.** Actualizar `docs/SCHEMA.md`.

### 4.4 · NO migrar en Fase 4 (lista explícita)

| Concepto | Razón |
|---|---|
| Foto de ticket bucket | OCR fuera de Fase 4 |
| `source='ocr_ticket'` | OCR fuera de Fase 4 |
| Tabla `attachments` polimórfica (T-007 ya identificado) | Fase posterior |
| Vista incomes household agregada | localStorage manual V1 |
| `transactions.is_active` | sin archivado expuesto |
| Vinculación opacos↔ticket explícita | granularidad posterior |
| `quarterly_closures` o `yearly_closures` | sin necesidad V1 |

---

## 5 · Lecturas y escrituras

### 5.1 · Lecturas por flujo

| Flujo | Vistas / Tablas | Filtros |
|---|---|---|
| **A. Semana hero** | `v_spent_by_category_week` · `weekly_closures` · `transactions` (chip pendientes) | semana ISO actual · scope · `can_see_account()` |
| **A. Cards categorías** | `v_category_budget_status` | mes actual · scope |
| **A. Tickets recientes** | `transactions` JOIN `categories` | LIMIT 5-10 · DESC · `can_see_account()` |
| **B1. Mes overview** | `v_category_budget_status` | mes navegado · scope |
| **B2. Detalle categoría** | `transactions` JOIN `categories` | category_id · mes navegado |
| **B3. Planner** | `categories` (activas) · `budgets` · `v_median_spend_3m_by_category` · `v_median_income_3m` o localStorage manual | scope · year+month destino |
| **E. Cierre semanal** | `v_spent_by_category_week` + `budgets` (semana + proporcional) | semana ISO + scope |
| **F. Cierre mensual** | `v_spent_by_category_month` + `budgets` + `monthly_closures` mes anterior (para comparativa) | year + month + scope |
| **G1. Histórico semanas** | `weekly_closures` | ORDER BY week_start DESC |
| **G2. Histórico meses** | `monthly_closures` | ORDER BY year DESC, month DESC |

### 5.2 · Escrituras

| Flujo | Operación | Tabla |
|---|---|---|
| **B3. Confirmar planner** | UPSERT | `budgets` ON CONFLICT (year, month, category_id, visibility) |
| **B3. Crear categoría inline** | INSERT | `categories` (is_default=false, visibility=scope, parent_id) |
| **CategoryCard. Editar budget** | UPSERT | `budgets` (mismo ON CONFLICT que B3) |
| **E. Cerrar semana** | UPSERT | `weekly_closures` ON CONFLICT (week_start, scope) |
| **F. Cerrar mes** | UPSERT | `monthly_closures` ON CONFLICT (year, month, scope) |

### 5.3 · Validaciones obligatorias de Code

| Validación | Dónde | Comportamiento |
|---|---|---|
| ZBB diff = 0 para Confirmar | B3 frontend | botón disabled hasta cuadrar |
| Idempotencia `weekly_closures` | E backend | UPSERT con `ON CONFLICT (week_start, scope)` |
| Idempotencia `monthly_closures` | F backend | UPSERT con `ON CONFLICT (year, month, scope)` |
| RLS no bypaseable | sistema | nunca `service_role` desde frontend |
| Scope filter = UI no security | sistema | Ana intentando ver privada_eric → RLS rechaza |
| Sugerencia 0 si <3 meses datos | B3 frontend | mediana solo si N≥3 |
| Trigger cierre semanal solo si no existe ya | E backend | check antes de mostrar splash |
| Trigger cierre mensual solo si no existe ya | F backend | check antes de mostrar splash |
| `can_see_account(account_id)` en todo SELECT/UPDATE de `transactions` | siempre | RLS lo aplica · Code no bypasea |
| Reduce-motion honrado | global | duraciones a 0.15s · sin stagger · sin breathe |

### 5.4 · Joins / vistas

Las vistas de mig 29 son **el contrato de lectura** para Fase 4. Code no escribe queries crudas con joins ad-hoc · usa siempre las vistas. Si una vista falta, se añade en mig 29 antes de seguir.

---

## 6 · Orden de construcción

### 6.1 · Bloque 0 · Base + sistema visual

- Tokens `egm.css` (ya existen).
- Componentes base: `Hairline`, `Label`, `Num`, `Roman`, `Card`, `Btn`, `Toggle`, `RadioChips` extraídos a `/components/egm/`.
- ThemeSelector global · `prefers-color-scheme` listener · localStorage `egmfin.theme`.
- Reduce-motion listener global.
- Verificar Visx + Framer Motion instalados (Framer ya commit `935ac30`).

### 6.2 · Bloque 1 · Migración 29 (vistas SQL agregadas)

- DDL de las 5 vistas con `security_invoker = true`.
- Test manual: ejecutar SELECT de cada una desde sesión Eric y desde sesión Ana, verificar que respeta RLS.
- Actualizar `docs/SCHEMA.md` en el mismo commit.
- **Bloqueante de Bloques 3, 4, 5, 6, 7.**

### 6.3 · Bloque 2 · Migraciones 30 y 31 (cierres)

- DDL `weekly_closures` + RLS + GRANTs + test manual.
- DDL `monthly_closures` + RLS + GRANTs + test manual.
- Actualizar `docs/SCHEMA.md` en el mismo commit (uno o dos commits, criterio Code).
- **Bloqueante de Bloques 6 y 7. No bloquea 3, 4, 5.**

### 6.4 · Bloque 3 · `SemaphoreBar` + `CategoryCard`

- `SemaphoreBar` con Framer (bar-fill 1.2s · una vez por carga).
- `CategoryCard` con estados: assigned (gasto + barra + semáforo) · unassigned ("Sin asignar · decide tú") · sin-actividad.
- Storybook visual o demo aislada antes de integrar.

### 6.5 · Bloque 4 · `WeekHero` + `RecentTicketsList` + reorganización layout `/control`

- `WeekHero` con cifra grande mono + label + breathe loop solo si semáforo verde.
- `RecentTicketsList` (últimos 5-10 movimientos).
- Reorganizar `/control/page.tsx`: cards arriba, tabla preservada abajo o en sub-ruta `/control/movimientos`.
- Banner "Mes sin planificar" si no hay budgets para year+month+scope · CTA a B3.

### 6.6 · Bloque 5 · `MonthOverview` + `CategoryDetail`

- `MonthOverview` reutilizando `CategoryCard` en lista larga.
- `CategoryDetail` con drill: filtrar `ControlTable` por category_id + mes.
- Navegación entre meses (anterior · actual · siguiente).

### 6.7 · Bloque 6 · `ZbbPlanner` + `BudgetDrawer`

- `ZbbPlanner` web con footer diff live.
- `BudgetDrawer` (Vaul · reusa patrón Fase 3 · P-015 tokens en portal).
- Server action `setBudget(categoryId, year, month, visibility, amount)`.
- Validación diff = 0 + UPSERT `budgets`.
- localStorage "última plantilla" + botón "Copiar de mes anterior".

### 6.8 · Bloque 7 · `CloseSplashWeekly` + `CloseSplashMonthly` + Histórico

- Trigger detection:
  - Semanal: domingo + primera apertura del día + no existe ya el cierre.
  - Mensual: día 1 + primera apertura del día + no existe ya el cierre del mes anterior.
- `CloseSplashWeekly` con stagger 1.2s.
- `CloseSplashMonthly` con stagger 1.5s + comparativa con mes anterior.
- UPSERT weekly_closures / monthly_closures.
- Tab `Histórico` web con `HistoryTabs` (Semanas / Meses).
- `WeeklyHistoryRow` y `MonthlyHistoryRow` listas DESC.

### 6.9 · Diagrama de dependencias

```
Bloque 0 (base) ──┬──→ Bloque 1 (mig 29 vistas) ──┬──→ Bloque 3 (SemaphoreBar + CategoryCard)
                  │                                 │           │
                  │                                 │           ├──→ Bloque 4 (WeekHero + layout)
                  │                                 │           │
                  │                                 │           ├──→ Bloque 5 (Mes overview + detalle)
                  │                                 │           │
                  │                                 │           └──→ Bloque 6 (Planner ZBB + drawer)
                  │                                 │
                  └──→ Bloque 2 (migs 30 + 31) ─────┴──→ Bloque 7 (Cierres + Histórico)
```

**Paralelizable:**
- Bloques 0, 1, 2 en paralelo desde el inicio.
- Tras 0+1: Bloque 3.
- Tras 3: Bloques 4, 5, 6 en paralelo.
- Tras 1+2+3: Bloque 7.

**Bloqueante crítico:**
- Bloque 3 sin Bloque 1 (vistas) no compila.
- Bloque 7 sin Bloques 1 + 2 no compila.
- Si Bloque 2 se atrasa, Bloques 3-6 avanzan; sólo 7 espera.

---

## 7 · Checklist editorial y de interacción

### 7.1 · Motion (Emil) — invariantes Fase 4

- [ ] `fade-soft` 0.80s entradas de pantalla.
- [ ] `fade-quick` 0.32s toasts.
- [ ] `breathe` 5.5s loop SOLO en hero semáforo verde.
- [ ] `bar-fill` 1.2s para `SemaphoreBar` · una vez por carga.
- [ ] `stagger-list` 0.05s × i · máx 6 escalones para listas de `CategoryCard`.
- [ ] `splash-in` 1.2s para CloseSplashWeekly.
- [ ] `splash-in` 1.5s para CloseSplashMonthly.
- [ ] Transición numérica del hero al actualizarse (tween 0.6s).
- [ ] Cambio de tema = crossfade 0.5s global.
- [ ] Reduce-motion: todas a 0.15s · sin stagger · sin breathe.

### 7.2 · Copy (Impeccable) — Fase 4

- [ ] *"Cada euro nombrado."* presente al menos una vez en B3.
- [ ] *"Sin asignar · decide tú."* en `CategoryCard.unassigned`.
- [ ] *"Cuadra."* en planner cuando diff=0.
- [ ] *"Sobran X €."* cuando diff>0.
- [ ] *"Faltan X €."* cuando diff<0.
- [ ] *"Una semana en silencio."* cierre semanal sin actividad.
- [ ] *"Un mes en silencio."* cierre mensual sin actividad.
- [ ] *"Empezar semana N."* CTA del CloseSplashWeekly.
- [ ] *"Empezar mes M."* CTA del CloseSplashMonthly.
- [ ] Toast *"Presupuesto definido · Deshacer."* tras UPSERT budgets.
- [ ] Toast *"Semana cerrada."* tras UPSERT weekly_closures.
- [ ] Toast *"Mes cerrado."* tras UPSERT monthly_closures.
- [ ] Cifras: miles con punto, decimales con coma, € separado, signo menos tipográfico.
- [ ] Sin emojis. Sin uppercase grande. Sin signos de exclamación.
- [ ] **Nunca aparecen al usuario:** PSD2, OCR, schema, migración, RLS.

### 7.3 · Estados vacíos · error · sin datos

- [ ] Loading hero con cifra placeholder `——`.
- [ ] Mes sin planificar → banner CTA *Definir presupuesto* a B3.
- [ ] Sin tickets esta semana → *"Aún ningún gasto esta semana. Nombrado y a tiempo."*
- [ ] Sugerencia mediana con <3 meses datos → `0` con copy editorial *"Aún sin histórico suficiente. Decide tú."*
- [ ] Categoría sin budget → estado unassigned · sin barra, dot gris.
- [ ] Cierre semanal con 0 movimientos → splash *"Una semana en silencio."* + CTA.
- [ ] Cierre mensual con 0 movimientos → splash *"Un mes en silencio."* + CTA.
- [ ] Error de red → banner *"Sin conexión. Mostrando última lectura."*
- [ ] Fallo UPSERT → toast `--signal-neg` *"No he podido guardar el cambio."*
- [ ] Diff ≠ 0 en planner → Confirmar disabled con copy.

### 7.4 · Modo oscuro

- [ ] Todas las variables `--*` resuelven en ambos modos.
- [ ] `prefers-color-scheme` listener en vivo.
- [ ] Colores categoría visibles en ambos modos (validar contraste 3:1).
- [ ] Crossfade 0.5s al cambiar tema.
- [ ] Signos verde/rojo/ámbar versiones suaves del oscuro.
- [ ] Sin glow, sin brillo en oscuro.

### 7.5 · Accesibilidad

- [ ] Contraste mínimo 4.5:1 texto.
- [ ] Contraste mínimo 3:1 hairlines.
- [ ] Focus visible outline `--ink` 2px.
- [ ] ARIA en Toggle, RadioChips, sub-tabs.
- [ ] Color nunca única señal · siempre texto o forma acompañando.

---

## 8 · Riesgos y notas

### 8.1 · Puntos sensibles

| Riesgo | Mitigación |
|---|---|
| **Vistas SQL pesadas en /control** | `security_invoker=true` puede sumar coste por usuario. Si latencia > 500ms, considerar materialized views en Fase 5. V1 acepta latencia razonable. |
| **Trigger cierre mensual cae el día 1 pero usuario abre día 3** | El check sólo busca si existe cierre del mes pasado; si no existe, lo dispara. No importa cuándo abra · siempre cierra el mes pasado. |
| **Trigger cierre semanal cae el domingo pero usuario abre lunes** | Mismo patrón: si no existe weekly_closures de la semana ISO recién cerrada, lo dispara. |
| **Mediana últimos 3 meses con pocos datos** | Fallback a 0 + copy editorial. Sugerencia es referencia, no asignación. |
| **`budgets` actuales con visibility errónea** | Tabla está vacía (verificado en estado 19-may), no hay datos legacy a migrar. |
| **Comparativa mes anterior si no existe `monthly_closures` previa** | `comparison_with_prev_month` queda `null`. UI muestra sin comparativa. |
| **localStorage para ingreso conjunto sin Configuración** | Default 0. Eric puede sobrescribir manualmente desde el propio planner (input editable). Cuando Configuración llegue, se migra trivialmente. |
| **Scope tri-state con datos privados de Ana** | RLS estricta vigente. Sesión Eric NO ve privada_ana. Cierres compartidos los ven ambos. |
| **`weekly_closures` vs `monthly_closures` duplicación de lógica** | Aceptado. Dos tablas hermanas con campos distintos. Helper functions compartidas en código (cálculo semáforo, formateo top_deviations) para no duplicar lógica de negocio. |

### 8.2 · Dependencias externas Fase 4

| Dependencia | Riesgo | Plan B |
|---|---|---|
| **Visx + Framer Motion** | Visx requiere D3 transitive. Bundle puede subir. | Lazy load de componentes con `dynamic()` Next.js. |
| **Sonner 2.x** | P-016 vigente. JSX raw obligatorio. | Aplicar en todos los toasts nuevos de Fase 4. |
| **Vaul** | P-015 vigente. Tokens en Portal. | Aplicar a `BudgetDrawer` desde el inicio. |
| **Asesor IA** | No existe aún. `insights` queda `[]`. | Aceptado. Cuando exista, se enriquecen los cierres post-hoc. |
| **Datos `incomes` reales** | Probablemente <3 meses. | Fallback 0. Eric introduce manualmente. |

### 8.3 · Decisiones que Code NO debe tomar (consultar a Eric antes)

- Inventar cualquier columna, tabla o enum.
- Modificar RLS policies existentes.
- Cambiar la doctrina ZBB (diff = 0 obligatorio).
- Aplicar reglas retroactivamente desde UI (T-007 sigue siendo job manual hasta nueva decisión).
- Persistir foto del ticket.
- Añadir `source='ocr_ticket'` al enum.
- Exponer DELETE para `transactions`, `accounts`, `budgets`, `incomes`, `holdings`, `weekly_closures`, `monthly_closures`.
- Mover Configuración a TabBar (es módulo separado · fase posterior).
- Introducir gradientes, sombras, radius, emojis.
- Modificar tipografía o paleta del sistema.
- Cambiar `security_invoker` por `security_definer` en las vistas.
- Crear `quarterly_closures` o `yearly_closures` sin nueva decisión.

### 8.4 · Decisiones técnicas que SÍ son de Code

- Estructura concreta de carpetas dentro de `/app/(egm)/control` y `/components/egm`.
- Patrón Server Component vs Client Component por pantalla.
- Estrategia de caché de vistas SQL (`fetch` con `revalidate` Next.js).
- Implementación exacta de la detección "primera apertura del día" (cookie · localStorage · check server).
- Decisión MEDIAN vs PERCENTILE_CONT en SQL si la primera es problemática.
- Estructura de `top_deviations` jsonb (qué campos exactos meter).
- Estrategia de fallback si una vista SQL falla.

### 8.5 · Convenciones operativas

- DDL solo via `supabase/migrations/` + `npx supabase db push`. NUNCA SQL Editor directo.
- `docs/SCHEMA.md` actualizado en el MISMO commit que cada migración.
- Imports al top del archivo (P-017).
- Sonner `action` como JSX raw (P-016).
- Vaul + tokens EGMFin en Portal (P-015).
- Acordeón sin maxHeight (P-018).
- Aislamiento `.egm` (D-010).
- Etiquetar plataforma en cada acción: `SUPABASE SQL EDITOR` / `TERMINAL` / `GITHUB` / `VERCEL` / `CLAUDE CODE`.
- Step-by-step con confirmación entre pasos.

---

---

## 9 · Addendum doctrinal y estructural

> Siete aclaraciones que extienden el briefing sin modificar lo anterior. Su función: blindar el scope, marcar dependencias conceptuales con fases futuras y prevenir desviaciones silenciosas durante la implementación.

### 9.1 · Motor de cash flow (conceptual, no implementación)

Fase 4 no construye el motor de cash flow del sistema. Construye su **capa de estructura**, que es la base sobre la que ese motor se montará en fases posteriores.

Las tres primeras capas conceptuales del motor son:

1. **Planner ZBB** (decisión consciente del mes · diff = 0).
2. **Cierres semanales** (foto cuadrada de cada semana · histórico granular).
3. **Cierres mensuales** (foto cuadrada de cada mes · comparativa entre periodos · base para narrativa).

Estas tres capas son **insumos del motor**, no el motor en sí. El módulo Horizonte (Fase 5 o 6, según orden definitivo) consumirá estos datos para proyectar cash flow a medio plazo, anticipar tensiones de liquidez y modelar escenarios.

**Lo que esto significa para Code en Fase 4:**

- No implementar nada del motor de cash flow ahora.
- No anticiparse con vistas SQL "para Horizonte" que no necesite la propia Fase 4.
- Sí dejar las tres capas (planner, weekly_closures, monthly_closures) **limpias y bien tipadas**, porque Horizonte las leerá. Los `jsonb` (top_deviations, category_breakdown, comparison_with_prev_month) son contratos que sobrevivirán a Fase 4.

### 9.2 · Configuración como futura fuente de verdad

En Fase 4, varios parámetros viven en **localStorage como puente temporal**:

- Ingreso conjunto esperado (planner scope compartido).
- Granularidad OCR (no relevante a Fase 4 pero la mención queda registrada).
- Scope por defecto.
- Visibility tri-state por defecto.
- Preferencia de tema.

**Esto es deliberadamente provisional.** En **Fase 5 · Configuración**, estos valores migrarán a su fuente de verdad real (tabla `user_preferences` o equivalente, decisión a tomar en la propia Fase 5).

**Nota explícita para Code:**

- No cementar localStorage como solución permanente.
- No diseñar abstracciones complejas alrededor de localStorage (hooks rebuscados, sistemas de sincronización, etc.).
- Mantener los accesos a localStorage encapsulados en hooks simples (`useExpectedIncome`, `useScopePreference`, etc.) para que Fase 5 los reemplace por queries a Configuración con cambio mínimo.
- Si emerge tentación de "ya que estoy, lo persisto en BD ahora": **escalar a Eric antes**. Esa decisión pertenece a Fase 5.

### 9.3 · Doctrina del "ticket como activo de datos"

Aunque OCR, splits por línea y reconstrucción de opacos quedan **fuera de Fase 4**, la estructura que construye Fase 4 debe ser **compatible con esa granularidad cuando llegue**.

Cuatro capacidades futuras que Fase 4 debe **preparar sin implementar**:

1. **Granularidad por línea** · `transaction_splits` ya existe en schema. La estructura de Fase 4 (vistas SQL, agregados por categoría) **debe leer splits-first**: si una transacción tiene splits, agregar por splits; si no, agregar por la txn padre. La mig 29 ya debe contemplarlo en `v_spent_by_category_month` y `v_spent_by_category_week`.
2. **Reconstrucción de opacos** (Amazon, PayPal, Bizum, supermercados sin desglose) · llegará como flujo en Fase 5 o 6. Fase 4 no la implementa, pero **no debe asumir que cada txn opaca es una unidad atómica indivisible**. La estructura de `CategoryCard`, vistas y cierres ya debe tolerar que una txn opaca futura tenga splits añadidos a posteriori sin recalcular el histórico.
3. **Inflación real** (granularidad de producto, no solo de categoría) · requiere `description` o `note` por split. Fase 4 no la trabaja, pero los cierres mensuales deben dejar **espacio en sus jsonb** (`top_deviations`, `category_breakdown`) para enriquecimiento futuro sin requerir migración.
4. **Reglas inteligentes** (matching por contexto, no solo por counterparty) · la Fase 3 ya soporta esto via `classification_rules`. Fase 4 no extiende reglas, pero **no debe construir lógica de categorización paralela** dentro del planner o las vistas. La autoridad sigue siendo `classification_rules` + categorización manual via drawer Fase 3.

**Resumen para Code:** Fase 4 prepara el escenario sobre el que la granularidad caerá en Fase 5. Lo que construyes debe sumar, no bloquear.

### 9.4 · Numeración oficial del Dossier V3

El módulo se llama oficialmente **"III · Control"** (Dossier V3 · D-006).

La numeración **"VII · Control"** aparece en el Design Spec por herencia histórica del Kit Figma simplificado (7 módulos en lugar de los 12 del Dossier).

**Para Code:**

- Header semántico, breadcrumbs, copy editorial, títulos de página → **"III · Control"**.
- URL operativa → `/control` (sin numeración).
- Si en algún documento de referencia aparece "VII", entender que es **el mismo módulo** y que la numeración correcta es **III**.
- No modificar el Design Spec ni el briefing del 19-may para "corregir" la numeración: son documentos congelados con su nomenclatura original.

### 9.5 · Invariante: no tocar la capa contable PSD2

La **capa contable PSD2** quedó cerrada en Fase 1 (v10) y refinada en Fase 3. Está estable, en producción, con cron diario funcionando.

Componentes **congelados** para Fase 4:

- `egmfin-jobs/sync_psd2.py` (refactor v10 · classification_rules aplicación en INSERT).
- `egmfin-jobs/recategorize_existing.py` (T-007 · job manual).
- `egmfin-jobs/update_prices.py` (cron precios).
- GitHub Actions workflows (`sync_psd2.yml`, `update_prices.yml`).
- Estructura interna de `transactions.raw_concept`, `description`, `counterparty`, `external_id`.
- Lógica de detección de duplicados cross-account (P-014 · sigue abierto por decisión).
- Aplicación de `classification_rules` en INSERT (sin retroactividad automática).

**Para Code:**

- No optimizar nada en esta capa "ya que estás".
- No refactorizar `sync_psd2.py` para "que sea más limpio".
- No tocar el cron schedule.
- No cambiar el formato de `raw_concept` (T-011 pendiente, pero **NO** es Fase 4).
- Si Fase 4 necesita un dato que la capa contable no expone, **escalar a Eric** antes de modificar nada de ingestion.

### 9.6 · Invariante: no tocar Fase 3

La **Fase 3** (drawer de categorización + reglas inline) quedó cerrada el 17-may con producción verde y validación humana del smoke test.

Componentes **congelados** para Fase 4:

- `CategorizationDrawer.tsx` (incluyendo Vaul 480px, header, footer sticky, lente Kowalski).
- `CategoryCombobox.tsx` (cmdk jerárquico solo-hojas, bullets ● color del padre).
- `ProjectCombobox.tsx` (creatable inline).
- `NatureSelect.tsx` (ampliado a 6 valores en mig 24).
- `TitularRadio.tsx`.
- `ReembolsableCheckbox.tsx`.
- `RuleSubForm.tsx` (sub-form acordeonado "Guardar como regla").
- Server actions: `updateTransaction`, `createRule`, `deleteRule`, `createProject`.
- Patrón de toast con Deshacer (Sonner JSX raw · P-016).
- Patrón de descarte silencioso al cerrar dirty (B4 doctrinal).
- Decisiones doctrinales B1-B6 + C1-C3 documentadas el 17-may.

**Para Code:**

- Fase 4 **extiende**, no reescribe.
- Si una pieza de Fase 4 necesita comportamiento similar al drawer de Fase 3 (e.g. `BudgetDrawer`), **reutilizar el patrón**, no crear uno paralelo desde cero.
- Si una server action de Fase 3 necesita un campo nuevo para Fase 4, **escalar a Eric** antes de modificar la firma existente.
- No "limpiar" o "optimizar" componentes de Fase 3 aunque el código sea perfectible. Está validado en producción.

### 9.7 · Invariante: no introducir granularidad accidental

Si durante la implementación de Fase 4 Code detecta una **oportunidad de granularidad**, debe **rechazarla y escalar**, no integrarla silenciosamente.

Señales típicas de granularidad accidental:

- Añadir lógica de splits a vistas SQL ("ya que estoy en la mig 29 añado un join a `transaction_splits` con cálculo por línea") → **rechazar**. Splits leídos sí, lógica de splits no.
- Añadir hooks o pipelines de OCR ("dejo el esqueleto preparado para cuando llegue") → **rechazar**. Esqueleto vacío genera deuda.
- Parsing de merchant para detectar opacos ("identifico Amazon/PayPal y marco la txn") → **rechazar**. Reconstrucción de opacos pertenece a Fase 5/6.
- Crear vistas SQL "para futuro" no usadas por Fase 4 → **rechazar**. Migración solo lo que se usa.
- Añadir columnas "por si acaso" a `weekly_closures` o `monthly_closures` → **rechazar**. Migrar exactamente lo definido en § 4.2 y § 4.3.
- Refactorizar `transactions` table o RLS "ya que estoy tocando cerca" → **rechazar**.

**Para Code:**

- Scope blindado. Cualquier expansión es decisión de Eric, no de Code.
- En caso de duda: **el "no" es la respuesta segura**. Escalar a Claude Chat.

---

**Fin del briefing técnico Fase 4 (con addendum doctrinal).**

Code: implementa por orden estricto de § 6. Cuando dudes sobre schema → SCHEMA.md. Cuando dudes sobre flujo → § 3. Cuando dudes sobre invariantes → § 5.3 + § 8.3 + § 9. Cuando dudes sobre estética → spec de diseño + § 7. Si nada aclara la duda → escalar a Eric vía Claude Chat.

— Claude Chat · 20 may 2026.
