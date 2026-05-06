# EGMFin — Handoff para Claude Code

> Sistema financiero familiar de Eric Gahimbare Ibáñez (Logroño · La Rioja).  
> Doctrina: **"Una forma más lúcida de ver"**.  
> *Patrimonio · Flujos · Protección · Horizonte · Control cotidiano.*

---

## ⚠️ Sobre estos archivos

Lo que hay en este paquete son **referencias de diseño en HTML** — prototipos que muestran apariencia, contenido y comportamiento esperados. **No son código de producción para copiar tal cual.** Tu trabajo es **recrear estos diseños en el stack que elijas** (recomendado abajo) usando sus convenciones idiomáticas — no servir el HTML directamente.

**Fidelidad: alta.** Las pantallas son hi-fi: colores, tipografías, espaciados y rítmica son finales. Reprodúcelos con fidelidad de píxel. Las microinteracciones (números que respiran, fades escalonados, scrubber del horizonte) son parte del diseño, no decoración opcional.

---

## 1. Visión y producto

EGMFin es un **sistema editorial-financiero familiar**, no una fintech genérica. Tono: ensayo de banca privada · catálogo · doctrina explícita. La cita guía es *"No suma libros — cataloga"*.

**Dos superficies, mismo lenguaje:**
- **App móvil** (iOS-first, luego Android) — uso cotidiano: foto del ticket, semáforo semanal, consulta rápida de patrimonio.
- **Web dashboard** — análisis profundo: simulador 2026—2036, línea de vida, dossier vivo navegable.

**Dos perfiles de usuario:**
- **Eric** — Head of Controlling. Vista completa, simulador, vesting, fiscal.
- **Ana** — Vista filtrada, sin sueldos individuales, foco en familia y Maristas.

---

## 2. Módulos (siete capítulos romanos)

| # | Módulo | App | Web | Pantalla clave |
|---|---|---|---|---|
| I | **Inicio** · vista situacional | ✅ | ✅ | Patrimonio neto + flujo del mes |
| II | **Flujo** | (en Inicio) | (en Inicio) | Ingresos · fijos · margen |
| III | **Maristas** · proyecto vertebrador | ✅ | ✅ | Cronograma de pagos · cuota estimada |
| IV | **Horizonte** · simulador 2026—2036 | ✅ | ✅ | Tres escenarios con scrubber por año |
| V | **Línea de vida** · hitos | ✅ | ✅ | Timeline con vestings y acciones críticas |
| VI | **Asesor IA** | ✅ | ✅ | Pregunta abierta, respuesta razonada con datos |
| VII | **Control · microgasto** | ✅ | ✅ | Foto del ticket → categorización → semáforo |

Cada módulo existe en **claro y oscuro**. Total: **24 pantallas** referenciadas en el kit.

---

## 3. Stack recomendado

**Web + App con código compartido máximo:**
- **React + TypeScript** (necesario)
- **Next.js 14 App Router** para web
- **Expo (React Native)** para móvil — comparte data layer + types con la web
- **Tailwind CSS** con tokens custom (mapeados 1:1 a los CSS variables que ves en `src/egm.css`)
- **Zustand** o **TanStack Query** para estado (datos viven mayormente en server)
- **Recharts** o **Visx** para los gráficos (el del Horizonte es un SVG hecho a mano — Visx lo replica bien)
- **Supabase** (DB · auth · storage para tickets fotografiados) — encaja con el modelo familiar de dos perfiles
- **Vercel AI SDK** para el Asesor IA (con Anthropic como proveedor)

**Si Eric quiere algo más contenido:** monorepo con Turborepo, una sola lib `@egm/core` con tipos, fmt, doctrina y paleta — consumida por `apps/web` y `apps/mobile`.

---

## 4. Sistema de diseño · tokens exactos

> Todos están en `src/egm.css` como CSS custom properties. Mapéalos a tu sistema (Tailwind config / Style Dictionary / loquesea).

### Colores · modo claro
```
--bg          #ffffff   superficie base
--bg-soft     #fafaf9   papel · cards secundarias
--bg-card     #ffffff   cards primarias
--rule        #e6e6e3   bordes y separadores fuertes
--rule-2      #f0f0ec   separadores hairline
--ink         #111111   texto principal · botones primarios
--ink-2       #2b2b2b   texto secundario
--ink-3       #6b6b6b   labels, romanos, notas
--ink-4       #9a9a98   placeholders, deshabilitado
--signal-pos  #1f6b3a   verde sobrio (positivo, vesting, OK)
--signal-neg  #9c1f1f   rojo sobrio (alerta crítica, hipoteca)
--signal-warn #8a6a1a   ámbar (semáforo atención)
```

