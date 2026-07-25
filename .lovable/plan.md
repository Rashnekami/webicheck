## Objetivo

Aplicar exclusivamente `supabase/migrations/20260725203000_customer_counterproof_v1.sql` no banco Lovable Cloud deste projeto e reportar o resultado. Nada mais no banco. Sem publicar, sem tocar em domínio, sem apagar dados.

## Estado do banco (já verificado)

- `to_regclass('public.customer_counterproofs')` → NULL
- `to_regclass('public.customer_counterproof_events')` → NULL
- Bucket `customer-counterproof-evidence` → não existe

A migration está pendente. O arquivo é aditivo (`CREATE ... IF NOT EXISTS`), sem `DROP`/`DELETE`.

## Pré-checagens obrigatórias antes de aplicar

1. **Ambiente alvo** — confirmar o project ref Lovable Cloud deste projeto e registrar no relatório. Registrar explicitamente que o Lovable Cloud opera **um único banco gerenciado por projeto**: Preview e Published compartilham o mesmo backend. Ou seja, aplicar aqui já altera o banco que a versão publicada usa. Você já autorizou esse comportamento na fase anterior de publicação; confirmar novamente antes de rodar.
2. **Backup recuperável** — antes de aplicar, você me confirma no chat:
   - Horário/ID do último backup automático concluído do Lovable Cloud (via Cloud → Advanced settings → Export data / Backups) e que ele está listado como recuperável.
   - E/ou reafirmar o export manual anterior (`webicheck_260725.backup`, 25/07/2026 15:58:48) como ponto de recuperação válido.
   Sem essa confirmação, não executo o passo 2 abaixo.
3. `supabase--cloud_status` → precisa retornar `ACTIVE_HEALTHY`. Qualquer outro estado aborta.

## Passos de execução

1. Rodar `supabase--cloud_status`; abortar se não `ACTIVE_HEALTHY`.
2. `supabase--migration` com o conteúdo **exato** de `supabase/migrations/20260725203000_customer_counterproof_v1.sql`, sem edição, sem concatenar outras migrations.
3. Pós-aplicação, verificar via `supabase--read_query`:
   - existência de `public.customer_counterproofs` e `public.customer_counterproof_events`
   - RLS ativa em ambas e presença dos GRANTs
   - sequência `customer_counterproof_number_seq` criada
   - bucket `customer-counterproof-evidence` (registrar se a migration o cria ou se ficará como pendência separada)
   - contagens baseline inalteradas em `checklists`, `ont_exchange_tickets`, `profiles`, `user_roles`
4. Validações locais, sem alterar código:
   - `npx tsc --noEmit`
   - `npx vitest run`
   - `npm run build`

## Relatório final

- Horário de início/fim e resultado da migration.
- Project ref Lovable Cloud alvo e confirmação de que Preview/Published compartilham o banco.
- Backup usado como ponto de recuperação (ID/horário confirmados por você).
- Tabelas / sequências / policies / bucket criados.
- Status final da migration (aplicada, idempotente).
- Resultados de typecheck, vitest e build.
- Baseline pós-migration comparado ao anterior.

## Fora do escopo / bloqueios

- Não aplicar nenhuma outra migration. Migrations antigas conflitantes (`20260718040000_codex_harden_webi_integration.sql`, `20260718044500_require_profile_city.sql`) permanecem **bloqueadas**.
- Não publicar, não alterar domínio, não editar código de aplicação, não apagar dados.
- Se a migration falhar, **parar imediatamente** e reportar erro bruto, sem tentar correções nem retries.
