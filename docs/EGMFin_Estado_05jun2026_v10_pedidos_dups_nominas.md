# EGMFin · Estado 05-jun-2026 (v10) — Pedidos usable · duplicados · spec nóminas

## Hecho en esta sesión
- **T-030 · Nav canónica**: 6 módulos (I Inicio, II Proyecto[disabled], III Control, IV Horizonte[disabled], V Análisis[disabled], VI Ajustes→/configuracion). Pedidos y Presupuesto fuera de la nav (acceso por botones dentro de Control). Única def: EgmNav.tsx.
- **T-031 · Enlace manual Pedidos**: candidatos (sin enlazar + amount<0 + mismo raíl + ventana blanda por proximidad), multicuota (installment_number, "Pago N/M"), desenlazar con copy-back D-005.
- **T-032 · Drawer + rechazar** (dentro de T-034): drawer Vaul deslizable (handle+CSS), acción "Rechazar" en ai_proposed.
- **T-033 · Cargo directo**: transactions.is_direct_charge (mig-43); indicador PV-3 de 3 estados (vinculado/directo/sin vincular); toggle "marcar directo" alcanzable desde el CategorizationDrawer de Control para cargos sin pedido.
- **T-034 · Fix error al desenlazar**: raíz = mig-37 activó RLS en purchase_order_charges sin policy DELETE → deny-by-default (el GRANT de mig-42 no bastaba). Fix mig-44. Además: detección de raíl unificada (counterparty OR description OR raw_concept con paypal/amazon).
- **T-035 · Fix render Control**: raíz = mig-43 en git pero NO aplicada a la DB → "column is_direct_charge does not exist". Sub-query defensiva + migración aplicada.
- **Sync DB↔repo**: migs 42,43,44 estaban SOLO en git; aplicadas a Supabase (db push) y verificadas en DB real. Drift acotado a 42-44.
- **T-036 · Duplicados neutralizados (reversible, SIN borrar)**: transactions.superseded_by (mig-45, FK self-ref ON DELETE SET NULL) + filtro superseded_by IS NULL en vistas (v_spent_by_category_month/week, v_fixed_expenses_observed; budget_status y median heredan) y en queries inicio/planner/control/pedidos (mig-46+código). 5 pares h_/er_ marcados conservando el er_. IBERIA er_2026-04-02.0/.1/.2 NO tocado: son 3 billetes reales.

## Lecciones / invariantes nuevas
- **Ritual de cierre AMPLIADO**: toda migración se APLICA a la DB (npx supabase db push) y se verifica el objeto en la DB real, además de commitearse. "push OK" en git ≠ aplicado en DB.
- **Complemento INV-6**: con RLS activo cada operación necesita policy Y grant; sin policy → deny-by-default silencioso aunque exista el grant.
- **Formato de entrega**: prompts a Code en un único bloque copiable, separado de las notas a Eric.

## Tablero abierto (sin construir)
- **Prevención duplicados (sync, egmfin-jobs)**: external_id no estable entre esquemas (hash h_ vs er_ entry_reference) → misma txn entra dos veces. DECISIÓN DE DISEÑO, no parche: reconciliar sin fusionar reales idénticas (trampa Iberia). Pendiente specar.
- **Reglas**: (a) admin ver/editar/borrar; (b) fix motor — _apply_first_matching_rule para en la primera regla; las de tarjeta (prio 10-30, set_category_id NULL) SOMBREAN las de categoría → componer por campo; (c) brittleness PENDING→BOOKED ("CONCEPTO:" vs "CONCEPTO").
- **Drill-down por categoría en Control** (follow-up T-029: hoy es por naturaleza).
- **ZBB plan-based**: replantear budget/planner — plan base de decisiones permanentes; lo mensual = ajustar deltas. Sigue siendo zero-based. Sesión de diseño.

## CABECERA DEL PRÓXIMO ARRANQUE — Módulo Nóminas
- **Bug**: en el Planner los ingresos salen 0 — el planner lee de incomes (VACÍA) mientras Inicio lee de transactions. Fuente inconsistente. (Confirmar fuente exacta con Code.)
- **Módulo**: parser PDF nóminas (egmfin-jobs) → incomes tipado → conciliación con transacción del banco → planner lee incomes. Desbloquea v_median_income_3m.
- **Modelo YA existe**: incomes (mig 04) tiene gross_amount, irpf_withheld, ss_withheld, net_amount, art_7p_exempt_days, art_7p_exempt_amount, type (nomina_mensual/paga_extra/bonus/dietas), employer. + tabla work_abroad_days para 7p.
- **Extracción (decidido)**: las nóminas Nordex son PDF de TEXTO → pdftotext -layout + regex anclado a CÓDIGOS de concepto. NI OCR NI LLM. Fallback: si alguna llega escaneada vía el pipeline (ZIP+JPEG+OCR, como las facturas COBLANSA), leer el .txt del ZIP.
- **Mapeo a incomes** (anclar en códigos):
  - net_amount ← LIQUIDO TOTAL (= "Importe" junto a Cuenta; doble-check)
  - gross_amount ← REM. TOTAL
  - irpf_withheld ← /401 RETENCIÓN A CTA. IRPF (tipo % aparte)
  - ss_withheld ← /350 + /370 + /380 + /SC0
  - date ← PERIODO; employer ← NORDEX ENERGY SPAIN SAU; type ← nomina_mensual
- **7p NO está en la nómina mensual**: se aplica en la renta ANUAL. La granularidad de 7p sale de work_abroad_days (días fuera), flujo aparte.
- **Bonus**: se aísla por su propio código de devengo → incomes tipado bonus. PENDIENTE: subir la nómina de MAYO (~17.600 neto, nómina+bonus) para identificar el código del bonus.
- **Conciliación**: una nómina → uno o varios incomes tipados → conciliado al depósito (cuenta ****4940, regla NORDEX), contado una vez (patrón Pedidos).

## Horizonte
- II Proyecto como cartera multi-proyecto (Maristas + agrícola + negocios). Nota: los PDF COBLANSA del repo son facturas del Maristas, no nóminas.
- Vista patrimonio detalle + evolución (backbone ya existe: account_balances, manual_holdings, stock_options, patrimonio_snapshot). Hogar probable: drill de Inicio o V Análisis. Héroe sigue siendo patrimonio líquido.
- AI Advisor 7p (multi-jurisdicción).

## Vigilar
- Sub-query defensiva de is_direct_charge en Control: deuda menor, simplificar cuando confiemos en el sync DB.
- Pendiente VALIDAR EN USO (migraciones ya aplicadas): desenlazar un cargo + marcar cargo directo (Iberia 3€).
- Iberia er_2026-04-02.0/.1/.2 = 3 billetes reales, no duplicados.
