# EGMFin · Estado · 20 may 2026 · v10 · Fase 4 paso 1

> **Sesión:** 20 may 2026 · Claude Chat (web)
> **Cubre:** cierre de planificación operativa de Fase 4 + handoff a Claude Code.
> **Estado anterior:** `EGMFin_Estado_19may2026_v10_fase4_paso0.md`

---

## A · Resumen ejecutivo

Esta sesión cerró la **planificación operativa de Fase 4** (capa estructura del módulo Control). Se generó briefing técnico operativo (853 líneas, incluye addendum doctrinal § 9), se reconcilió la divergencia detectada entre briefing de Design del 19-may y estado de cierre Fase 4 paso 0, y se dejó todo listo para arrancar sesión con Claude Code.

No se tocó código. No se ejecutaron migraciones. Sesión 100% estratégica/documental.

---

## B · Decisiones cerradas

### B1 · Scope Fase 4 = capa estructura

**Fase 4 construye estructura. Granularidad llega después.**

- **Dentro:** ZBB Planner + cards de categorías + semáforo + cierre semanal + cierre mensual + vistas SQL agregadas.
- **Fuera (Fase 5/6/v12):** OCR de tickets · splits por línea · opacos · Configuración como módulo · Asesor IA · Inflación familiar.

Doctrina: *Primero vemos · luego anticipamos · después decidimos.* Fases 1-3 = vemos. **Fase 4 = decidimos.**

### B2 · Tres migraciones nuevas

- **Mig 29** · Vistas SQL agregadas (5 vistas con `security_invoker=true`, leer **splits-first** aunque splits esté vacía hoy).
- **Mig 30** · `weekly_closures` (cierre semanal persistido · UNIQUE week_start+scope).
- **Mig 31** · `monthly_closures` (cierre mensual persistido · UNIQUE year+month+scope · comparativa con mes anterior en jsonb).

Decisión arquitectónica: **dos tablas separadas** (no tabla unificada con `kind`). Razón: claridad editorial, campos mensuales no caben limpiamente en estructura semanal.

### B3 · Cierres automáticos idempotentes

- **Semanal:** disparo automático domingo + primera apertura del día por usuario + check de no-existencia previa. UPSERT con `ON CONFLICT (week_start, scope)`.
- **Mensual:** disparo automático día 1 + primera apertura del día + check de no-existencia previa del mes pasado. UPSERT con `ON CONFLICT (year, month, scope)`.

Vista efímera UI, dato persistente en BD. Re-abrir = UPDATE.

### B4 · Histórico web con sub-tabs

Tab `Histórico` en web con dos sub-tabs internos:
- `G1 · Semanas` → lista `weekly_closures` DESC
- `G2 · Meses` → lista `monthly_closures` DESC

No mezclar cronológicamente.

### B5 · Sugerencia budget = mediana 3m con fallback 0

Sugerencia por categoría en el Planner ZBB = **mediana últimos 3 meses**.

Si N < 3 meses datos disponibles → fallback a 0. Copy editorial: *"Aún sin histórico suficiente. Decide tú."*

ZBB literal: budget arranca en 0 al inicio del mes. Sin autoseed.

### B6 · Reconciliación divergencia Design ↔ Operación del 19-may

El **briefing de Design del 19-may** y el **estado Fase 4 paso 0 del mismo día** quedaron descoordinados:

- Briefing Design = plano completo V1-V2 del módulo Control (incluía OCR, split, cierres, Configuración como esenciales V1).
- Estado Fase 4 paso 0 = scope acotado (OCR → v12+, Configuración fuera de Fase 4).

**Resolución:** Estado Fase 4 paso 0 manda. Briefing Design se archiva como referencia futura (cuando lleguen OCR + opacos + Configuración en Fase 5/6).

Aprendizaje operativo: **dos sesiones paralelas mismo día sin sincronizar generan divergencia silenciosa**. Próximas iteraciones con Design partir desde estado operativo cerrado.

### B7 · Numeración oficial: III · Control

Decisión D-006 ratificada en addendum § 9.4:

- Header semántico, breadcrumbs, copy editorial → **"III · Control"** (Dossier V3).
- URL operativa → `/control` sin numeración.
- "VII · Control" solo aparece en Design Spec por herencia histórica del Kit Figma simplificado (7 módulos). Es el mismo módulo.

---

## C · Entregables de la sesión

### C1 · Briefing técnico Fase 4

**Archivo:** `handoff/tecnico/BRIEFING-TECNICO-FASE4-CONTROL.md` (853 líneas).