### Colores · modo oscuro
```
--bg          #0e0e0d
--bg-soft     #141413
--bg-card     #1a1a18
--rule        #2a2a27
--rule-2      #1f1f1d
--ink         #f4f1ea   crema cálido, NO blanco puro
--ink-2       #d6d3cc
--ink-3       #8e8a82
--ink-4       #56544f
--signal-pos  #86b08a
--signal-neg  #d98a8a
--signal-warn #c9a55c
```

### Tipografía
```
--serif  'Newsreader'      títulos editoriales · cifras display · cursivas para cita
--sans   'Geist'           UI · labels · botones
--mono   'Geist Mono'      todos los números (tabular)
```

**Rangos de tamaño usados:**
- Display app: 64—96 px (números patrimonio)
- Display web: 96 px (landing) — 38—42 px (titulares de sección)
- Body: 13—16 px
- Label (CAPS · 0.16em letter-spacing · 10 px): casi todo lo metainformativo
- Roman (italic serif · 11—14 px): notas al margen, fechas, contexto

### Rítmica y reglas
- **Reglas**: hairline `1px solid var(--rule)`, fuerte `1px solid var(--ink)` (separa secciones grandes), punteada para diálogo/respuesta
- **Padding consistente**: app 22 px laterales · web 50 px
- **Cards**: borde 1px, sin sombra, sin border-radius (radio 0 — el sistema es editorial, no Material)
- **Sin sombras**, **sin gradientes**, **sin border-radius excepto chips/dots circulares**

### Animaciones (todas en `egm.css`)
- `breathe` (5.5s ease-in-out infinite) — solo cifra de patrimonio
- `fade` (.8s + delays escalonados de 50—850 ms) — entrada de cada bloque

### Iconografía
- **Casi cero iconos.** El sistema usa numeración romana (I—VII) y reglas como jerarquía.
- Donde hay iconos (status bar) son SVG inline simples.
- Para "foto del ticket" en Control, símbolo `◉` o icono de cámara fino.

---

## 5. Arquitectura de datos

Toda la data sample vive en `src/data.jsx` bajo `window.EGM`. En código real eso es tu schema. Estructura literal:

```ts
type Egm = {
  family: { eric, ana, leo, biel, city, surname: 'Gahimbare Ibáñez' };

  netWorth: {
    today: number;             // patrimonio neto en €
    breakdown: { k, v, n }[];  // 5 clases: liquidez · indexados · TR · Maristas pagado · stock options
  };

  flow: {
    income: number;
    fixed: number;             // negativo
    remaining: number;
    rows: { k, v, t: 'income'|'fixed', note? }[];
  };

  maristas: {
    base: 509100;
    paid: 143370;
    pending: 416640;           // hipoteca por firmar
    delivery: 'mayo 2026';
    promotor: 'COBLANSA';
    interior: 'MAIO';
    milestones: { date, label, amount, paid: boolean, hero?: boolean }[];
    monthly: { rate, rateHigh, comm, ibi };
  };

  timeline: { year, m, label, note, kind: 'now'|'action'|'event'|'vest'|'horizon' }[];

  projection: {
    years: number[];           // 2026—2036
    base, optimist, pessimist: number[];  // miles €
    notes: { [year]: string }; // hitos clave para anotar el gráfico
  };

  doctrine: {
    main: 'Una forma más lúcida de ver.';
    sub: string;
    pillars: ['Primero vemos.', 'Luego anticipamos.', 'Después decidimos.'];
    edge: 'No suma libros — cataloga.';
  };

  advisor: {
    sample: ConversationTurn[];
    suggestions: string[];
  };

  control: {
    week: { num, from, to, remaining };
    semaforo: 'verde' | 'ambar' | 'rojo';
    weekSpend, weekBudget, todaySpend: number;
    recentTickets: Ticket[];
    categories: { k, v, b }[];   // gastado vs budget
  };
};
```

