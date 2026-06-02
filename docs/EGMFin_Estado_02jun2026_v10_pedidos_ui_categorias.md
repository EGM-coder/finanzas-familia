# EGMFin — Estado 02-jun-2026 (v10) · UI Pedidos + categorías

## ESTADO AL CERRAR
Sesión sobre el Módulo Pedidos (capa VEMOS) + arreglo de categorías.

**Doctrina nueva — D-005:** la categoría de un cargo PayPal/Amazon vive en UN SOLO SITIO,
el propio cargo (`transactions.category_id`). Pedidos lee/escribe esa columna a través del
enlace; no guarda copia. Pedido sin cargo enlazado → categoría provisional en
`purchase_order_lines.category_id`, volcada al cargo en el instante del enlace. Las 4 vistas
de gasto NO se tocan. (Resolvió la tensión write-back vs vista: cargo canónico, Pedidos lo
edita a través del enlace.)

**Corroboración matches (lectura):** los 10 ai_proposed son sólidos (importe clavado, 1-3 d
de desfase, sin colisión), todos PayPal suscripción, todos con category null en Control. Las
18 líneas son todas PayPal con `description` = comercio (no producto), 0 sugerencias IA. No
hay detalle de producto en ningún sitio (PayPal estructural, Amazon parser pendiente) → la
propagación es a nivel pedido, una categoría; splits sin inputs.

**Construido y validado:**
- **T-022a · UI Pedidos** (1er nivel nav): lista, detalle, categoría write-through
  canónico=cargo, confirmar match (ai_proposed→confirmed), enlace manual (ventana ±15 d).
  Commits 9f662e0 + 05c4cdd. Auditoría 10/10. Validado en terreno: categoría puesta en
  Pedidos aparece en ambos lados al enlazar.
- **T-023 · slice 1b:** map comercio→categoría en parser + backfill ai_suggested_category_id.
  Commits ac308b3 + 029c897. Mapeado: Apple→Streaming(7), Google→Streaming(3),
  Iberia→Vuelos y transporte(1), Leroy→Mantenimiento(1) = 12 líneas. Idempotente. Sin mapa:
  KIWOKO, TRADEINN (regalo, one-off), BodeBoca, ind.plásticas, Amazon (0 líneas).
- **Bug crear categoría (42501):** faltaba GRANT INSERT/UPDATE en categories (SCHEMA.md §4 en
  DRIFT, declaraba grants inexistentes). Mig 40 grants_categories_authenticated. SELECT venía
  de blanket de plataforma. Commits a91e200 + 4c1f4d7. SCHEMA §4 corregido. P-017 (drift §4)
  + P-018.
- **Bug categoría hija no seleccionable:** CategoryCombobox asumía jerarquía fija 2 niveles.
  Fix branchIds/rootAncestor/selectables, profundidad arbitraria, hoja-only seleccionable,
  sin cambio visual. Commit 4e734ee. Nuevo INV en AUDIT_CHECKLIST (categoría usable de
  inmediato, padre o hoja).

**Modelo de estado de pedido acordado (para slice 2, derivable, sin DDL):** dos ejes
ortogonales — Enlace (sin enlazar/parcial/enlazado) + Pago (pagando N/M / acabado de pagar);
clasificación incluida en "en orden". Financiado "acabado de pagar" = todas las cuotas
cargadas. Puente doctrinal: enlazado-pero-pagando = cash comprometido = entrada a
ANTICIPAR/PV-1.

## PENDIENTE (manual de Eric, inmediato)
- Categorizar BodeBoca→Vino y KIWOKO→Mascotas en la UI.
- Overwrite Apple-109,99 (no es streaming) y revisar Leroy→¿proyecto Maristas, no Mantenimiento?
- Verificar en navegador los 3 casos del fix de combobox (Vino ✓, raíz sin hijos ✓, af369d7d
  = grupo). Eric dio el OK a seguir; queda confirmación visual fina.
- Confirmar grano hoja-only: al darle hijo a una categoría, deja de ser asignable directa.

## FRENTES DISPONIBLES (próxima sesión)
- **T-026 · matching cuotas financiadas** (el que importa, 0% TAE): los 4 PayPal financiados
  no casaron; causa probable first_charge_date = fecha email, no cargo real → ventana ±3 d
  falla. Desbloquea el eje Pago y PV-1. Era el siguiente; arrancar en frío.
- **Slice 2 · indicador estado pedido** (ejes Enlace+Pago, modelo acordado) + PV-3 en CONTROL
  + sub-apartado compromisos en Inicio (PV-1). Encima de T-026.
- T-025 · líneas Amazon (requiere HTML raw de auto-confirm@amazon.es).
- Mini-follow T-023: KIWOKO→Mascotas en el map + re-backfill (tras crear Mascotas).
- Horizonte Módulo IV · fiscal · Asesor IA (VI) · ZBB v2 semáforo.

## VIGILAR
- **f153ff6 / SCHEMA.md:** retro-check nunca reportado (3 veces pedido) — confirmar al
  arrancar que esa mig actualizó SCHEMA.md en el mismo commit (PRO-8).
- Decisión ventana ±15 d del enlace manual: probablemente corta para financiados (va con T-026).
- Identificadores: T-023 llenó hueco por debajo de T-025/T-026 reservados (no colisión, serie
  no monótona). Escribir T-025/T-026 en PARCHES para que "T más alta" sea real.
- Kutxabank tarjeta Eric parada en 1-may (¿cron PSD2 trae movimientos?).
- v_median_income_3m ciega hasta ~julio → recalcular desde transactions (migración).
- Cron parsers email sin automatizar (OAuth interactivo no corre en Actions).

## IDENTIFICADORES ESTA SESIÓN
D-005 · T-022a · T-023 · mig 40 · P-017 · P-018 · nuevo INV (categoría usable).
Commits: 9f662e0, 05c4cdd, ac308b3, 029c897, a91e200, 4c1f4d7, 4e734ee.
