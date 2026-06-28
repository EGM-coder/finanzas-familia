# EGMFin · Estado 13-jun-2026 · B2 muro + auto-dedupe PSD2 + ruta /estado

> Handoff de sesión. Cierre tardío: el trabajo es del 13-jun; snapshot generado el 27-jun.
> **Cabecera:** commit `a1ec454` · deploy **READY** (egmfin.vercel.app) · migraciones →60.
> Próxima sesión arranca en **Household HQ** (módulo + capa digest) + decisión **VIAJES**.

---

## 1. Decisiones de doctrina

- **COMPARTIR = SOLO LECTURA.** La compartición vía `shares` no concede escritura en ningún caso; `can_see_account` permanece intacto como guard de escritura. Asimétrica y revocable: cada titular manda sobre lo suyo.
- **Continuidad (sucesión) = permiso pre-armado e inactivo**, separado de la compartición ordinaria. La fila existe en `shares` desde ya, sin efecto hasta activación.
- **`/estado` = tablero vivo de salud del dato, no módulo canónico.** No toca la IA de los 6 módulos. Superficie de revisión humana de duplicados genuinamente ambiguos. Acceso discreto desde Inicio (ubicación final en nav = TODO).

---

## 2. Backend entregado (migraciones aplicadas, verificadas por MCP)

| Mig | Bloque | Qué hace |
|-----|--------|----------|
| 55–58 | **B2 muro multiusuario** | Tabla `shares` (asimétrica, revocable; fila de continuidad pre-armada inactiva). Helpers `can_see_visibility()` / `can_read_account()`. Selladas las fugas de `manual_holdings` y `manual_holdings_history`; `stock_options` gana columna `owner_role`. Principio escrito en el código: compartir = solo lectura. |
| 59 | **Auto-dedupe PSD2 PENDING→BOOKED** | `fn_supersede_pending_booked()` (SECURITY **DEFINER**) + hook end-of-run en `sync_psd2.py`. Neutralizados 20 duplicados de junio + Wooloomooloo vía `superseded_by`. |
| 60 | **`/estado`** | `fn_pending_review_dups()` (SECURITY **INVOKER** — respeta el muro B2 automáticamente). Agrupa transacciones PSD2 activas con `count(*) > 1` sobre `(account, date, amount, description)`; los pares `h_`/`er_` ya resueltos quedan fuera por `superseded_by IS NULL`. `GRANT EXECUTE TO authenticated`. |

Verificación: vía MCP/service_role se ve todo (correcto); la app filtra por usuario. La asimetría DEFINER/INVOKER es deliberada — el dedupe es mantenimiento sistémico, la lectura de `/estado` debe respetar el muro.

---

## 3. Frontend / app

- **CategoryCombobox** — selección en cualquier nivel de la taxonomía (**P-020**).
- **`/estado/tablero.json`** — narrativa committeada: 5 secciones del spec + `meta.revision` / `meta.fecha` para el encabezado. Coste runtime **cero** (import estático, bundle en build).
- **`/estado/page.tsx`** (server component): cabecera editorial + strip 3-col (bloque · foco · número grande de dups en verde/ámbar/rojo según estado) + grid 2×2 (Hecho con marcadores rom / Pendiente / Horizonte / Decisiones) + tarjeta full-width **Deuda+Salud** (deuda del JSON a la izquierda, lista live de dups del RPC a la derecha: fecha · descripción · importe · ×N). Error del RPC **visible** con `dupsError.message`, no silenciado (**T-038**).
- **Acceso** — "estado →" en el panel de Control de Inicio (columna derecha), marcado como TODO (la ubicación es provisional). `EgmNav` intacto: 6 módulos canónicos sin cambios. Build: 19 páginas, `/estado` dinámica (`ƒ`).
- **Fix despliegue** — `prefer-const` en `cuentas/page.tsx:128` (deploy estaba en ERROR) + commits sin pushear. Resuelto → deploy READY.

---

## 4. Pendiente / decisiones abiertas

