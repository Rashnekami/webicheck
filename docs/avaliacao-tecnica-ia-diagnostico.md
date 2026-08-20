# Remodelagem da Avaliação Técnica com Histórico Automático por IA
## Diagnóstico técnico — pré-implementação

Branch: `feat/avaliacao-tecnica-ia-v2` (base: `feat/auth-hardening-v2-2026-07-28`)
Data: 20/08/2026
Status: **aguardando autorização — nenhuma migration aplicada, nenhum código de produção alterado**

---

## 1. O que já existe e pode ser reutilizado

### 1.1 Aproveitamento integral (não mexer)

| Recurso | Onde | Observação |
|---|---|---|
| Autenticação / sessão | `requireSupabaseAuth` (middleware) | Todas as server functions novas usam o mesmo middleware |
| Isolamento por provedor | `current_provider_id()` | Já usado em todas as policies do módulo |
| Papéis | `app_role` (+ `rh` add. em 18/08) | Nada a criar |
| Cliente privilegiado | `supabaseAdmin` (`client.server.ts`) | Necessário: ver 1.4 |
| Gateway de IA | `ai-providers.server.ts` | Cascata de 5 provedores + `parseAiJson` tolerante |
| Design system | shadcn/ui do projeto | Sem componente novo de base |

### 1.2 Módulo de Avaliação Técnica — 8 tabelas já existentes

Migration `20260818131104` + `20260819103000`:

- `technical_feedback_access` — concessão (provider_id, user_id)
- `technical_employee_reviews` — cabeçalho, 6 notas por grupo + `final_score`, PDI legado, `status`, `archived_at`
- `technical_employee_review_items` — item a item, `UNIQUE (review_id, item_key)`, `score integer`, `is_not_applicable`
- `technical_employee_review_evidences` — evidência com FK opcional para `checklists`
- `technical_employee_review_ai` — **histórico de saídas de IA com `input_snapshot`, `model`, `analysis_type`**
- `technical_employee_review_followups`
- `technical_employee_review_meetings` — + `feedback_realized`, `agreement_status`, `next_review_date`
- `technical_employee_review_audit` — auditoria de ação
- `technical_employee_notes` — anotações mensais (RLS só do autor)
- `technical_employee_pdi_actions` — PDI estruturado

**Funções RLS já prontas:** `has_technical_feedback_access(uuid)`, `owns_technical_review(uuid)`.

### 1.3 Itens do prompt que JÁ ESTÃO IMPLEMENTADOS

Vale registrar para não refazer:

| Item do prompt | Situação |
|---|---|
| §8 "N/A não entra no cálculo" | `groupAverage()` ignora não-avaliados; `overallScore()` **renormaliza o peso** |
| §9 "categoria sem dados não recebe zero" | idem — já é o comportamento |
| §11 (5 saídas de IA separadas) | `runTechnicalReviewAi` com 6 tipos, gravadas em `technical_employee_review_ai` |
| §11 "nada automático no Sólides" | é copiar/colar manual hoje |
| §3 "evitar texto subjetivo" | `BASE_REGRAS` no prompt já proíbe traço de personalidade |
| §12 RLS no backend | policies reais, não só tela escondida |
| §1.10 confirmação do supervisor | `status` + `feedback_completed_at` |

### 1.4 A consulta central da auditoria já existe

`listReviewCandidateChecklists` (technical-reviews.functions.ts:589) já faz exatamente a query que a auditoria precisa:

```
supabaseAdmin.from("checklists")
  .eq("provider_id", …).eq("tecnico_id", …)
  .gte("created_at", period_start).lte("created_at", period_end)
```

Usa `supabaseAdmin` por necessidade: a RLS de `checklists` é
`auth.uid() = tecnico_id OR has_role(auth.uid(),'admin')` — um supervisor **sem**
papel `admin` não enxerga o checklist do técnico pela RLS. A auditoria terá que
passar por `supabaseAdmin` com verificação explícita de `has_technical_feedback_access`
+ `provider_id` no código (mesmo padrão de `assertWbAccess`).

### 1.5 Dados disponíveis em `checklists`

`id, tecnico_id, provider_id, tipo, status, os, cliente, cidade, endereco, modelo,
serial, cto_porta, data_atendimento, hora_atendimento, dados jsonb, finalizado_em,
case_id, revision_number, revision_reason, parent_checklist_id, review_status,
troca_realizada, modelo_ont_retirada/instalada, numero_publico, rmap_code,
intervention_code`

