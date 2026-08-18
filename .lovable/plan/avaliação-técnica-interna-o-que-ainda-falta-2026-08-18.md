# Avaliação Técnica Interna — o que ainda falta

O que já está pronto: acesso restrito por liberação, criação de avaliação por colaborador/período, as 6 categorias com notas e observações, cálculo de médias e nota final, rascunho local automático, e as 4 análises de IA (gerencial, Sólides, roteiro de conversa, PDI).

Abaixo as etapas que faltam para o módulo ficar completo conforme a especificação. As tabelas do banco para todas elas já existem — falta a interface e as funções.

---

## Etapa 1 — Evidências ligadas a checklists

- Painel na avaliação para anexar evidências reais (checklist/OS/reclamação) com descrição.
- Busca de checklists do colaborador dentro do período avaliado, para vincular com um clique.
- Evidências entram no contexto enviado à IA (hoje a IA só vê notas e observações).

## Etapa 2 — Registro da conversa de feedback

- Bloco "Reunião de feedback": data, local, reação do colaborador, comentários dele, notas do gestor.
- Marcação "colaborador apresentou informação nova" com campo de texto.
- Botão **Concluir avaliação** que grava data/autor da conclusão e trava a edição.

## Etapa 3 — Acompanhamento (follow-up)

- Lista de acompanhamentos por avaliação: data, status (pendente / em andamento / atingido / não atingido), meta anterior, resultado, observação.
- Alerta na listagem quando a data do próximo acompanhamento vencer.

## Etapa 4 — Exportação em PDF

- PDF da avaliação no mesmo padrão visual dos outros documentos do sistema: cabeçalho com colaborador/período/avaliador, gráfico ou barras das 6 categorias, nota final, pontos fortes e de desenvolvimento, PDI, e espaço de assinatura do gestor e do colaborador.
- Botão de download e de compartilhamento privado (sem link público).

## Etapa 5 — Histórico e evolução

- Aba de histórico do colaborador: todas as avaliações em linha do tempo com nota final.
- Comparativo entre a avaliação atual e a anterior, por categoria (subiu/caiu/estável).
- Indicadores do módulo: média por categoria, colaboradores avaliados no período, metas atingidas.

## Etapa 6 — Ajustes finais

- Arquivar avaliação (a coluna já existe) e filtro para esconder arquivadas.
- Excluir avaliação com confirmação (a função já existe no servidor, falta o botão).
- Registro de auditoria das ações na tela de segurança.

---

## Detalhes técnicos

- Novas server functions em `src/lib/technical-reviews.functions.ts` para evidências, reunião, follow-ups e histórico; tabelas `technical_employee_review_evidences`, `_meetings`, `_followups` e `_audit` já existem com RLS via `owns_technical_review`.
- PDF novo em `src/components/checklist/`-padrão, reaproveitando o tema escuro e o pipeline de imagem já usado nos demais documentos.
- O contexto da IA em `src/lib/technical-review-ai.server.ts` passa a incluir evidências e histórico anterior.
- Sem mudança de schema prevista; só se a comparação exigir índice extra.

---

## Ordem sugerida

Etapas 1 → 2 → 3 numa rodada (fluxo completo do feedback), depois 4 → 5 → 6.
