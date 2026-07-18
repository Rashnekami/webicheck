## Status atual da integração Webi Diagnostic

### Concluído
- **Banco & storage**: `case_id`, `parent_checklist_id`, `revision_number`, `revision_reason`, `service_stage`, `is_current`, `superseded_by_checklist_id`; `checklist_diagnostic_reports`; `webi_integration_tokens` (hash SHA-256, revogação, last_used); bucket privado `webi-diagnostic-reports` com RLS por dono do case ou admin.
- **Endpoints públicos** `/api/public/webi-diagnostic/resolve-checklist` e `/upload-report`: aceitam `checklist_code` com sufixo `-Rn`, retornam `409 CHECKLIST_SUPERSEDED` com `latest_checklist_code`, validam token, magic bytes `%PDF-`, SHA-256, rate limit 30/min por token, exigem revisão atual e dono/admin.
- **UI**:
  - `/integracoes` com geração/rotação/revogação de token e documentação técnica.
  - Painel de revisões com timeline visual (`case-timeline.tsx`) + seção formal de diagnósticos agrupada por etapa (`diagnostics-section.tsx`).
  - Três botões de PDF no painel: **Checklist** (só o PDF desta versão), **Versão completa** (checklist + diagnósticos desta revisão) e **Dossiê completo** (todo o atendimento).
  - Sufixo `-Rn` visível no cabeçalho e no nome de arquivo do `checklist-pdf.tsx` e `instalacao-pdf.tsx`.
  - Página `/validar/:token`: banner de "versão mais recente" quando `is_current=false` e exibição de `checklist_code` no snapshot.
- **Snapshots**: `SnapshotPayload` agora inclui `revision_number`, `checklist_code` e resumo dos diagnósticos ativos. Ao vincular ou revogar um diagnóstico, `regenerateChecklistSnapshot` cria nova versão e marca a anterior como `replaced` com `replaced_by_snapshot_id`.
- **Revogação**: `revokeDiagnosticReport` marca `status=revoked` com `revoked_at`/`revoked_by`, mantém o PDF no storage e dispara regeneração do snapshot.
- **Dashboards**: `dashboard-analytics.ts` e listagem principal deduplicam por `case_id` (contam cada atendimento uma vez).
- **Divergência arquitetural**: documentada em `/integracoes` (TanStack server routes em vez de Edge Function; URL real `https://webicheck.lovable.app/api/public/webi-diagnostic/...`).

### Pendente (fora do escopo desta rodada)
- **Testes automatizados dos 22 cenários** (Vitest + fixtures Supabase). Requer instalar vitest, montar mocks/fixtures da Data API e simular multipart uploads. Recomendado tratar em uma rodada dedicada para não colidir com o app em produção.
