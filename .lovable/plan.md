# Aplicar 3 migrations pendentes + secret do Canal Ético

## Situação verificada no banco agora

- Nenhuma das 6 tabelas novas existe (`zumme_productivity_entries`, `zumme_productivity_breakdown`, `zumme_technician_aliases`, `checklist_ai_analyses`, `checklist_ai_findings`, `checklist_audit_batches`).
- As funções `owns_zumme_entry` e `owns_checklist_analysis` não existem.
- `has_whistleblower_access` ainda está na versão antiga (sem checagem de `provider_id`).

Conclusão: as três migrations estão pendentes, nenhuma já foi aplicada.

## O que será feito

1. Aplicar `20260819160000_whistleblower_hardening.sql` — conteúdo byte a byte, sem reescrita.
2. Aplicar `20260820120000_zumme_productivity.sql` — conteúdo byte a byte.
3. Aplicar `20260820140000_checklist_ai_audit.sql` — conteúdo byte a byte.
4. Criar o secret `WHISTLEBLOWER_HASH_SECRET` com uma string aleatória de 64 caracteres hexadecimais (gerada de forma criptograficamente segura, nunca exibida no chat).
5. Conferir e reportar: RLS habilitada em cada tabela nova, funções criadas, e confirmação do secret.

## Regras respeitadas

- Nenhum comando destrutivo (`DROP`, `TRUNCATE`, `DELETE`) será executado. Se a aplicação exigir algum, eu paro e aviso antes.
- Nenhuma tabela, policy ou função fora desses três arquivos será alterada.
- Nada será publicado nem deployado em produção.

## Detalhes técnicos

O SQL vai pela ferramenta de migration da plataforma (que exige sua aprovação), com o texto dos arquivos exatamente como estão versionados, para que fiquem registrados como as mesmas migrations do repositório. A verificação final consulta `pg_tables.rowsecurity`, `pg_policies` e `pg_proc`.
