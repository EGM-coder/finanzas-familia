# EGMFin · Estado 12-jun-2026 · Módulo Cuentas (web app)

> Handoff de sesión. El módulo Cuentas se construyó de maqueta a producción.
> Punto de cierre: módulo completo en todo lo visible, con datos reales y verificado.
> Próxima sesión arranca en **B2**.

---

## 1. Decisiones de doctrina tomadas

- **D-019 — Lente Kowalski evoluciona a "Emil Kowalski".** Monocromo refinado con: profundidad sutil (sombra), radio suave, micro-movimiento, donut de liquidez en escala de gris y data-viz elegante. Se **reutilizan** las señales existentes `--signal-pos` / `--signal-neg` para signo +/− (no se crea acento nuevo). Curvas = historia real, nunca proyección.
- **Cuentas cuelga de Inicio**, no es módulo top-level (IA de 5 intacta). Es la anatomía navegable del patrimonio que Inicio resume. Entrada: link "desglose por titular →" junto a Composición en Inicio.
- **Espina por titular:** `Eric · Familia (Ana+Eric común) · Leo · Biel` + "Todo" (agregado de lo visible). "Mío" es relativo a quién entra (RLS). Ana tras su muro.
- **Herencia:** el campo `titular` debe ser **reasignable** — la sucesión ("todo → Leo/Biel") se modela como acción de reasignación. Requisito de diseño, no construido aún.
- **Stock options = Contingente.** Liquidez futura, segregada, **no suma** a ningún total. Su casa de verdad es Horizonte; en Cuentas es solo recordatorio amurallado.
- **Modelo de compartición (pendiente B2):** muro por defecto + toggle **Y/N por titular**, asimétrico y revocable (cada uno manda sobre lo suyo); **continuidad** como permiso pre-armado aparte; **agregado de hogar** opcional (cifra sin detalle). Backend = tabla `shares` consultada por RLS.

---

## 2. Backend entregado (migraciones aplicadas y verificadas)

| Mig | Nombre | Qué hace |
|-----|--------|----------|
| 20260612000052 | `titular_accounts` | Columna `titular` en `accounts` (text, NOT NULL, CHECK `eric\|ana\|comun\|leo\|biel`). Eje de propiedad/destino, distinto de `visibility` (muro de privacidad). Backfill por nombre+visibility. |
| 20260612000053 | `v_cuentas_composicion` | Vista (titular × segmento de liquidez → valor). `security_invoker=true`, GRANT SELECT a authenticated. Alimenta donut y totales. |
| 20260612000054 | `v_cuentas_detalle` | Igual lógica, granularidad de cuenta (account_id, name, institution, visibility). Suma por titular+segmento = composición, diff 0,00. `security_invoker=true`. |

Segmentos de liquidez (por `orden`, efectivo→menos convertible):
`1 Efectivo · 2 Renta variable + ETF · 3 Fondos indexados · 4 Roboadvisor · 5 Cripto`.
Clasificación: cuentas `bank/cash/tesoreria_tae` → Efectivo; `holdings_valued` por `asset_type`; `manual_holdings` → Roboadvisor.

Reparto por titular (vivo, varía con precios): Eric ~38,5k · Familia ~16,7k · Leo ~7,7k · Biel ~2,3k.
Contingente (Eric): stock options Nordex, intrínseco ~43.730 € (P1 strike 11,60 / P2 strike 26,31; NDX1 40,82 €; condiciones cumplidas; bloqueadas 2029-2031).

---

## 3. Frontend entregado — `app/(egm)/cuentas/`

Patrón idéntico a Inicio: `page.tsx` (server, todas las queries) → componentes cliente.

