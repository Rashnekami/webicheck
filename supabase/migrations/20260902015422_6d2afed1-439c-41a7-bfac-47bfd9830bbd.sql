ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_email_set_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_contact_email_unique
  ON public.profiles (lower(contact_email)) WHERE contact_email IS NOT NULL;

UPDATE public.provider_login_accounts a
SET login = v.new_login, updated_at = now()
FROM (VALUES
  ('alexandre','alexandre.crc'),
  ('nelisson','nelisson.crc'),
  ('eduarda','eduarda.crc'),
  ('yasmin','yasmin.crc'),
  ('ana.julia','ana.julia.crc'),
  ('kelvin','kelvin.crc'),
  ('nicoly','nicoly.crc'),
  ('gabriel','gabriel.crc'),
  ('gustavo','gustavo.crc'),
  ('brayan.henrique','brayan.crc'),
  ('maikel','maikel.crc'),
  ('viktor','viktor.crc'),
  ('guilherme','guilherme.noc'),
  ('giselle','giselle.agenda'),
  ('lavinia','lavinia.agenda'),
  ('hallika','hallika.intel')
) AS v(old_login, new_login)
WHERE a.login = v.old_login
  AND NOT EXISTS (
    SELECT 1 FROM public.provider_login_accounts b
    WHERE b.provider_id = a.provider_id AND b.login = v.new_login
  );