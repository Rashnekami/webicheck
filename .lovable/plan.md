# Plano — Análise por IA no Checklist de ONT

## 1. Remover o módulo "Diagnóstico Inteligente" (mantendo tabelas)

Apagar do frontend/lib:
- `src/routes/_authenticated/diagnostico-inteligente.tsx`
- `src/components/smart-diagnostic/` (pasta inteira)
- `src/lib/smart-diagnostic.ts`
- `src/lib/smart-diagnostic-ai.ts`
- `src/lib/smart-diagnostic-ai.functions.ts`
- `src/lib/smart-diagnostic-ai.server.ts`
- `src/lib/__tests__/smart-diagnostic*.test.ts`
- Endpoints públicos usados só por esse fluxo (`src/routes/api/public/webi-diagnostic/*` avaliados um a um — remover os que só serviam ao módulo antigo; preservar os usados pelo agent externo).

Remover links/entradas no `painel.tsx` e qualquer import residual.  
Não mexer em `checklist_diagnostic_reports` nem nas tabelas relacionadas (preservadas por sua escolha).

## 2. Novo campo "Tipo de manutenção" no checklist de Validação de ONT

Adicionar seletor no formulário (topo do checklist) com estas opções:
- Corretiva — falha reportada pelo cliente
- Preventiva — inspeção programada
- Troca de ONT — substituição de equipamento
- Reincidência — retorno ao mesmo cliente
- Garantia — equipamento novo com defeito
- Outro (texto livre)

Persistir em `checklists.dados.tipo_manutencao` (JSONB, sem migration). Exibir no PDF e no documento visual.

## 3. Botão "Solicitar análise da IA" no checklist de Validação

- Aparece só quando o checklist está preenchido (todas as seções obrigatórias respondidas) e antes/depois de finalizar.
- Chama nova server function `requestOntChecklistAiAnalysis` (`src/lib/ont-checklist-ai.functions.ts`) protegida por `requireSupabaseAuth`.
- Usa Lovable AI Gateway (`google/gemini-3.6-flash`) via `createLovableAiGatewayProvider` + `generateText` com `Output.object` (schema estrito e pequeno).
- Envia payload sanitizado: sintomas, validação física, testes, resultado final, tipo de manutenção, dados de hardware (modelo/serial) — sem PII do cliente (nome, endereço, telefone).
- Retorna e persiste em `checklists.dados.ai_analysis`:
  - `diagnostico_provavel` + `causa_raiz`
  - `recomendacao` (`trocar_ont` | `escalar_noc` | `orientar_cliente` | `retornar_ao_local`)
  - `justificativa`
  - `inconsistencias[]` (perguntas contraditórias ou faltantes detectadas)
  - `resumo_tecnico` (2-3 linhas)
  - `gerado_em`, `modelo_ia`

## 4. UI da análise

Novo card `OntAiAnalysisCard` em `src/components/checklist/`:
- Botão "Solicitar análise da IA" (loading spinner, desabilitado enquanto processa).
- Exibe resultado formatado (badges para recomendação, lista de inconsistências, resumo).
- Botão "Gerar novamente" para refazer.
- Aviso: "Análise auxiliar — decisão final é do técnico/NOC."

## 5. Incorporar no PDF

Atualizar `src/components/checklist/checklist-pdf.tsx` e `checklist-document-view.tsx`:
- Nova seção "Análise assistida por IA" ao final, quando `ai_analysis` existir.
- Inclui tipo de manutenção no cabeçalho do PDF.

## 6. Testes e verificação

- Typecheck (`tsgo --noEmit`).
- Remover imports órfãos.
- Teste manual: preencher um checklist de validação, escolher tipo de manutenção, solicitar análise, verificar persistência e PDF.

## Detalhes técnicos

- Sem migrations: reaproveitamos o JSONB `dados`.
- `LOVABLE_API_KEY` já existe (ai-gateway.server.ts em uso).
- Rota `/diagnostico-inteligente` deixa de existir; qualquer link antigo redireciona ao painel.
- Endpoints `webi-diagnostic/*` que ficarem sem consumidor (do módulo removido) serão apagados; os que atendem o agent externo (`device-start`, `device-token`, `resolve-checklist`, `upload-report`, `my-checklists`) permanecem.

Confirma que posso remover também os endpoints `webi-diagnostic/*` que só atendiam ao módulo antigo, ou prefere que eu preserve todos por segurança?