- **P-021** a registrar: *commiteado ≠ pusheado ≠ desplegado*. El ritual de cierre incorpora `git status -sb` + push + verificación de deploy READY. Verificar P máx antes de fijar el número.
- **D-xxx — HQ como módulo + capa digest** (decisión 24-jun): IA pasa de 6 a 7 módulos (confirmar nav). Guardrail doctrinal: la inferencia de cadencia vive en el digest, nunca en la UI del módulo (DOC-1/DOC-2). Verificar D máx antes de fijar el número.
- **D-0xx (opcional):** centralizar muro + `shares` + "compartir = solo lectura" como decisión doctrinal. Verificar D máx en uso.
- **T-debt:** `GRANT UPDATE` en `accounts` para `authenticated` (reasignación de titular / herencia; hoy daría 42501 silencioso).
- Ubicación final del acceso a `/estado` en la nav (sin tocar los 6 módulos canónicos).
- **4 duplicados ambiguos** (decisión humana): Iberia ×3 · Fundación Maristas ×2 · Kutxabank TRANSF −870 ×2 + ANUL +870 ×2.
- **VIAJES:** ¿`project` (reutiliza `project_id` + presupuesto, recomendado) o entidad propia? Nota: `projects` hoy es `authenticated` sin filtro → Ana vería todos los viajes.
- ¿`projects` / `maristas_items` visibles a Ana al entrar = compartido por diseño? (Hoy sí, por §0 del SCHEMA: `auth.role()='authenticated'` sin muro.)
- `bank_account_links` no share-aware (follow-up conservador, sin fuga).
- `shares.scope='aggregate'` (agregado de hogar) reservado en enum, sin construir.
- Verificación de RLS B2 con un 2º usuario real (MCP service_role no lo prueba).
- Formalizar `docs/EGMFin_TABLERO.md` (hoy la narrativa vive en `/estado/tablero.json`) + meterlo en el ritual de cierre.

---

## 5. Aprendizajes y notas técnicas

- **Compartir = solo lectura.** La escritura sigue exclusivamente por `can_see_account`; añadir a alguien vía `shares` nunca abre escritura.
- **DEFINER vs INVOKER es una decisión, no un default.** Dedupe (mantenimiento) corre como DEFINER; lectura de tablero (cara al usuario) como INVOKER para que el muro fluya.
- **Origen de P-021:** el deploy estuvo en ERROR con trabajo sin pushear. "Working tree clean" de Code refleja solo lo que tocó. `git status -sb` por Eric en cada cierre, push, y verificar deploy READY.
- **T-038 — errores de RPC visibles, no silenciados.** El fallo de `fn_pending_review_dups()` se muestra con `dupsError.message` en `/estado`; un tablero de salud que oculta sus propios fallos miente. Patrón, no excepción.
- **DOC-1/DOC-2 y HQ:** inferir periodicidad/predicción está prohibido en la UI de EGMFin. Por eso la cadencia se infiere en la capa digest (LLM frasea), y el módulo HQ solo muestra dato explícito (agenda/GCal, proyectos recurrentes, vencimientos con fecha).

---

## 6. Hoja de ruta — Household HQ (tema nuevo)

- **Decisión 24-jun: HQ = módulo en EGMFin _y_ capa digest Claude-native.** No solo una capa por encima: tendrá superficie propia en la app (IA 6 → 7 módulos, confirmar nav). El digest push (barato en tokens, no dashboard que se visita) sigue siendo el motor de anticipación.
- **Reparto doctrinal (DOC-1/DOC-2):** inferencia de cadencia ("toca", intervalo típico + días desde la última) → **solo en el digest**. El **módulo** muestra dato explícito/introducido: agenda/Google Calendar (capa tiempo), proyectos recurrentes (extraescolares de Leo), vencimientos con fecha conocida. Sin inferencia en pantalla.
- **Detección = SQL en EGMFin; el LLM solo frasea el digest.** EGMFin sigue siendo el sistema de registro financiero.
- GlobalEduca descartado (walled garden). Google Calendar = vía limpia (API oficial, OAuth incremental sobre "Ticket Gastos"). Caso cero: extraescolares de Leo (proyecto recurrente + presupuesto + recurrencia GCal + recibo auto-casado PSD2).
- **Arranque: (a) vista SQL de cadencias** — datos reales ya (Lupa ~16d, Eroski/Alcampo ~mensual, Waco ~48d, ~8 recibos recurrentes, BIP Drive retrasado) → alimenta el digest. La superficie del módulo (qué muestra, dónde en nav, relación con los 6 canónicos) se diseña aparte.
