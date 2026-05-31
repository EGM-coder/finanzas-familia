# EGMFin · Design System (fuente única)

> **Propósito:** unificar en un solo doc todo lo que está disperso en egm.css, el briefing técnico y las fuentes de diseño. No inventa nada — consolida.
>
> **Fuente técnica canónica:** `app/styles/egm.css` (tokens, clases, animaciones). Este doc es referencia editorial; para valores numéricos exactos, el CSS manda.
>
> **Principio rector:** pixel-fidelity al kit · tono ensayo de banca privada. Next.js = esqueleto · kit = piel.
>
> **Auditoría:** DES-1 del checklist — todo componente nuevo se audita contra este doc antes de cerrar el paso.

---

> **⚠ Fuentes solicitadas no encontradas en el repo (31-may-2026):**
> - `BRIEFING-CLAUDE-CHAT.md` — no existe. Se usó `handoff/tecnico/BRIEFING-TECNICO-FASE4-CONTROL.md` (§7 Motion + §7.2 Copy + §8.3 Prohibiciones). Si existe otro archivo con ese nombre, revisarlo y actualizar este doc.
> - `EGMFin_Documentacion_Completa.md §Elementos Prohibidos` — no encontrado. Si existe fuera del repo (PDF de referencia), reconciliar con §5 de este doc.
> - `README.md §9` — el README actual no tiene sección §9 con contenido de diseño. Si existía en versión anterior, la información relevante está en el briefing técnico.
>
> **Contradicciones encontradas:** ninguna entre las fuentes disponibles. Ver nota en §3 sobre nombres conceptuales de animaciones.

---

## 1 · Tokens

Los tokens viven en `app/styles/egm.css` como variables CSS en `:root` (light) y `.dark`. **No duplicar valores aquí.** Referencia por nombre de variable.

### 1.1 · Paleta cromática

| Token | Rol |
|---|---|
| `--paper` / `--bg` | Fondo base de página |
| `--bg-soft` | Fondo alternativo suave |
| `--bg-card` | Fondo de card / superficie elevada |
| `--rule` | Hairline principal (bordes, divisores) |
| `--rule-2` | Hairline secundaria (más sutil) |
| `--ink` / `--ink-1` | Texto primario |
| `--ink-2` | Texto secundario |
| `--ink-3` | Texto terciario (labels, placeholders) |
| `--ink-4` | Texto cuaternario (muy apagado) |
| `--signal-pos` | Positivo (verde · oscuro en light, suave en dark) |
| `--signal-neg` | Negativo (rojo) |
| `--signal-warn` | Aviso (ámbar) |
| `--positive` | Alias de `--signal-pos` |

**Modo oscuro:** mismos nombres, `.dark` los sobreescribe. Todos los componentes usan solo estas variables — nunca valores hex hardcoded.

### 1.2 · Tipografías

| Token | Fuente |
|---|---|
| `--serif` | Newsreader (next/font) — narrativa, números grandes, cursiva editorial |
| `--sans` | Geist (next/font) — labels, botones, UI utilitaria |
| `--mono` | Geist Mono (next/font) — cifras, inputs de importe |

Inyectadas en `app/layout.tsx`. Los portals (Vaul, Radix) heredan desde `:root`.

---

## 2 · Tipografía y jerarquía

Clases CSS definidas en `egm.css` bajo el namespace `.egm`. Siempre dentro del wrapper `.egm`.

| Clase | Fuente | Estilo | Rol |
|---|---|---|---|
| `.display` | serif | weight 500, letter-spacing -0.012em, line-height 1.02 | Títulos y cifras hero grandes |
| `.display-it` | serif italic | weight 400, letter-spacing -0.005em | Cursiva editorial enfática |
| `.body` | serif | weight 400, line-height 1.45 | Texto corrido, narrativa |
| `.label` | sans | weight 500, 10px, uppercase, letter-spacing 0.16em, color `--ink-3` | Etiquetas de campo, categorías, headers de tabla |
| `.num` | mono | weight 400, tabular-nums, letter-spacing -0.01em | Importes, cifras, contadores |
| `.roman` | serif italic | weight 400, color `--ink-3` | Copy editorial secundario, contexto |

