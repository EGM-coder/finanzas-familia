# EGMFin · Estado 21 may 2026 · v10 · Fase 4 Bloque 0 ejecutado

> Sesión: Fase 4 · Bloque 0 — extracción de los 8 componentes base a `components/egm/`.
> Stack: Next.js 15 App Router · React 19 · TS · Tailwind v4 · Framer Motion · Visx (pendiente de primer uso).
> Próxima parada: confirmar migs 29–32 + elegir entre Bloque 1 (weekly_closures) y Bloque 2 (Configuración estructural).

## 0 · Ancla doctrinal mínima
EGMFin = decisión consciente, no tracking. *Primero vemos · luego anticipamos · después decidimos.* Fase 4 = decidimos (Control consciente, ZBB literal). El sistema propone referencia, nunca asigna por defecto. Test antes de cualquier feature: ¿refuerza el juicio del usuario o lo sustituye?

## 1 · Contexto de entrada (reportado al abrir, NO verificado en esta sesión)
- Migraciones 29–32 ya en `main`.
- RLS corregido.
- Vistas SQL de Fase 4 listas.
→ Pendiente de verificar en posición 4 del protocolo (ver §5).

## 2 · Ejecutado
Carpeta `components/egm/` creada — 9 archivos. Rama `feature/v10-fase4-bloque0-base`, commit final `d76d549` (tras amend).
- 6 wrappers finos sobre clases existentes de `egm.css` (cero estilos nuevos, cero variantes nuevas).
- 2 stubs mínimos (Toggle, RadioChips) sin CSS ni maqueta, con comentario doctrinal literal "Stub temporal. No hay CSS ni maqueta en Fase 4."
- 1 barrel `index.ts`.
tsc --noEmit limpio. Sin `any` ni `eslint-disable`. Cero cambios fuera de `components/egm/`.

### Contrato de componentes (referencia para Bloque 2+)
| Componente | Elemento | Variantes → clase egm.css |
|---|---|---|
| Hairline | div | normal `rule` · `strong` `rule-strong` · `dot` `rule-dot` |
| Label | div/span (def. div) | `label` |
| Num | span/div (def. span) | `num` (color señal vía className `pos`/`neg`/`warn`) |
| Roman | div/span (def. div) | `roman` |
| Card | div | normal `card` · `soft` `card-soft` |
| Btn | button (type def. button) | base `btn` · `fill` `btn-fill` · `ghost` `btn-ghost` |
| Toggle | STUB · button desnudo | sin CSS — props {on, onChange} |
| RadioChips | STUB · div+buttons desnudos | sin CSS — props {options, active, onChange} |

## 3 · Decisiones / aprendizajes
- **D11** · Toggle y RadioChips sin clase en `egm.css` ni markup en maqueta → en Bloque 0 se crean como stubs mínimos; no se inventa diseño. Se materializan cuando Bloque 2 los consuma (primer uso real: `ParamRow`/Configuración). "Wrapper fino sobre CSS existente" se mantiene literal.
- **Aprendizaje** · React 19 no necesita `forwardRef` (`ref` es prop normal). Patrón para wrappers polimórficos finos = función plana `({ as = 'div', className, ...rest }) => { const Tag = as; return <Tag .../> }`; sin `forwardRef`, sin `ref as any`, sin `eslint-disable`. Code lo añadió por inercia; corregido vía amend.

## 4 · Estado del proyecto al cierre
- Rama `feature/v10-fase4-bloque0-base` @ `d76d549` lista para merge a `main` (lo hace Eric).
- Sin tocar: Fase 3, ingestion PSD2 (`egmfin-jobs/`), `egm.css`, schema.
- `components/egm/` aislada; rutas y componentes existentes intactos.

## 5 · Próximo paso (arranque próxima sesión)
1. Protocolo estable→volátil. En posición 4 (SCHEMA.md): **confirmar que `docs/SCHEMA.md` refleja migs 29–32** (invariante: SCHEMA.md se actualiza en el mismo commit que la migración). Identificar qué tablas/vistas aportan 29–32 y si `weekly_closures` (Bloque 1) ya está cubierta.
2. Mergear `feature/v10-fase4-bloque0-base` si aún no se hizo.
3. Elegir bloque según grafo (0 → 1 y 2 en paralelo):
   - Bloque 1 · migración `weekly_closures` + RLS — SOLO si no está ya en migs 29–32.
   - Bloque 2 · Configuración estructural (`SettingsNav`, `SectionTitle`, `ParamRow`, `AvatarChip`; secciones A/B/D/F/G/H). Desbloquea ZBB Planner y OCR.

## 6 · Recordatorio doctrinal
*Primero vemos · luego anticipamos · después decidimos.* Fase 4 = decidimos. No autoseed. No análisis retrospectivo todavía. Estructura antes que granularidad.

Fin del estado. Próxima sesión arranca leyendo este documento en posición 5 del protocolo.