Revisões: `UNIQUE (case_id, revision_number)` já garantido em migration.
Fotos: `checklist_fotos (checklist_id, categoria, storage_path, legenda)`.
Tipos: `validacao_ont, instalacao, remapeamento_cto, melhoria_sinal, readequacao, rompimento`.

---

## 2. Mudanças propostas

### 2.1 Tabelas novas (7)

| Tabela | Papel |
|---|---|
| `checklist_ai_analyses` | 1 análise por (checklist, revisão, rubrica, hash). Guarda status, modelo, confiança, JSON bruto, `is_current` |
| `checklist_ai_findings` | Apontamentos individuais da análise. Classificação, descrição, campos/fotos citados, confiança, status de revisão do supervisor |
| `ai_analysis_queue` | Fila: `status, attempts, next_attempt_at, locked_at, locked_by, last_error` |
| `ai_analysis_batches` | Lote da auditoria histórica: filtros, totais, progresso, pausado/retomado, consumo |
| `checklist_rubrics` | Versão da regra por `tipo` + vigência (`valid_from`/`valid_to`) + campos obrigatórios daquela época |
| `review_recurrence_candidates` | Possível reincidência + classificação de causa pelo supervisor |
| `review_score_composition` | Pesos configuráveis (35/35/30) e as 3 notas separadas por avaliação |

### 2.2 Colunas aditivas

- `technical_employee_reviews`: `scale_version smallint NOT NULL DEFAULT 1` (1 = escala 1–5 legada, 2 = escala 1–10), `auto_score`, `ai_score`, `supervisor_score`, `composition_id`
- `technical_employee_review_items`: `scale_version`, `justification`, `evidence_ref`
- `technical_employee_notes`: `source text DEFAULT 'manual'` (`manual` | `ia`), `finding_id uuid`

`scale_version` é o mecanismo que atende o critério de aceite nº 2 e nº 3
simultaneamente: avaliações antigas ficam com `1` e continuam sendo lidas e
renderizadas na escala 1–5; novas nascem com `2`. **Nenhuma conversão de dado.**

### 2.3 Catálogo novo (código, não banco)

`technical-review-catalog-v2.ts` com os 7 grupos e 35 perguntas do §8
(25/20/15/15/10/10/5 = 100%). O catálogo v1 permanece no código, intocado,
para renderizar as avaliações `scale_version = 1`.

---

## 3. Migrations necessárias

Todas aditivas. Nenhum `DROP`, `TRUNCATE`, `DELETE` ou `ALTER … TYPE`.

| # | Migration | Etapa |
|---|---|---|
| 1 | `checklist_rubrics` + seed das rubricas vigentes | 1 |
| 2 | `scale_version` + colunas de composição nas tabelas de review | 1 |
| 3 | `review_score_composition` + pesos default | 1 |
| 4 | `checklist_ai_analyses` + `checklist_ai_findings` + RLS | 2 |
| 5 | `ai_analysis_queue` + `claim_ai_analysis_batch()` (SECURITY DEFINER, service_role) | 2 |
| 6 | `ai_analysis_batches` | 3 |
| 7 | `review_recurrence_candidates` | 3 |
| 8 | `source`/`finding_id` em `technical_employee_notes` | 2 |

RLS de todas: espelhar `owns_technical_review` / `has_technical_feedback_access`
+ `provider_id = current_provider_id()`. `ai_analysis_queue` e
`ai_analysis_batches`: `service_role` apenas (mesmo padrão de
`whistleblower_rate_limits`).

---

## 4. Riscos

### 4.1 Bloqueadores reais (precisam de decisão antes da Etapa 2/3)

