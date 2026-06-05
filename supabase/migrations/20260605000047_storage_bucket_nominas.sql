-- ============================================================
-- Migración 47 — Bucket privado 'nominas' + policies Storage
-- 05 jun 2026
--
-- Crea el bucket privado donde el worker parse_nominas.py (service_role)
-- deposita / lee los PDFs de nómina.
--
-- El worker usa service_role → bypassa RLS de Storage totalmente.
-- Las policies son higiene para subidas futuras desde la app (authenticated).
-- Subida manual desde dashboard de Supabase → service_role, también bypassa.
-- ============================================================

-- ── 1. Bucket privado ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nominas',
  'nominas',
  false,
  52428800,                      -- 50 MB por archivo
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;


-- ── 2. Policies owner-only (authenticated) ───────────────────
-- Archivos deben subirse bajo la ruta {uid}/filename.pdf.
-- El campo owner (uuid) se setea automáticamente al auth.uid()
-- del usuario que hace el upload vía la app.

-- SELECT: solo el dueño del objeto
CREATE POLICY "nominas_owner_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'nominas'
  AND owner = auth.uid()
);

-- INSERT: solo puede subir el propio usuario (owner se settea al uid)
CREATE POLICY "nominas_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nominas'
  AND owner = auth.uid()
);
