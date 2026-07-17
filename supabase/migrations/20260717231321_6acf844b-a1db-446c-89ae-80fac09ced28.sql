UPDATE public.webi_integration_tokens
SET active = false, revoked_at = now()
WHERE token_hash = '080797d09a53d76aac418a7e72b579a785cdf5aec805cae693f77acb6099eeb2';