**Jerarquía visual estándar:**
```
.label  (10px, uppercase, ink-3)     ← cabecera de sección
.display / .num                        ← cifra principal
.roman  (serif italic, ink-3)         ← unidad o contexto ("€", "mediana 3m")
```

### 2.1 · Reglas tipográficas de aplicación

- `.label` siempre uppercase automático — **no escribir en mayúsculas el contenido**.
- `.num` para todo importe monetario — garantiza alineación tabular en tablas.
- `.roman` para unidades (€), periodos ("mediana 3m"), copy secundario. No para cifras.
- `.display` reservado para heroes y totales grandes (≥18px). En rows de tabla, usar `.num`.
- **Nunca mezclar fuentes fuera del sistema.** No `font-family` inline ni clases de Tailwind de fuente.

### 2.2 · Cursiva serif — cuándo y cómo

- Usar `<em>` semántico o `.display-it` para frases editoriales canónicas (ver §4).
- En `roman`, la cursiva ya es inherente. No añadir `font-style: italic` encima.
- **Usos correctos:** copy vacío editorial ("*Cada euro nombrado.*"), frases de estado ("*Aún sin histórico.*"), subtítulos de módulo.
- **Usos incorrectos:** datos de usuario, nombres de categorías, cifras, labels.

---

## 3 · Motion (Emil)

Las animaciones tienen dos capas: las clases CSS en `egm.css` (implementadas) y los nombres conceptuales del briefing (algunos pendientes de implementar como clase CSS explícita).

### 3.1 · Animaciones implementadas en egm.css

| Nombre CSS | Duración | Trigger | Uso |
|---|---|---|---|
| `.breathe` | 5.5s ease-in-out, infinite | Auto al montar | **Exclusivo** para hero con semáforo verde. Nunca en otro elemento. |
| `.fade` | 0.8s both | Auto al montar | Entrada suave de pantalla / sección |
| `.fade-1` | idem + delay 0.05s | Auto | Ítem 1 de lista escalonada |
| `.fade-2` | idem + delay 0.20s | Auto | Ítem 2 |
| `.fade-3` | idem + delay 0.40s | Auto | Ítem 3 |
| `.fade-4` | idem + delay 0.60s | Auto | Ítem 4 |
| `.fade-5` | idem + delay 0.85s | Auto | Ítem 5 |
| `.egm-row-removing` | 300ms ease, forwards | Programático | Fila desapareciendo tras acción (e.g. categorizada) |

### 3.2 · Nombres conceptuales del briefing (mapa a implementación)

| Nombre conceptual (§7.1 briefing) | Duración | Mapa a CSS / nota |
|---|---|---|
| `fade-soft` | 0.80s | = `.fade` de egm.css |
| `fade-quick` | 0.32s | ⚠ **No implementado en egm.css aún.** Usar para toasts Sonner. |
| `breathe` | 5.5s | = `.breathe` de egm.css |
| `bar-fill` | 1.2s, una vez por carga | ⚠ **No implementado.** Para `SemaphoreBar` con Framer Motion. |
| `stagger-list` | 0.05s × i, máx 6 escalones | = `.fade-1`…`.fade-5` de egm.css (o Framer variant). Máximo 6 ítems. |
| `splash-in` weekly | 1.2s | ⚠ **No implementado.** Para `CloseSplashWeekly`. |
| `splash-in` monthly | 1.5s | ⚠ **No implementado.** Para `CloseSplashMonthly`. |
| Transición numérica hero | tween 0.6s | Framer Motion `animate` en cifra. |
| Crossfade cambio de tema | 0.5s global | CSS transition en variables (o Framer layout). |

> **Nota §3 — Contradicción potencial:** egm.css implementa `.fade` como 0.8s, que coincide con `fade-soft` del briefing. No hay contradicción de valor. El nombre conceptual y el nombre CSS difieren — mapeo documentado arriba.

### 3.3 · Reglas de motion

- `breathe` **solo** en hero semáforo verde. Jamás en otro elemento.
- `stagger-list` máximo 6 escalones — por encima, todos entran simultáneamente.
- `reduce-motion`: cuando `prefers-reduced-motion: reduce`, todas las duraciones → 0.15s, sin stagger, sin breathe. Implementar en cada componente animado.
- Sin glow ni brillo extra en modo oscuro (los tokens `.dark` ya son suaves por diseño).
- Color nunca es la única señal — siempre acompañar con texto o forma.