**Backend mínimo:**
- `users` (eric, ana) con perfiles diferenciados — Ana tiene visibility filter sobre transacciones individuales.
- `accounts` con clase (liquidez · indexado · broker · inmueble · stock-option).
- `transactions` (fuente: import bancario manual + tickets OCR).
- `tickets` (foto en storage + texto OCR + categoría + monto).
- `milestones` (Maristas + línea de vida — son la misma tabla con tipo distinto).
- `projections_snapshots` (no se calculan en cliente — se persisten cada vez que cambian los inputs).

---

## 6. Pantalla por pantalla — qué reproducir

### App · Onboarding
- Pantalla ceremonial. **No es un wizard.** Es un manifiesto.
- Header: `EGM·FIN — Versión III` · regla
- Display 44 px: **"Una forma más *lúcida* de ver."** — la palabra "lúcida" en cursiva serif
- Cuerpo de 2—3 líneas con la familia mencionada por apellido en cursiva
- Pilares I·II·III listados con números romanos
- Dos botones full-width: `Entrar como Eric →` (filled) · `Entrar como Ana` (outline)
- Fades escalonados al entrar (.05 / .20 / .40 / .60 / .85 s)

### App · Inicio (módulo I)
- ScreenHead: chapter "I · Inicio" + título "Hoy, 24·iv·26"
- **Cifra patrimonio**: 64 px, mono, con animación `breathe`. Sufijo "€" pequeño en gris.
- Cuerpo italic serif: "Líquido + base · sin Maristas finalizado"
- Lista composición con 5 filas: roman number · nombre · nota · cifra alineada derecha · porcentaje
- Card flujo del mes: 3 columnas (ingresos / fijos / margen) con verde / rojo / negro
- **Tab bar fijo abajo** con romanos I·II·III·IV·V

### App · Maristas (módulo III)
- Display de pagado/total con barra de progreso plana (no curva)
- Lista de milestones, **el de hipoteca** (`hero: true`) destacado con fondo `bg-soft` y borde izquierdo negro grueso
- Etiquetas pequeñas: `Pagado` (verde) o `Pendiente` (gris)
- Card-soft al final con cuota estimada en rango (`1.330 – 1.480 €/mes`)

### App · Horizonte (módulo IV)
- SVG hecho a mano: tres líneas (base sólida 1.8 px · optimista dashed · pesimista punteado)
- Range slider que mueve un punto sobre la curva base
- Año seleccionado en italic serif 44 px
- Tres "card-strips" con borde superior 1.5 px en color de su escenario y la cifra en mono 22 px

### App · Control · microgasto (módulo VII) — **el más nuevo**
- Card semáforo arriba: dot de color (verde/ámbar/rojo) + cifra grande mono `287,40 / 350 €`
- Dos botones grandes: `◉ Foto del ticket` (filled) · `+ Manual` (outline)
- Lista por categoría con barras finas (rojo si excede)
- Lista de tickets con thumbnail cuadrado de 28 px (`IMG` placeholder cuando hay foto)
- Si no hay foto: dot `·` en lugar de IMG

### App · Asesor IA (módulo VI)
- Pregunta del usuario en italic serif grande, entre comillas españolas «»
- Regla punteada como separador
- Respuesta razonada: párrafos de body + filas métricas (label + valor mono grande + nota italic)
- Sugeridas en cards-soft, también en italic
- Input al final con border-top discreto

### App · Línea de vida (módulo V)
- Lista vertical, año en columna izquierda
- Dot circular: relleno negro si es "hoy", verde si vesting, rojo si acción crítica
- Línea vertical conectando los dots
- Etiquetas pequeñas: `HOY` (filled) · `CRÍTICO` (outline rojo) · `VESTING` (outline verde)

### Web · Landing
- Layout 1.5fr / 1fr
- Display 96 px con la cita partida en 4 líneas, "lúcida" en cursiva
- Card derecha: 6 KPIs estado del sistema
- Footer con tres pilares en grid de 3 columnas, italic serif 28 px

### Web · todas las internas
- Sidebar 200 px con romanos I—VII y línea izquierda en activo
- Header del módulo: chapter label + display 38—42 px + body italic gris + regla fuerte
- Layouts de 1.4fr / 1fr o 1.2fr / 1fr para columnas

### Web · Horizonte (la pantalla "wow")
- SVG 700×280 con annotations (líneas verticales discontinuas marcando "Vesting I", "Firma hipoteca", etc. directamente en el gráfico)
- Slider full-width abajo
- Tabla de tres columnas con escenarios + año en cifra italic 60 px