**Contenido:**
- § 0 · Estado de partida (qué existe v10 · qué construye Fase 4 · qué reutiliza de Fase 3 · qué NO entra).
- § 1 · Mapa técnico (pantallas, navegación, estados, dependencias).
- § 2 · Componentes para Code (sistema base + Fase 4 + grafo de dependencias + bloqueantes).
- § 3 · Flujos operativos (Planner ZBB · cierre semanal · cierre mensual · categorización Fase 3 preservada · asignar budget).
- § 4 · Migraciones (29 vistas + 30 weekly_closures + 31 monthly_closures + lista explícita de NO migrar).
- § 5 · Lecturas y escrituras (por flujo + validaciones obligatorias).
- § 6 · Orden de construcción (8 bloques + diagrama de dependencias + paralelizables).
- § 7 · Checklist editorial (motion Emil + copy Impeccable + estados vacíos + modo oscuro + accesibilidad).
- § 8 · Riesgos y notas (puntos sensibles + dependencias externas + decisiones que Code NO/SÍ toma + convenciones).
- **§ 9 · Addendum doctrinal** (motor cash flow conceptual · Configuración como futura fuente de verdad · doctrina del ticket como activo de datos · numeración III · capa contable PSD2 congelada · Fase 3 congelada · no granularidad accidental).

### C2 · Archivo de referencia

**Archivo:** `handoff/tecnico/BRIEFING-DESIGN-CONTROL-V1V2-REFERENCIA.md` (mover y renombrar el `BRIEFING-CLAUDE-CHAT.md` del 19-may de Design).

**Función:** referencia futura para Fase 5/6 cuando lleguen OCR + opacos + Configuración. Contiene componentes pensados, copy de Impeccable, motion de Emil. NO es operativo para Fase 4.

### C3 · Briefing técnico anterior obsoleto

**Archivo:** `BRIEFING-TECNICO-CONTROL-CODE.md` (primera versión, 781 líneas).

**Acción:** descartar o archivar según criterio Eric. Quedó obsoleto al detectarse la divergencia Design ↔ Operación. Reemplazado por C1.

---

## D · Aprendizajes de la sesión (doctrinales)

### D1 · Divergencia Design ↔ Operación

Dos sesiones del 19-may produjeron documentos descoordinados (Design = plano completo · Operación = scope acotado). No se cruzaron al cierre. Generó retrabajo en esta sesión hasta detectarlo.

**Regla operativa futura:** sesiones con Claude Design siempre arrancan leyendo el último estado operativo. Si Design propone scope distinto al estado, se explicita el desacuerdo antes de generar el documento.

### D2 · Capas conceptuales vs entregables operativos

Fase 4 no construye el motor de cash flow. Construye sus **tres primeras capas** (planner, weekly_closures, monthly_closures). Horizonte (Fase 5/6) consumirá estos datos.

Implicación técnica: los `jsonb` de cierres (top_deviations, category_breakdown, comparison_with_prev_month) son **contratos que sobreviven a Fase 4**. Code debe tratarlos con cuidado.

### D3 · Splits-first como decisión arquitectónica oculta

Las vistas SQL de mig 29 deben leer **splits-first** (si hay splits, agregar por splits; si no, por txn padre), aunque `transaction_splits` esté vacía en Fase 4.

Si Code construyera las vistas leyendo solo `transactions.amount`, cuando llegue Fase 5 habría que reescribir las vistas + migrar agregados históricos. Es deuda evitable hoy con coste cero.

### D4 · localStorage como puente temporal explícito

Ingreso conjunto esperado, scope por defecto, preferencias de visibility, tema → todos en localStorage en Fase 4. Es **deliberadamente provisional**. Configuración (Fase 5) sustituirá estos valores con BD.

Code debe encapsular accesos en hooks simples (`useExpectedIncome`, `useScopePreference`, etc.) para que la migración sea trivial. **Prohibido cementar localStorage** con abstracciones complejas.

### D5 · Invariantes negativos blindados

Esta sesión consolidó que la documentación operativa necesita **invariantes negativos explícitos** ("no tocar X, no reescribir Y, no inventar Z"), no solo positivos. Sin ellos, Code puede derivar hacia granularidad o refactor de capas congeladas con buena fe.

§ 9.5 (capa PSD2 congelada) + § 9.6 (Fase 3 congelada) + § 9.7 (no granularidad accidental) son ahora invariantes inviolables del briefing.

---

## E · Pendientes operativos antes de arrancar Code