- **Tokens D-019** añadidos a `egm.css` sin tocar los existentes: `--shadow-sm/--shadow`, `--radius/--radius-sm` (12/8px), rampa `--liq-1..5` (light + dark invertida).
- **U1** — ruta + shell sin scroll + espina por titular + totales en vivo desde `v_cuentas_composicion`. Ruta dentro de `(egm)` (hereda EgmNav + ThemeProvider). Prototipo viejo eliminado.
- **U2** — `ComposicionPanel`: donut de liquidez (color por `orden`, hover sincronizado centro↔leyenda, `onSelectSegment`).
- **U5** — `ContingenciaPanel` (commit 317102b): stock options, muro izquierdo, no suma; empty state para no-Eric.
- **U6/U8** — `AsesorPanel` (commit e4041d6): carrusel drag+dots, 3 slides (Riesgos: concentración top-ticker + divisa USD; Liquidez; Composición). Cifras calculadas en cliente, cero inventado.
- **v_cuentas_detalle + U4** (commits 5ceed9c, 8f31a67): drill-down con stack + breadcrumb. `SegmentoView` (cuentas del segmento, oculta 0€) → `CuentaView` → `PosicionView` (PriceChart real desde `holding_prices`, o "histórico no disponible aún"). TR Cartera: top 2 + "+N — ver".
- **U7** — movimientos PSD2 reales (commit 54fba68): `CuentaView` con 3 modos (posiciones / movimientos / vacío). Transferencias atenuadas. Kutxa (78) y Santander común (57) con historial desde feb-2026.

---

## 4. Pendiente (próxima sesión, en orden)

1. **B2 — `shares` + auditoría RLS multiusuario.** Seguridad: muro Eric/Ana y compartición ágil Y/N. Auditar que la cadena completa (`holdings_valued`, `manual_holdings`, `accounts`, `stock_options`) respeta RLS por titular/visibility. Hacer **antes** de meter a Ana.
2. **B4 → U3 — motor de NAV histórico + curva acumulada.** Snapshot diario `holdings × precios × flujos`. Desbloquea el panel Performance (hoy marco etiquetado) y los marcadores de eventos. Pieza grande.
3. **B5 — badges de frescura** por cuenta (antigüedad del dato; el roboadvisor caduco como patrón, no excepción).

### Diferido conscientemente
- **Colchón en meses de gasto fijo:** `v_fixed_expenses_observed` solo detecta 1-2 contrapartes (739–2.665 €/mes) → base no fiable. Esperar a una definición robusta de gasto fijo recurrente (Control/ZBB) antes de mostrar la señal.
- **Toggle "por cuenta / por tipo":** no construido. El donut de liquidez ya da la lente por tipo; añadir listado plano por cuenta solo si se echa en falta.

---

## 5. Aprendizajes y notas técnicas

- **`security_invoker=true` obligatorio** en vistas multiusuario para que la RLS del muro fluya al usuario que consulta. Sin él, fuga Eric↔Ana. Vía MCP/service_role se ve todo (correcto); la app filtra por usuario.
- **Cadena RLS aún sin cerrar:** las vistas de Cuentas son security_invoker, pero falta auditar que `holdings_valued`/`manual_holdings` también respeten RLS (B2).
- **Producción ≠ maqueta: no hay curvas de pega.** Solo precio real (`holding_prices`: NVDA, MSFT) o estado honesto. La curva de valor de cartera en el tiempo necesita el motor NAV (B4).
- **Color del donut por `orden`, no por posición:** Efectivo siempre el tono más oscuro aunque un titular no tenga todos los segmentos → la liquidez se lee igual en todos.
- **Contingente fuera de `v_cuentas_composicion`** por diseño (no suma).
- `titular` ≠ `visibility`. `titular` = de quién es / para quién. `visibility` = quién lo lee.
- `stock_options` aún sin campo titular → tratadas como de Eric; entran al muro en B2.

---

## 6. Arquitectura de ficheros (referencia)

```
app/(egm)/cuentas/
  page.tsx              # server: v_cuentas_composicion, v_cuentas_detalle,
                        #   holdings_valued, manual_holdings, holding_prices (90d),
                        #   stock_options_valued, transactions (120d cash)
  CuentasClient.tsx     # estado titular + stack de navegación + breadcrumb
  ComposicionPanel.tsx  # donut liquidez (U2)
  AsesorPanel.tsx       # carrusel señales (U6/U8)
  ContingenciaPanel.tsx # stock options (U5)
  SegmentoView / CuentaView / PosicionView  # drill-down (U4/U7)
egm.css                 # tokens D-019 añadidos
docs/SCHEMA.md          # §3.15 composicion, §3.16 detalle, titular en accounts
```
