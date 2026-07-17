# Integração WebiCheck ↔ Webi Diagnostic + Revisões

Escopo grande. Vou entregar em 4 fases para você validar entre elas, tudo sobre o projeto atual (sem recriar nada, sem tocar visual/PDF existentes).

## Fase 1 — Banco (migrations, sem quebrar dados)

**Alterações em `checklists`:**
- `case_id UUID`, `parent_checklist_id UUID`, `revision_number INT default 1`, `revision_reason TEXT`, `revision_notes TEXT`, `service_stage TEXT default 'initial'`, `is_current BOOLEAN default true`, `superseded_by_checklist_id UUID`, `revised_at TIMESTAMPTZ`, `revised_by UUID`.
- Backfill: `case_id = id`, `revision_number = 1`, `service_stage = 'initial'`, `is_current = true` para linhas existentes.
- Índice único parcial: só 1 `is_current = true` por `case_id`.
- CHECK em `service_stage` (initial | pre_change | post_ont_change | noc_retest | additional_test).

**Nova tabela `checklist_diagnostic_reports`** com todos os campos pedidos, índices, UNIQUE(`case_id`, `diagnostic_session_id`) impedindo dupla anexação. RLS: técnico dono ou admin. GRANTs padrão.

**Nova tabela `webi_integration_tokens`**: hash SHA-256, prefix visível, escopos, revogação. RLS: usuário dono / admin.

**Storage:** bucket privado `webi-diagnostic-reports` via tool (não SQL). Path `{case_id}/{checklist_id}/{report_id}.pdf`. Policies para técnico dono + admin + service_role.

## Fase 2 — Backend

**Edge function `webi-diagnostic`** (mantida como única edge function nova; o restante do app usa `createServerFn`. Justificativa: chamada externa de app desktop precisa de URL estável e header customizado, e o WebiCheck já usa edge functions previamente).
Correção: usar TanStack **server route público** em `src/routes/api/public/webi-diagnostic/{resolve-checklist,upload-report}.ts` — sem CORS de navegador (é agente desktop), auth via header `X-Webi-Integration-Key`, valida hash do token contra `webi_integration_tokens`, atualiza `last_used_at`.

Endpoints exatamente como especificado (resolve-checklist / upload-report), com todos os validators (PDF mágico `%PDF-`, MIME, SHA-256 recalculado, tamanho, duplicidade, rate limit em memória por token, sanitização de nome).

**Server functions internas:**
- `createChecklistRevision({ checklistId, reason, stage, notes })` — copia campos permitidos, seta `parent_checklist_id`, incrementa `revision_number`, marca anterior como `is_current=false` + `superseded_by`, começa como rascunho.
- `listDiagnosticReports`, `getDiagnosticDownloadUrl`, `revokeDiagnosticReport`.
- `listCaseTimeline({ caseId })` — retorna revisões + diagnósticos + eventos em ordem cronológica.
- `listIntegrationTokens`, `createIntegrationToken`, `revokeIntegrationToken`.

**Snapshot público** existente (`ensureChecklistSnapshot`) passa a incluir os diagnósticos anexados no payload documental; snapshot antigo vira `replaced` (comportamento atual preservado). Página `/validar/:token` mostra aviso "Existe versão mais recente" quando `superseded_by_checklist_id` estiver setado, com botão para abrir o link mais novo.

## Fase 3 — Frontend

**Novas telas / componentes:**
- `Configurações → Integrações → Webi Diagnostic` (`/_authenticated/integracoes.tsx`): gerar / listar / revogar tokens. Token completo mostrado uma única vez em modal com botão copiar.
- Em `checklists.$id.tsx`, quando `status === 'finalizado'`:
  - Botão **"Criar revisão / registrar pós-troca"** com modal (motivo + observação + etapa).
  - Seção **"Diagnósticos Webi Diagnostic"** agrupada por etapa, com metadados, download (URL assinada), revogar (admin).
  - **Linha do tempo** do atendimento (todas as revisões do `case_id` + diagnósticos).
  - Novos botões de PDF: *baixar esta versão*, *PDF completo desta versão* (checklist + fotos + diagnósticos via pdf-lib), *dossiê do atendimento* (todas as revisões em ordem).
  - Ao carregar uma revisão não-atual, banner "Versão anterior — abrir versão atual".

**PDF refactor:** `generateChecklistPdf` e `generateInstalacaoPdf` ganham modo `returnBlob: true` (não dispara download). Combinação via `pdf-lib` (`bun add pdf-lib`) preservando páginas nativas dos PDFs do Diagnostic.

**Listagem / dashboard:** agrupar por `case_id` para métricas (uma visita por atendimento, não por revisão). Cada linha da lista mostra badge da versão atual (`-R2` etc.).

**Página pública `/validar/:token`** ganha aviso + botão quando substituída, e passa a mostrar seção de diagnósticos + linha do tempo.

## Fase 4 — Testes e entrega

Testes com `bunx vitest run` cobrindo os cenários listados (token válido/inválido, PDF inválido, hash divergente, duplicidade, revisão preservando anterior, único `is_current`, bloqueio de upload em versão antiga, timeline, combinação de PDFs preservando páginas).

**Entrega:**
- Lista de migrations, arquivos criados/alterados.
- URLs dos endpoints: `https://webicheck.lovable.app/api/public/webi-diagnostic/resolve-checklist` e `.../upload-report`.
- Exemplos de request/response.
- Variáveis de ambiente (nenhuma nova pública; token é dado pelo próprio app).
- Nenhum segredo no frontend, nenhum SUPABASE_SERVICE_ROLE_KEY exposto.

## Ajustes que preciso confirmar

1. **Endpoints como TanStack server routes públicos** em `/api/public/webi-diagnostic/*` em vez de nova Supabase Edge Function — é o padrão desta stack e evita criar edge function nova. Funciona igual para o app desktop (mesma URL estável `webicheck.lovable.app`). OK?
2. **Rate limit**: sem infra de rate limit nativa; posso implementar contador em memória por instância (best-effort) ou pular. OK best-effort?
3. **`pdf-lib`** como dependência nova para combinar PDFs. OK?
4. Posso executar as **4 fases seguidas sem parar** ou prefere validar entre cada uma?
