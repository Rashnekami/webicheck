
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS troca_realizada boolean,
  ADD COLUMN IF NOT EXISTS modelo_ont_retirada text,
  ADD COLUMN IF NOT EXISTS serial_ont_retirada text,
  ADD COLUMN IF NOT EXISTS modelo_ont_instalada text,
  ADD COLUMN IF NOT EXISTS serial_ont_instalada text;
