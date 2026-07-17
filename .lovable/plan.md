
## O que já está pronto

**Banco / storage**
- `checklists` com `case_id`, `parent_checklist_id`, `revision_number`, `revision_reason`, `service_stage`, `is_current`, `superseded_by_checklist_id`, `revised_at`, `revised_by` (com backfill dos existentes).
- `checklist_diagnostic_reports` com todos os campos do spec, índices e status active/revoked/replaced.
- `webi_integration_tokens` com hash SHA-256, prefix, scopes, revogação e último uso.
- Bucket privado `webi-diagnostic-reports` com path `{case_id}/{checklist_id}/{report_id}.pdf` e policy de INSERT restrita ao dono do case ou admin.

**Backend**
- Server functions: `createChecklistRevision`, listagem de diagnósticos, timeline consolidada, URL assinada de download.
- Endpoints públicos TanStack `/api/public/webi-diagnostic/resolve-checklist` e `/upload-report` com validação de token, magic bytes `%PDF-`, SHA-256 no servidor, limite de tamanho, rate limit 30/min por token, bloqueio de duplicidade, exigência de `is_current=true`, verificação de dono/admin.
- Fluxo do Agent testado end-to-end (resolve, upload OK, duplicidade, token inválido). Token de sandbox revogado.

**Frontend**
- `/integracoes` para gerar/copiar/revogar chave (mostrada só uma vez).
- Painel de revisões no checklist (`case-revisions-panel`) com modal de motivo, criação de rascunho, timeline, lista de diagnósticos e botão "Dossiê PDF" mesclando via `pdf-lib`.
- `buildChecklistPdfBlob` / `buildInstalacaoPdfBlob` retornando Blob sem forçar download.
- Snapshot imutável (`checklist_document_snapshots`) + link público `/validar/:token` + QR + exportação PNG mantidos.

## O que ainda falta para bater 100% com o spec

### 1. Compatibilidade do endpoint com o spec do Agent
- O spec exige body `{ "checklist_code": "WEBICHECK...-R2" }` aceitando `numero_publico`, `codigo_validacao` e códigos com sufixo `-Rn`; hoje o endpoint só aceita `{ numero_publico | codigo_validacao | case_id }`. Adicionar parser de `checklist_code` (trim, uppercase, split `-R<n>`), resolver a revisão correspondente e:
  - Se o código apontar para revisão antiga com versão mais nova disponível, devolver HTTP 409 `CHECKLIST_SUPERSEDED` com `latest_checklist_code`.
  - Retornar `default_test_stage` derivado de `service_stage` e `diagnostic_count`.
- `upload-report`: aceitar `checklist_code` além de `checklist_id`; devolver `checklist_code` (com `-Rn`) e `revision_number` no payload de resposta.
- Mapear códigos de erro do spec (401/403/404/409/413/415/500) — hoje alguns usam 400.

### 2. Identificação visual da revisão
- Exibir "WEBICHECK...-R{n}" em listagens, detalhe, PDFs e no snapshot.
- Badge "Versão atual" / "Substituída por revisão mais recente" no detalhe do checklist e na página `/validar/:token`; hoje o aviso de supersede existe só dentro do painel autenticado.
- Página pública deve ler `is_current`/`superseded_by_checklist_id` e mostrar banner + botão "Abrir versão mais recente" para o link antigo.

### 3. Seção "Diagnósticos Webi Diagnostic" formal no checklist
- Componente dedicado agrupado por etapa (Antes/Depois/NOC/Adicional) com sessão, versão do Agent, datas, tamanho, início do SHA-256, status, download por URL assinada e botão "Revogar" (admin).
- Timeline visual do atendimento (hoje só existe como dados na server function).

### 4. Botões de PDF pedidos
- "Baixar somente esta versão do checklist" (existe como PDF simples).
- "Baixar PDF completo desta versão" = checklist + fotos + diagnósticos da revisão (parcial: dossiê atual junta tudo do case).
- "Baixar dossiê completo do atendimento" já existe; padronizar rótulo e adicionar capa com número do atendimento + timeline como páginas.

### 5. Snapshots + auditoria por diagnóstico
- Ao vincular/revogar diagnóstico, gerar nova versão em `checklist_document_snapshots` incluindo `report_id`, `session_id`, etapa, sha, tamanho, versão do Agent, datas; marcar snapshot anterior como `replaced` em vez de sobrescrever.

### 6. Revogação de relatório
- UI + server function para admin marcar `status=revoked` (com `revoked_at`/`revoked_by`), removendo o PDF do dossiê corrente mas mantendo o registro. Não excluir do storage.

### 7. Dashboards agrupam por atendimento
- Ajustar contagens em `dashboard-analytics.ts` para deduplicar por `case_id` (hoje conta cada revisão).

### 8. Testes automatizados
- Nada existe em `src/**/__tests__` para a integração. Cobrir os 22 cenários listados no spec (chave válida/ inválida, checklist inexistente/rascunho, técnico de outro checklist, PDF inválido, arquivo grande, hash divergente, upload OK, duplicidade, criação de revisão, preservação da anterior, uma única atual, bloqueio em versão antiga, upload pós-troca, múltiplos retestes, timeline, URL assinada, merge de PDFs preservando páginas, revogação sem exclusão, link antigo → atual, dashboard sem duplicar).

### 9. Divergência arquitetural documentada
- Spec pede Supabase Edge Function `webi-diagnostic`; o projeto usa TanStack server routes (padrão da stack). Manter TanStack e documentar a URL real (`https://webicheck.lovable.app/api/public/webi-diagnostic/...`) na tela de Integrações e no README do Agent.

## Sequência sugerida (quando você aprovar)

1. Endpoints: parse de `checklist_code`, resposta com `-Rn`, 409 `CHECKLIST_SUPERSEDED`, tabela de códigos HTTP.
2. Link público: banner + botão "Abrir versão mais recente" quando `is_current=false`.
3. Componente "Diagnósticos" no detalhe do checklist (agrupado por etapa) + timeline visual + revogar.
4. Numeração `-Rn` visível em listagens, PDFs, snapshot.
5. Snapshots por diagnóstico (nova versão + `replaced`).
6. Dashboard por `case_id`.
7. Testes automatizados dos 22 cenários (Vitest).
8. Documentar variáveis (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) e URLs finais na tela de Integrações.