1. **Mover archivos al repo:**
   - Crear directorio `handoff/tecnico/` si no existe.
   - Copiar `BRIEFING-TECNICO-FASE4-CONTROL.md` a `handoff/tecnico/`.
   - Copiar `BRIEFING-DESIGN-CONTROL-V1V2-REFERENCIA.md` (renombrado desde el briefing original de Design del 19-may) a `handoff/tecnico/`.
   - Commitear con mensaje: `docs(handoff): briefing técnico Fase 4 + archivo referencia Design V1V2`.

2. **Commitear este estado:**
   - Guardar este archivo como `EGMFin_Estado_20may2026_v10_fase4_paso1.md` en raíz del repo.
   - Commitear con: `docs(state): cierre planificación Fase 4 paso 1 · briefing operativo + handoff Code`.

3. **Verificar SCHEMA.md actualizado:**
   - Estado actual: migs 01-28 documentadas (T-006 cerrado en commit `c60bd35`).
   - Verificar que no hay deuda de documentación antes de añadir mig 29, 30, 31.

4. **Abrir sesión nueva con Claude Code** con el prompt de arranque (§ F).

---

## F · Prompt de arranque para sesión Claude Code

```
EGMFin v10 → v11 · Fase 4 · Control · capa de estructura.

Lee en orden estricto antes de tocar nada:

1. Memoria del proyecto.
2. EGMFin_Dossier_V3.pdf.
3. Diseño (referencia visual):
   - EGMFin_Documentacion_Completa.md
   - EGMFin · Kit.html
   - egm-control.jsx + egm.css
4. docs/SCHEMA.md (migs 01-28).
5. Estado más reciente: EGMFin_Estado_20may2026_v10_fase4_paso1.md
6. Documento operativo: handoff/tecnico/BRIEFING-TECNICO-FASE4-CONTROL.md

Confirma lectura de los 6 niveles antes de proponer pasos.

Empezamos por Bloques 0, 1 y 2 del briefing técnico § 6, en paralelo si tiene sentido:

- Bloque 0: extracción componentes base (Hairline, Label, Num, Roman, Card, Btn, Toggle, RadioChips) a /components/egm/ + ThemeSelector global + reduce-motion listener.
- Bloque 1: mig 29 · vistas SQL agregadas (5 vistas con security_invoker=true, splits-first según § 9.3).
- Bloque 2: migs 30 y 31 · weekly_closures + monthly_closures + RLS + GRANTs + tests manuales de RLS.

Reglas operativas vigentes:
- DDL solo via supabase/migrations/ + npx supabase db push (NUNCA SQL Editor directo).
- docs/SCHEMA.md actualizado en el mismo commit que cada migración.
- Etiquetar plataforma en cada paso: SUPABASE SQL EDITOR / TERMINAL / GITHUB / VERCEL / CLAUDE CODE.
- Step-by-step con confirmación entre pasos.
- Respuestas concisas (sin explicaciones extensas).
- Invariantes del § 9 del briefing son inviolables. En duda, escalar a Claude Chat.

¿Por dónde empezamos primero: Bloque 1 (migración vistas SQL) que es la dependencia más crítica, o Bloque 0 (componentes base) que es precondición de todo lo visual?
```

---

## G · Próxima sesión Claude Chat (cuándo y para qué)

Volver a Claude Chat cuando:

- Code complete Bloques 0-2 y necesite revisión arquitectónica antes de Bloques 3-7.
- Code detecte conflicto entre briefing y schema/realidad → escalar inmediato.
- Code detecte oportunidad de granularidad o refactor de capas congeladas (§ 9.5, 9.6, 9.7) → escalar inmediato.
- Llegue momento de planificar Fase 5 (Configuración) o Fase 6 (Granularidad).

**Mientras Code ejecuta Fase 4, Claude Chat permanece disponible para arbitraje y consulta, no para implementación.**

---

## H · Memoria / contexto persistente

- Sesión sin tocar Supabase ni código.
- Sin migraciones aplicadas.
- Repo `github.com/EGM-coder/finanzas-familia` sin commits nuevos en esta sesión (los commits son trabajo pendiente § E).
- Estado v10 producción intacto.
- Cron PSD2 y cron precios funcionando.

---

**Fin del estado 20-may-2026.**

Próximo estado esperado: `EGMFin_Estado_20may2026_v10_fase4_paso1_postimplementacion.md` o similar, generado al cierre de la próxima sesión con Claude Code (cuando complete Bloques 0-2 o llegue a punto de arbitraje).

— Claude Chat · 20 may 2026.
