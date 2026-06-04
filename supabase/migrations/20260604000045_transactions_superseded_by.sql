-- mig-45 · transactions.superseded_by (T-036)
--
-- Neutralización reversible de duplicados.
-- NULL  = fila activa (estado normal de toda transacción).
-- uuid  = esta fila es un duplicado de la referenciada; excluida de vistas y sumas.
--
-- Causa raíz: dos esquemas de external_id coexistían (h_<md5> hash-based y
-- er_YYYY-MM-DD.N posicional) que no se deduplicaban entre sí → P-019.
-- Para deshacer: UPDATE transactions SET superseded_by = NULL WHERE id = <h_id>.

ALTER TABLE public.transactions
  ADD COLUMN superseded_by uuid NULL
    REFERENCES public.transactions(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.transactions.superseded_by IS
  'NULL = fila activa. uuid = duplicado de esa txn (no sumar, no mostrar). Reversible.';
