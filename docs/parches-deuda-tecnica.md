# Parches activos y deuda técnica EGMFin

Cada entrada describe un parche o caso especial que NO debe romperse en migraciones futuras.
Antes de tocar las vistas/tablas referenciadas, leer este archivo.

---

## P-001 · Roboadvisor sin cotización pública
- **Holding:** "MyInvestor Robot Advisor (perfil agregado)"
- **Cuenta:** MyInvestor común
- **ID:** d4a7df32-4259-4be0-a077-3f214ca5bc5a
- **Problema:** no tiene ticker ni ISIN porque es una cesta dinámica gestionada por MyInvestor.
- **Solución activa:** valor real cargado en `holdings.avg_price_eur`. La vista `holdings_valued` (migración 15) hace fallback a `avg_price_eur` cuando no hay precio en `holding_prices`.
- **Mantenimiento:** actualizar `avg_price_eur` mensualmente con el valor del extracto MyInvestor.
- **Riesgo si se toca:** cualquier cambio en `holdings_valued` que elimine el tercer `WHEN` del CASE → este holding pasa a valer NULL y desaparecen ~14k€ del patrimonio.

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

## P-005 · UNIQUE en holding_prices con NULLs (PENDIENTE)
- **Tabla:** `holding_prices`
- **Problema:** la constraint `UNIQUE(ticker, isin, date)` no protege cuando ticker o isin son NULL → permite duplicados.
- **Solución pendiente:** migración futura con `UNIQUE INDEX (COALESCE(ticker,''), COALESCE(isin,''), date)`.
- **Workaround actual:** el script `update_prices.py` borra antes de insertar (esto se aplicó en algún momento, verificar antes de tocar).
- **Riesgo:** ejecutar dos veces el script en el mismo día con datos diferentes → la vista coge el último insertado (puede no ser el correcto).

---

## Antes de cualquier migración nueva
1. Leer este archivo entero.
2. Si la migración toca alguna vista/tabla listada, releer la entrada P-XXX correspondiente.
3. Después de aplicar, verificar `SELECT * FROM patrimonio_neto;` y comparar con el último valor conocido. Cualquier salto > 1.000€ requiere explicación.
