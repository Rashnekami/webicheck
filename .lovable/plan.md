# Pendências restantes da integração Webi Diagnostic

Comparando o spec original com o que já está no projeto (ver `.lovable/plan.md`), estes itens ainda não foram entregues:

## 1. Seção formal "Diagnósticos Webi Diagnostic" no detalhe do checklist
Hoje existe uma lista simples dentro do `case-revisions-panel`. Falta um componente dedicado, agrupado por etapa (Antes / Depois / NOC / Adicional), mostrando: sessão, versão do Agent, datas, tamanho, início do SHA-256, status, download por URL assinada e (admin) botão Revogar. Também falta uma timeline visual do atendimento — os dados já vêm da server function, mas não são renderizados como timeline.

## 2. Botões de PDF conforme spec
- "Baixar somente esta versão do checklist" (só o checklist da revisão atual).
- "Baixar PDF completo desta versão" = checklist + fotos + diagnósticos **apenas desta revisão** (hoje o dossiê junta tudo do case).
- "Baixar dossiê completo do atendimento" já existe; padronizar o rótulo e adicionar capa com número do atendimento + timeline como páginas.

## 3. Snapshots versionados por diagnóstico
Ao vincular ou revogar um diagnóstico, gerar uma nova linha em `checklist_document_snapshots` incluindo `report_id`, `session_id`, etapa, sha, tamanho, versão do Agent, datas — e marcar o snapshot anterior como `replaced` em vez de sobrescrever.

## 4. Numeração `-Rn` visível em todos os pontos
Já aparece na listagem e nas APIs. Falta em: cabeçalho do PDF do checklist, PDF de instalação, dossiê, snapshot público (`/validar/:token`) e no cabeçalho do detalhe do checklist.

## 5. Testes automatizados
Nada em `src/**/__tests__` para a integração. O spec pede cobertura dos 22 cenários (chave válida/inválida, checklist inexistente/rascunho, técnico de outro checklist, PDF inválido, arquivo grande, hash divergente, upload OK, duplicidade, criação de revisão, preservação da anterior, única atual, bloqueio em versão antiga, upload pós-troca, múltiplos retestes, timeline, URL assinada, merge preservando páginas, revogação sem exclusão, link antigo → atual, dashboard sem duplicar).

## 6. Documentação da divergência arquitetural
Spec pede Supabase Edge Function `webi-diagnostic`; usamos TanStack server routes. Já documentei parcialmente em `/integracoes`; falta um README para o Agent com a URL final (`https://webicheck.lovable.app/api/public/webi-diagnostic/...`) e as variáveis esperadas.

## Já concluído (não precisa refazer)
- Banco, storage, tokens com hash, endpoints públicos com rate limit e magic bytes.
- Criação de revisões, timeline (dados), URL assinada, revogação backend.
- `-Rn` na listagem, nas APIs, banner "versão atual" no link público, dedupe no dashboard.
- Dossiê PDF consolidado (via `pdf-lib`), snapshots imutáveis do checklist, QR e PNG.
- Correção da assinatura por técnico dono do checklist.

## Sequência sugerida
1. Componente "Diagnósticos" agrupado por etapa + timeline visual + revogar (frontend).
2. Dois botões de PDF adicionais (só-checklist, versão-completa-desta-revisão).
3. `-Rn` no cabeçalho de PDFs, dossiê, snapshot público e detalhe.
4. Snapshots versionados por diagnóstico (migration curta + hook nos endpoints).
5. Testes Vitest dos 22 cenários.
6. README do Agent com URL/variáveis finais.

Quer que eu comece pelo item 1 (seção formal de Diagnósticos + timeline visual), ou prefere outra ordem?
