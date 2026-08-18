# Avaliação Técnica — o que ainda falta

Praticamente tudo do plano anterior já está no ar: evidências ligadas a checklists, registro da conversa de feedback, acompanhamentos com alerta de vencimento, histórico e evolução, PDF, arquivar e excluir.

Restam quatro pontos de acabamento.

## 1. Travar a avaliação concluída

Hoje o botão "Concluir avaliação" só muda o status — o formulário continua editável e a data/autor da conclusão não são gravados.

- Ao concluir, gravar quem concluiu e quando (as colunas já existem).
- Deixar a avaliação em modo somente leitura depois disso: notas, observações, evidências, reunião e follow-ups bloqueados.
- Botão "Reabrir avaliação" para quem criou, voltando ao rascunho e registrando a reabertura.

## 2. Auditoria das ações

Hoje só a criação da avaliação é registrada.

- Registrar também: salvar, concluir, reabrir, arquivar/desarquivar, excluir, gerar análise de IA, adicionar/remover evidência e acompanhamento.
- Mostrar esses registros na tela de Segurança, filtrando por avaliação e por usuário.

## 3. Indicadores do módulo

A listagem já mostra total, concluídas, rascunhos e média geral.

- Acrescentar média por categoria no período, quantos colaboradores foram avaliados e o percentual de metas atingidas nos acompanhamentos.

## 4. Compartilhamento privado do PDF

Hoje o PDF só baixa no aparelho.

- Botão de compartilhar usando o compartilhamento nativo do celular (arquivo direto, sem link público), com download como alternativa no desktop.

## Detalhes técnicos

- `saveTechnicalReview` passa a preencher `feedback_completed_at`/`feedback_completed_by` no status `concluida`; nova função `reopenTechnicalReview`. As funções de evidência/reunião/follow-up passam a recusar avaliação concluída.
- Helper de auditoria em `src/lib/technical-reviews.functions.ts` gravando em `technical_employee_review_audit` (já existe, RLS pronto); leitura exposta em `src/routes/_authenticated/seguranca.tsx`.
- Indicadores calculados a partir de `listTechnicalReviews` + agregação de follow-ups; UI em `src/routes/_authenticated/avaliacoes.index.tsx`.
- Compartilhamento via `navigator.share` com o Blob já gerado em `src/components/avaliacao/avaliacao-pdf.tsx`.
- Sem mudança de schema.
