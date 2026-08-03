-- Permite anexar imagem/gif animado ao informativo (URL externa — sem
-- upload de arquivo, mais simples e sem custo de storage extra).
alter table public.announcements add column if not exists image_url text;