---

## 4 · Copy (Impeccable)

### 4.1 · Voz editorial

- Tono: ensayo de banca privada. Contenido, no decoración. Cada palabra justificada.
- Frases cortas. Sin signos de exclamación. Sin emojis.
- En cursiva serif las frases de estado y editoriales — el resto en roman/sans.
- El sistema habla de lo que *es*, no de lo que el usuario *debería* hacer.

### 4.2 · Frases canónicas (no parafrasear)

| Contexto | Frase exacta | Formato |
|---|---|---|
| Hero ZBB — diff = 0 | *"Cuadra."* | `.display-it` o `<em>` |
| Hero ZBB — diff > 0 | *"Sobran X €."* | serif, X en `.num` |
| Hero ZBB — diff < 0 | *"Faltan X €."* | serif, X en `.num` señal roja |
| ZBB sin planificar | *"Cada euro nombrado."* | `.display-it` |
| CategoryCard sin asignar | *"Sin asignar · decide tú."* | `.roman` |
| Sin histórico suficiente | *"Aún sin histórico suficiente. Decide tú."* | `.roman` |
| Cierre semanal sin actividad | *"Una semana en silencio."* | `.display-it` |
| Cierre mensual sin actividad | *"Un mes en silencio."* | `.display-it` |
| CTA cierre semanal | *"Empezar semana N."* | `.btn` |
| CTA cierre mensual | *"Empezar mes M."* | `.btn` |
| Sin actividad semanal | *"Aún ningún gasto esta semana. Nombrado y a tiempo."* | `.roman` |
| Error de red | *"Sin conexión. Mostrando última lectura."* | banner `.warn` |
| Fallo de guardado | *"No he podido guardar el cambio."* | toast `--signal-neg` |
| Loading hero | `——` (guion em doble) | `.num`, color `--ink-4` |

### 4.3 · Frases de toast (Sonner)

| Acción | Toast |
|---|---|
| UPSERT budgets | *"Presupuesto definido · Deshacer."* |
| UPSERT weekly_closures | *"Semana cerrada."* |
| UPSERT monthly_closures | *"Mes cerrado."* |

### 4.4 · Formato de cifras

- Miles: **punto** (`1.250`)
- Decimales: **coma** (`1.250,00`)
- Moneda: **€ separado** con espacio (`1.250,00 €`)
- Signo negativo: **menos tipográfico** (−, U+2212), no guion ASCII (-)
- Cifras siempre en `.num` (mono, tabular).

### 4.5 · Palabras prohibidas en UI visible al usuario

Nunca mostrar al usuario: **PSD2, OCR, schema, migración, RLS, auth, UUID, null, undefined.**  
Si hay que comunicar un error técnico, parafrasear: "No he podido cargar los datos."

---

## 5 · Prohibiciones

Lista unificada desde todas las fuentes disponibles. Sin duplicados. Cada ítem tiene origen.

### 5.1 · Visuales (no-tocar)

| Prohibición | Origen |
|---|---|
| Sombras (`box-shadow`, `drop-shadow`) | briefing §8.3, componentes `.card` |
| Border-radius (excepto scrollbar 3px) | egm.css (cards y botones sin radius), briefing §8.3 |
| Gradientes de fondo o decorativos | briefing §8.3 |
| Emojis | briefing §7.2 |
| Uppercase semántico grande (títulos en caps) | briefing §7.2 — `.label` uppercase es automático y controlado |
| Signos de exclamación | briefing §7.2 |
| Glow ni brillo en modo oscuro | briefing §7.4 |
| Color como única señal (siempre + texto o forma) | briefing §7.5 |
| Librerías externas de charting (Recharts, Chart.js, etc.) | briefing §1 — SVG propio + Visx permitidos |
| Fuentes fuera del sistema | egm.css — solo `--serif`, `--sans`, `--mono` |
| Valores hex hardcoded (usar variables CSS) | principio general del sistema |
| Chips de fondo de colores en categorías (fondo lleno) | auditoría AUDIT_CHECKLIST VIS-1 |

