-- Apply before deploying the frontend. All reads still run under caller RLS.
CREATE INDEX IF NOT EXISTS checklists_current_provider_created_id_idx
  ON public.checklists (provider_id, created_at DESC, id DESC)
  WHERE is_current = true;
CREATE INDEX IF NOT EXISTS checklists_current_technician_created_id_idx
  ON public.checklists (tecnico_id, created_at DESC, id DESC)
  WHERE is_current = true;
CREATE INDEX IF NOT EXISTS checklists_current_provider_finalized_idx
  ON public.checklists (provider_id, finalizado_em DESC, id DESC)
  WHERE is_current = true AND status = 'finalizado';

CREATE OR REPLACE FUNCTION public.list_checklist_summaries(
  _mine boolean DEFAULT true,
  _status text DEFAULT 'todos',
  _search text DEFAULT ''
)
RETURNS TABLE (
  id uuid, tecnico_id uuid, tecnico_nome text, status text, tipo text,
  os text, cliente text, cidade text, serial text, codigo_validacao text,
  numero_publico text, exchange_ticket_code text, cto_codigo text,
  rmap_code text, review_status text, locked_for_rework boolean,
  revision_number integer, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT c.id, c.tecnico_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Técnico não identificado'),
    c.status::text, c.tipo::text, c.os, c.cliente, c.cidade, c.serial,
    c.codigo_validacao, c.numero_publico, c.exchange_ticket_code,
    coalesce(nullif(c.dados #>> '{identificacao,cto_codigo}', ''),
             c.dados #>> '{contexto,cto_codigo}'),
    c.rmap_code, c.review_status, c.locked_for_rework, c.revision_number,
    c.created_at, c.updated_at
  FROM public.checklists c
  LEFT JOIN public.profiles p ON p.id = c.tecnico_id
  WHERE c.is_current = true
    AND (NOT _mine OR c.tecnico_id = (SELECT auth.uid()))
    AND (_status = 'todos' OR c.status::text = _status)
    AND (
      btrim(coalesce(_search, '')) = '' OR
      EXISTS (
        SELECT 1 FROM unnest(ARRAY[
          p.full_name, c.os, c.cliente, c.cidade, c.serial, c.codigo_validacao,
          c.numero_publico, c.exchange_ticket_code, c.rmap_code,
          c.dados #>> '{identificacao,cto_codigo}', c.dados #>> '{contexto,cto_codigo}'
        ]) AS value
        WHERE strpos(lower(value), lower(btrim(_search))) > 0
      )
    );
$$;

REVOKE ALL ON FUNCTION public.list_checklist_summaries(boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_checklist_summaries(boolean, text, text) TO authenticated;
