ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.announcements.image_url IS 'URL opcional de imagem/GIF exibida no informativo';

NOTIFY pgrst, 'reload schema';