**R1 — Não existe versionamento do formulário de checklist.**
`checklists.dados` é JSONB livre. Não há `schema_version` em lugar nenhum, nem no
banco nem no JSON. A definição do formulário vive em `checklist-schema.ts`, em código.
Consequência direta: **o critério de aceite nº 9 ("checklists antigos avaliados
conforme a versão vigente na data") não é atendível com os dados atuais.**
*Mitigação proposta:* tabela `checklist_rubrics` com `tipo` + `valid_from`/`valid_to`
+ lista de campos obrigatórios daquela vigência, populada a partir do histórico de
commits do `checklist-schema.ts`. A rubrica de um checklist passa a ser resolvida
por `finalizado_em` entre as vigências. É aproximação por data, e precisa da sua
validação de quais campos passaram a ser obrigatórios e quando.

**R2 — Não existe infraestrutura de fila.** Nem `pg_cron`, nem worker, nem Edge
Function agendada. O único "queue" é `offline-checklist-queue.ts`, que é sincronização
offline do técnico, coisa diferente. Server function do TanStack Start morre com a
resposta HTTP. As Etapas 2 e 3 dependem disso e não saem do papel sem construir:
tabela de fila + `claim` com lock + consumidor acionado por `pg_cron` (Supabase) ou
cron externo. **É o item de maior esforço do projeto todo.**

**R3 — Metade dos "indicadores automáticos" (§9, peso 35%) não tem fonte no WebiCheck.**
Volume de O.S., tempo médio/SLA e reabertura de O.S. estão no Zumme.
Aferíveis hoje: completude de campo, foto, teste final, coerência, e reincidência
*checklist-a-checklist*. Sem uma importação do Zumme, os grupos "Produtividade" (10%)
e metade de "Qualidade e reincidência" (15%) caem em N/A e o peso se redistribui —
o que é o comportamento correto pela regra §9, mas significa que na prática a
"nota automática" cobre menos do que o desenho supõe.

### 4.2 Riscos de qualidade

**R4 — Reincidência por `cliente` texto livre.** `checklists.cliente` é digitado
pelo técnico; não há FK de cliente nem contrato. Casar "João da Silva" com "joao silva"
gera falso positivo e falso negativo. Mitigação: normalizar (NFD + upper + colapso de
espaço, mesma função já usada em `normalizeCtoNome`), casar também por `os` e `endereco`,
e — como o §7 já manda — **nunca** deixar afetar nota sem confirmação humana.

**R5 — Prompt injection.** O §2 pede tratar o texto do checklist como não confiável.
Instrução no prompt não garante isolamento. Mitigação estrutural: entregar o conteúdo
do checklist como JSON em campo delimitado, exigir saída em schema fixo, validar com
zod antes de gravar (`ont-checklist-ai.ts` já faz isso com `aiAnalysisSchema` — mesmo padrão),
e descartar finding que não caiba no schema.

**R6 — Não determinismo.** Reprocessar o mesmo checklist pode gerar findings diferentes.
O hash de idempotência do §4 evita reprocesso desnecessário, mas quando houver
reprocesso legítimo os apontamentos podem mudar. Mitigação: `is_current` + preservar
a análise anterior (já previsto no §4) e `temperature: 0.2` (já é o valor no gateway).

**R7 — Escala 1–5 → 1–10 quebra a série histórica.** O §10 pede comparativo mês a mês
e o §5 proíbe conversão automática — as duas coisas estão certas, mas juntas implicam
um degrau permanente no gráfico na virada. Mitigação: rotular o corte na UI
("escala alterada em MM/AAAA") e comparar apenas dentro da mesma `scale_version`.

### 4.3 Risco menor

**R8 —** `listEvaluableEmployees` devolve **todos** os perfis ativos do provedor,
não só técnicos. Vai listar você mesmo e o pessoal administrativo como avaliáveis.

---

## 5. Ordem de implementação

Mantida a divisão do §13, com a inserção da fila como pré-requisito:

| Etapa | Conteúdo | Depende de |
|---|---|---|
| **1 — Fundação** | `checklist_rubrics` + seed; `scale_version`; catálogo v2 (7 grupos / 35 itens); tela do questionário 1–10 com justificativa obrigatória em 1–4 e 9–10; `review_score_composition`; RLS | R1 decidido |
| **1.5 — Fila** *(novo)* | `ai_analysis_queue`, `claim` com lock, consumidor + agendamento, retry com backoff | R2 decidido |
| **2 — Análise dos novos** | Registro no início do checklist; enfileirar na finalização (não bloqueante); prompt de auditoria; `checklist_ai_analyses` + `findings`; confirmar/rejeitar/reclassificar; reprocessar | 1.5 |
| **3 — Auditoria histórica** | Filtros, prévia com contagem e estimativa, lotes com progresso/pausa/retomada, dedup por hash, consolidação mensal | 2 |
| **4 — Avaliação e comparativo** | Tela "Histórico técnico analisado por IA" antes do questionário; composição 35/35/30 configurável; divergência IA × supervisor; comparativo mês a mês; PDI + 3 textos | 3 |

Cada etapa entregue com o que mudou + validação sua antes da seguinte, conforme §13.

---

## 6. Impacto no consumo do gateway de IA

Premissas: ~5.000 tokens de entrada e ~800 de saída por checklist (o `dados` JSONB
completo + lista de fotos). Modelo primeiro da cascata: `google/gemini-2.5-flash`.

| Cenário | Chamadas | Tokens aprox. |
|---|---|---|
| Regime, 1 técnico × 37 checklists/mês | 37 | ~215 mil |
| Regime, 8 técnicos | ~300 | ~1,7 milhão |
| Auditoria histórica, 6 meses × 8 técnicos | ~1.800 | ~10,4 milhões |

**O custo em dinheiro é irrelevante** nessa faixa em modelo Flash. O problema real é
**rate limit e timeout**: 1.800 chamadas disparadas em sequência vão tomar 429 no
gateway da Lovable e falhar no meio do lote. Por isso "lotes, tentativas, retomada"
do §5 é requisito, não refinamento.

Parâmetros propostos: lote de 25, concorrência 3, backoff exponencial
(2s/4s/8s/16s), máximo 4 tentativas, e ao esgotar → status `Falha na análise` com
o erro gravado, sem travar o lote. `ai_analysis_batches` acumula chamadas e tokens
quando o provedor devolver `usage` (nem todos devolvem — o campo fica nulo).

Observação: o gateway atual **não tem timeout nem AbortController** no `fetch`
(`ai-providers.server.ts`). Em lote isso trava o worker. Precisa ser adicionado.

---

## 7. Estratégia de auditoria histórica

1. **Seleção** — técnico, cidade, tipo, intervalo, competência, só finalizados,
   só com possíveis problemas, todos ou amostra (§5).
2. **Prévia sem gastar IA** — conta checklists e revisões por query, resolve a rubrica
   de cada um por data, e estima tempo (`nº ÷ concorrência × latência média observada`).
3. **Chave de idempotência** — `sha256(checklist_id | revision_number | rubric_version | hash(dados+fotos))`.
   Já existente → pula. Mudou → nova análise, anterior preservada, `is_current` movido.
4. **Execução em lotes** com `claim` transacional (`FOR UPDATE SKIP LOCKED`) para
   permitir pausa/retomada e evitar processamento duplo.
5. **Rubrica por data** — o checklist é avaliado contra a rubrica vigente em
   `finalizado_em`. Campo que não existia naquela vigência não vira apontamento;
   vira `Não foi possível avaliar este critério com os dados disponíveis`.
6. **Consolidação mensal** — materializa por (técnico, competência) os contadores do §6,
   sempre com o link para os checklists que sustentam cada número.
7. **Reincidência** — roda depois da análise individual, por janela configurável,
   sobre `cliente` normalizado + `os` + `endereco`, gerando *candidatos* em
   `review_recurrence_candidates` que só entram na conta após classificação do supervisor.

---

## 8. Pontos que precisam da sua decisão

1. **R1 — rubricas por data.** Preciso que você me diga quais campos passaram a ser
   obrigatórios e a partir de quando, por tipo de checklist. Sem isso a auditoria
   histórica ou não roda, ou penaliza injustamente. Alternativa: rodar a auditoria
   histórica só a partir de uma data que você considere "formulário estável".
2. **R2 — agendamento.** `pg_cron` no Supabase, ou endpoint acionado por cron externo?
   Depende de o projeto Supabase ter a extensão liberada.
3. **R3 — Zumme.** Importar CSV mensal de O.S. por técnico, ou aceitar Produtividade
   em N/A com redistribuição de peso?
4. **§13.1 — Preview e Published compartilham o mesmo backend?** Não consigo verificar
   daqui; é configuração do painel da Lovable. Se compartilharem, "testar em Preview"
   escreve no banco de produção e a Etapa 2 passa a gravar análise sobre checklist real.

---

## 9. O que NÃO foi feito neste passo

Conforme o §13 e o fecho do prompt: **nenhuma migration aplicada, nenhuma tabela criada,
nenhum arquivo de produção alterado.** Este documento é o único conteúdo da branch.
