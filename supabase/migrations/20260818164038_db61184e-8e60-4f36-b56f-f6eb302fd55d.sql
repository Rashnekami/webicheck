REVOKE ALL ON FUNCTION public.consume_whistleblower_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_whistleblower_rate_limit(text, text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.has_whistleblower_access(uuid) FROM PUBLIC, anon;