-- ============================================================
-- MIGRACIÓN 51: PARCHE DATOS — nature=transferencia (Feb+Abr)
-- y reglas de clasificación Ana/Biel/Leo
-- ============================================================

-- 1) 6 transacciones Leo/Biel (Feb + Abr-1 + Abr-30) → transferencia
UPDATE transactions SET nature = 'transferencia'
WHERE id IN (
  '30238001-0ef8-4bc7-8d53-c22e0fc68c4b', '1eef2ff8-8ac6-4eff-b9ad-7c9c338277a8',  -- Feb Leo, Biel
  '73a90253-b1f5-4c4e-be97-0034643aa237', '203065fb-5c30-4482-bcb7-544c50b0636f',  -- Abr-1 Leo, Biel
  '75ddcdd6-8d4a-4455-a7ff-4a5aea53e535', '8ae4c838-a01b-42d3-b73d-4a66dcb48231'   -- Abr-30 Biel, Leo
) AND nature IS DISTINCT FROM 'transferencia';

-- 2) Regla Ana: fijo_recurrente → transferencia (era la causa de la deriva en Flujo)
UPDATE classification_rules
SET set_nature = 'transferencia', updated_at = now()
WHERE match_field = 'description'
  AND match_value = 'TRANSFERENCIA DE ANA IBANEZ ARRIETA'
  AND set_nature = 'fijo_recurrente';

-- 3) Regla Biel: inversion → transferencia + match_value más robusto (sin los dos puntos finales)
UPDATE classification_rules
SET set_nature = 'transferencia',
    match_value = 'TRANSFERENCIA A FAVOR DE Biel',
    updated_at  = now()
WHERE match_field  = 'description'
  AND match_value  LIKE 'TRANSFERENCIA A FAVOR DE Biel%'
  AND set_nature   = 'inversion';

-- 4) Regla Leo: nueva (solo existía la de Biel)
INSERT INTO classification_rules (priority, match_field, match_operator, match_value, set_nature, set_category_id)
SELECT
  100,
  'description',
  'contains',
  'TRANSFERENCIA A FAVOR DE Leo',
  'transferencia',
  (SELECT id FROM categories WHERE name = 'Aportación cuenta de ahorro')
WHERE NOT EXISTS (
  SELECT 1 FROM classification_rules
  WHERE match_value = 'TRANSFERENCIA A FAVOR DE Leo'
);
