# Parches activos y deuda técnica EGMFin

Cada entrada describe un parche o caso especial que NO debe romperse en migraciones futuras.
Antes de tocar las vistas/tablas referenciadas, leer este archivo.

---

## P-001 · Roboadvisor sin cotización pública — ✅ RESUELTO (2026-04-27, migración 20)
- **Solución aplicada:** registro migrado desde `holdings.avg_price_eur` a tabla dedicada `manual_holdings`. La vista `account_balances_full` suma `manual_holdings.current_value_eur` directamente.
- **Fallback eliminado:** `holdings_valued` ya no tiene el tercer `WHEN avg_price_eur` en el CASE. Si se cuela un holding sin precio, devuelve NULL (correcto).
- **Mantenimiento:** actualizar `manual_holdings.current_value_eur` mensualmente con el valor del extracto MyInvestor vía UPDATE directo en Supabase.

## P-002 · Tarjetas de crédito invierten signo
- **Tabla afectada:** vista `account_balances_full`
- **Lógica:** para `type = 'card'`, multiplica el saldo por -1 (migración 14).
- **Razón:** convención EGMFin: en tarjetas, los gastos vienen como positivos en `transactions.amount`. El saldo bruto representa deuda, debe restar de líquidos.
- **Riesgo si se toca:** sumar saldo de tarjeta como activo.

## P-003 · Hipoteca Maristas como deuda proyectada
- **Tabla:** `liabilities`
- **Registro:** "Hipoteca Maristas", status = 'proyectada', current_balance = 416.640€.
- **Razón:** aún no firmada. Se cuenta en `patrimonio_neto_si_firmara_hoy` pero no en `patrimonio_neto_actual`.
- **Mantenimiento:** al firmar escritura → cambiar status a 'activa' y ajustar current_balance al principal real desembolsado.

## P-004 · Asset Maristas en construcción
- **Tabla:** `assets`
- **Registro:** "Apartamento Residencial Maristas", current_value = 143.370€.
- **Razón:** suma de pagos a cuenta entregados a COBLANSA, no precio total.
- **Mantenimiento:** al firmar escritura → actualizar current_value al precio total contractual (509.100€) o tasación.

## P-005 · UNIQUE en holding_prices con NULLs — ✅ RESUELTO (2026-04-27, migración 18)
- **Solución aplicada:** DROP de la constraint original + `CREATE UNIQUE INDEX holding_prices_unique_idx ON holding_prices (COALESCE(ticker,''), COALESCE(isin,''), date)`.
- **Script actualizado:** `update_prices.py` hace DELETE + INSERT en lugar de upsert, eliminando dependencia de la constraint como mecanismo de deduplicación.

## P-006 · Precio NDX1 en holding_prices sin holding asociado
- **Tabla:** `holding_prices`
- **Registro:** ticker = 'NDX1.DE', isin = NULL (migración 16).
- **Razón:** `stock_options_valued` necesita el precio de NDX1 vía `holding_prices`, pero las stock options no son holdings. Se usa la misma tabla como fuente de precios genérica.
- **Mantenimiento:** `get_unique_tickers()` ya incluye los tickers de `stock_options`, por lo que NDX1.DE se actualiza automáticamente cada vez que corre `update_prices.py`. El precio manual insertado en migración 16 fue machacado en la primera ejecución posterior del script.
- **Riesgo si se toca:** si se limpia `holding_prices` filtrando por `account_id IS NOT NULL` o similar, este precio desaparece y `stock_options_valued` devuelve NULL en `current_price_eur`.

## P-008 · holdings_valued hace match por ticker primero, ISIN como fallback
- **Vista afectada:** `holdings_valued`
- **Lógica (migración 19):** si el holding tiene ticker, busca precio en `holding_prices` por ticker (ignorando ISIN). Solo si el holding no tiene ticker busca por ISIN. Esto permite que BRK.B de DeGiro y BRK.B de IBKR compartan el mismo precio aunque tengan ISINs distintos o NULL.
- **Nota (migración 20):** el fallback a `avg_price_eur` fue eliminado. `holdings_valued` ya no tiene el tercer `WHEN` del CASE. Activos sin cotización deben estar en `manual_holdings`, no en `holdings`.
- **Mantenimiento:** `holding_prices` debe tener exactamente 1 fila por (ticker, date) para tickers conocidos. Garantizado por migración 18 + patrón DELETE+INSERT en `update_prices.py`.
- **Riesgo si se toca:** si `holdings_valued` vuelve al match por `(ticker, isin)` exacto, holdings con ISIN no encontrarán el precio (almacenado sin ISIN) y `current_value_eur` será NULL.

## P-007 · account_balances_full debe exponer is_active y sort_order
- **Tabla afectada:** vista `account_balances_full`
- **Razón:** la vista la consume `app/cuentas/page.tsx` con `.eq('is_active', true).order('sort_order')`. Si se elimina cualquiera de las dos columnas en una migración futura, PostgREST no falla pero devuelve 0 filas y el listado por clases aparece a 0,00 €.
- **Mantenimiento:** cualquier migración que recree `account_balances_full` debe seguir incluyendo `a.is_active` y `a.sort_order` en el SELECT.
- **Riesgo si se toca:** listado de clases vacío silenciosamente; PatrimonioNetoCard sigue mostrando el total correcto porque lee de `patrimonio_neto` directamente.

---

## Antes de cualquier migración nueva
1. Leer este archivo entero.
2. Si la migración toca alguna vista/tabla listada, releer la entrada P-XXX correspondiente.
3. Después de aplicar, verificar `SELECT * FROM patrimonio_neto;` y comparar con el último valor conocido. Cualquier salto > 1.000€ requiere explicación.
