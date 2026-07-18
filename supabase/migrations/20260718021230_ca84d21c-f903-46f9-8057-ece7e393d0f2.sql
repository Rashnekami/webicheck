-- Phase 1: enforce token scopes with both resolve and upload by default,
-- and retroactively grant existing tokens both scopes.
ALTER TABLE public.webi_integration_tokens
  ALTER COLUMN scopes SET DEFAULT ARRAY['diagnostic:resolve','diagnostic:upload']::text[];

UPDATE public.webi_integration_tokens
   SET scopes = ARRAY(
     SELECT DISTINCT unnest(
       COALESCE(scopes, ARRAY[]::text[])
       || ARRAY['diagnostic:resolve','diagnostic:upload']::text[]
     )
   )
 WHERE NOT (scopes @> ARRAY['diagnostic:resolve','diagnostic:upload']::text[]);
