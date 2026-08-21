-- Escala 1–10 nas avaliações novas e evidências externas (print, foto, documento).
-- Totalmente aditiva. Avaliações existentes continuam na escala 1–5 intactas:
-- scale_version = 1 é o default, e só avaliações criadas a partir de agora
-- nascem com 2. Nenhum dado é convertido.

ALTER TABLE public.technical_employee_reviews
  ADD COLUMN IF NOT EXISTS scale_version smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.technical_employee_reviews.scale_version IS
  '1 = escala 1-5 (catálogo original, 23 itens). 2 = escala 1-10 (catálogo v2, 35 itens). Nunca converter: a escala é a da época da avaliação.';

ALTER TABLE public.technical_employee_review_items
  ADD COLUMN IF NOT EXISTS scale_version smallint NOT NULL DEFAULT 1;

-- Evidências externas: o print do Zumme, a foto do WhatsApp, o documento que
-- não nasceu de um checklist. A tabela já existia com checklist_id opcional;
-- faltava onde guardar o arquivo em si.
ALTER TABLE public.technical_employee_review_evidences
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS occurred_on date;

-- Bucket privado das evidências de avaliação. Acesso só por URL assinada
-- gerada no servidor depois de checar owns_technical_review.
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-evidences', 'review-evidences', false)
ON CONFLICT (id) DO NOTHING;
