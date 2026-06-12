-- titular: eje de propiedad/destino (eric | ana | comun | leo | biel)
-- Distinto de visibility (muro de privacidad). La herencia/sucesión se modela
-- reasignando titular (p. ej. comun/eric -> leo|biel) en el futuro.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS titular text;

UPDATE accounts SET titular = CASE
  WHEN name ILIKE '%Leo%'          THEN 'leo'
  WHEN name ILIKE '%Biel%'         THEN 'biel'
  WHEN visibility = 'privada_eric' THEN 'eric'
  WHEN visibility = 'privada_ana'  THEN 'ana'
  WHEN visibility = 'compartida'   THEN 'comun'
END
WHERE titular IS NULL;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_titular_check CHECK (titular IN ('eric','ana','comun','leo','biel'));

ALTER TABLE accounts ALTER COLUMN titular SET NOT NULL;