### 5.2 · Comportamiento y datos

| Prohibición | Origen |
|---|---|
| Inferencia automática de periodicidad o suscripciones | AUDIT_CHECKLIST DOC-1 |
| Predicción / proyección / regresión | AUDIT_CHECKLIST DOC-2 |
| Sugerencias de optimización o downgrades | AUDIT_CHECKLIST DOC-3 |
| OCR / granularidad de ticket | briefing §0.4 |
| Orden por relevancia o ranking algorítmico | AUDIT_CHECKLIST DOC-5 |
| Autoseed (sistema rellena decisiones del usuario) | AUDIT_CHECKLIST DOC-8 |
| DELETE en tablas de historial (transactions, budgets, incomes, weekly_closures, monthly_closures) | briefing §8.3 |
| Crear quarterly_closures o yearly_closures sin nueva decisión | briefing §8.3 |
| Configuración como módulo en Fase 4 | briefing §0.4 |
| security_definer en vistas (usar security_invoker) | briefing §8.3 |

### 5.3 · Proceso (lo que Code no decide)

| Prohibición | Origen |
|---|---|
| Inventar columnas, tablas o enums | briefing §8.3 |
| Modificar RLS policies | briefing §8.3 |
| Cambiar la doctrina ZBB (diff = 0 obligatorio) | briefing §8.3 |
| Aplicar reglas retroactivamente desde UI | briefing §8.3 |
| Modificar tipografía o paleta del sistema | briefing §8.3 |
| Cambiar `security_invoker` por `security_definer` | briefing §8.3 |

---

## 6 · Principio rector

> **Pixel-fidelity al kit · tono ensayo de banca privada.**

- Next.js = esqueleto. Kit = piel. La app implementa lo que el kit muestra — sin interpretación libre.
- Toda pantalla nueva parte de los tokens de egm.css. Sin variaciones ad-hoc.
- El sistema **ve y refleja**. No infiere, no predice, no optimiza, no sugiere.
- El lenguaje visual es el del informe anual de una gestora de patrimonio: densidad tipográfica, espacio blanco generoso, sin decoración gratuita.
- Aislamiento `.egm` en todo código nuevo — los portals (Vaul, Radix, Sonner) heredan tokens desde `:root`.

---

## 7 · Accesibilidad mínima

| Requisito | Valor |
|---|---|
| Contraste texto / fondo | ≥ 4.5:1 |
| Contraste hairlines | ≥ 3:1 |
| Focus visible | `outline: 2px solid var(--ink-1); outline-offset: 2px` — ya en egm.css |
| ARIA | Toggle, RadioChips, sub-tabs requieren roles/labels explícitos |
| Reduce-motion | Todas las duraciones → 0.15s, sin stagger, sin breathe |
| Color como señal única | Prohibido — siempre + texto o forma acompañando |

---

## 8 · Componentes base del sistema

Definidos en `egm.css` o como componentes React bajo `.egm`. Si no existen como reutilizables, extraer antes de construir encima.

| Componente | Clase CSS / notas |
|---|---|
| Hairline | `.rule` (1px, `--rule`) · `.rule-strong` (1px, `--ink`) · `.rule-dot` (punteada) |
| Label | `.label` — uppercase auto, 10px, `--ink-3` |
| Num | `.num` — mono, tabular-nums |
| Roman | `.roman` — serif italic, `--ink-3` |
| Card | `.card` (border `--rule`) · `.card-soft` (bg `--bg-soft`) — **sin radius, sin shadow** |
| Btn | `.btn` · `.btn-fill` · `.btn-ghost` — **cuadrados, sin radius** |
| Row clickable | `.egm-row-clickable` — cursor pointer, hover `rgba(0,0,0,0.025)` |
| Toast | Sonner con overrides EGMFin (ver egm.css `[data-sonner-*]`) — `border-radius: 0` |

---

*Actualizar este doc en el mismo commit que cualquier cambio a `app/styles/egm.css` o a las reglas editoriales. Fuente última sobre valores numéricos: el CSS. Fuente última sobre intención: el Dossier V3.*