### Web · Control · microgasto
- Igual estructura que app pero en grid 1.2fr / 1fr
- Card a la derecha con CTA captura + lista vertical de tickets con thumbnail 34 px

---

## 7. Comportamiento e interacciones

- **Números que respiran**: solo el patrimonio neto principal y la cifra dominante de cada módulo. Animación `breathe` 5.5 s. *No abuses.*
- **Fades de entrada**: cuando una pantalla aparece, los bloques entran con delay escalonado. Ver `egm.css` clase `.fade` y `.fade-1` ... `.fade-5`.
- **Scrubber del horizonte**: sincroniza punto en gráfico + año mostrado + tres cifras de escenarios. Smooth en cliente, sin animación de transición de números (cambian discretos).
- **Foto del ticket**: cámara nativa → OCR (server-side, Anthropic vision o Tesseract si quieres free) → preview editable → guardar.
- **Semáforo**: el color (`verde` / `ambar` / `rojo`) es lógica de servidor, no umbral fijo. Eric quiere reglas configurables.
- **Modo claro/oscuro**: toggle global. La diferencia es solo CSS variables — nunca cambies layout entre modos.
- **Filtro Ana**: Ana no ve nóminas individuales, sí totales del hogar. Implementar como middleware en queries, no en cliente.

---

## 8. Tipo de letra · Google Fonts

```
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap');
```

En producción: self-host con `next/font` o equivalente.

---

## 9. Lo que **NO** debe pasar

- ❌ Ni un emoji.
- ❌ Ni un border-radius mayor que un dot circular.
- ❌ Ni un gradiente.
- ❌ Ni una sombra.
- ❌ Ni un chip de color (verde/rojo solo como tinta de tipografía o de barras de progreso, nunca como pill de fondo).
- ❌ No usar Inter, Roboto, ni system-ui para titulares.
- ❌ Nada de iconos genéricos de "money bag" / "chart up". Si hace falta, romano + tipografía.
- ❌ No "modernizar" el tono editorial — el cliente lo eligió específicamente.

---

## 10. Archivos en este paquete

```
handoff/
├── README.md                       ← este archivo
├── CONTEXT.md                      ← notas previas del proyecto + perfil familiar
├── EGMFin · Kit.html               ← abrir en navegador, vista completa de las 28 pantallas
├── src/
│   ├── egm.css                     ← TOKENS · sistema de diseño completo
│   ├── data.jsx                    ← schema de datos (con valores reales del dossier)
│   ├── egm-shell.jsx               ← StatusBar · TabBar · ScreenHead · WebFrame
│   ├── egm-app.jsx                 ← 5 pantallas app: Onboarding · Home · Maristas · Simulator · Timeline · Advisor
│   ├── egm-web.jsx                 ← 6 pantallas web
│   ├── egm-control.jsx             ← módulo VII Control microgasto (app + web)
│   ├── ios-frame.jsx               ← solo para preview, no portar a producción
│   └── design-canvas.jsx           ← solo para preview
└── reference/
    ├── EGMFin_Dossier_V3.pdf       ← dossier estratégico oficial (doctrina + módulos)
    └── Finanzas_Familia_Documentacion.pdf  ← documentación técnica del proyecto
```

---

## 11. Orden recomendado de implementación

1. **Tokens + tipografía + light/dark toggle** funcionando aislado.
2. **Schema de datos** + seed con los valores reales del dossier (puedes copiar `src/data.jsx` directo).
3. **Inicio (módulo I)** en una sola plataforma — es la pantalla más rica y prueba todo el sistema.
4. **Maristas (III)** — confirma que el cronograma editorial funciona.
5. **Control · microgasto (VII)** — incluye captura de imagen, primer flujo crítico para Ana.
6. **Horizonte (IV)** — la pantalla wow del dossier; SVG + scrubber.
7. **Asesor IA (VI)** — última, ya con todos los datos disponibles.
8. **Onboarding** al final — porque ya conoces el lenguaje.
9. **Línea de vida (V)** + **Landing web** — capa narrativa.

---

**Cualquier duda sobre intención, micro-comportamiento o lo que no esté escrito aquí: la doctrina del dossier manda.** *"Primero vemos. Luego anticipamos. Después decidimos."*
