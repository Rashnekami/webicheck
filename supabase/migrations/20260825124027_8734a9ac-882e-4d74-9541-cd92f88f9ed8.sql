ALTER TABLE public.technical_employee_reviews
  ADD COLUMN IF NOT EXISTS scale_version integer NOT NULL DEFAULT 1;

NOTIFY pgrst, 'reload schema';