
# Preparação de publicação — WebiCheck

Objetivo: deixar o WebiCheck pronto para você publicar manualmente, sem tocar em produção além do necessário. A integração com o Webi Diagnostic continua no código, mas será marcada como “Em homologação”.

## Limites que preciso alinhar antes de executar

1. **Backup do banco.** No Lovable Cloud eu não posso executar `pg_dump` nem gerar um dump completo pela ferramenta. O caminho suportado é você abrir **Cloud → Advanced settings → Export data** e baixar o arquivo. Vou pedir a confirmação de que o download foi feito e a data/hora, e registro isso no relatório como “backup recuperável confirmado pelo usuário”. Se quiser, também exporto CSVs pontuais de tabelas críticas (`checklists`, `checklist_document_snapshots`, `ont_exchange_tickets`, `profiles`, `user_roles`) via a ferramenta de leitura, como camada extra.
2. **Storage.** Os buckets `evidencias` e `webi-diagnostic-reports` não têm export automatizado no Cloud. Vou listar o inventário (contagem de arquivos, tamanho aproximado) e recomendar que, em caso de rollback, os PDFs/fotos permaneçam no bucket original (as migrations previstas não apagam objetos). Um download em massa exige um script externo com service role — eu não faço isso sozinho; posso orientar se quiser executar por fora.
3. **Ambientes.** No Lovable Cloud há um único banco por projeto em cada ambiente; “preview” e “produção” aqui compartilham o mesmo backend gerenciado. Isso significa que **as migrations aplicadas na preview já estão no mesmo banco que a publicação usará**. Vou confirmar isso com `supabase--cloud_status` e listar migrations do repositório × migrations já registradas em `supabase_migrations.schema_migrations` para achar pendências reais.
4. **Testes end-to-end de login e papéis.** Não tenho credenciais de admin, técnico e almoxarife para logar. Vou validar por camadas: (a) revisão estática das rotas `_authenticated`, gate de OAuth e provedores configurados; (b) verificação via SQL de que os papéis, provedores e políticas estão íntegros; (c) execução dos testes unitários existentes de autorização (`dossie-access`, ordenação de revisões). E-mail/senha e Google OAuth você valida manualmente no fim.

Se algum desses limites for problema, me diga antes que eu avance.

## Passos

1. **Snapshot do estado atual**
   - `supabase--cloud_status` para garantir `ACTIVE_HEALTHY` antes de qualquer coisa.
   - Contagens por SQL de: `checklists`, `checklist_document_snapshots`, `checklist_fotos`, `checklist_diagnostic_reports`, `ont_exchange_tickets`, `profiles`, `user_roles`, `providers`, `webi_integration_tokens`. Fica no relatório como linha de base para rollback.
   - Inventário dos buckets `evidencias` e `webi-diagnostic-reports` (nº de objetos, tamanho).

2. **Backup**
   - Pedir sua confirmação do export feito em **Cloud → Advanced settings → Export data**, com data/hora.
   - Opcional (executo se autorizar): exportar CSVs das tabelas críticas acima via `read_query`, para termos um snapshot lógico adicional.

3. **Levantar migrations pendentes**
   - Listar `ls supabase/migrations/*.sql` na branch.
   - Ler `select version from supabase_migrations.schema_migrations order by version` do banco.
   - Diferença = pendentes. Apresentar em ordem cronológica com um resumo de 1 linha por arquivo.
   - **Não** aplicar nada nesse passo — só reportar para você aprovar.

4. **Aplicar somente as migrations pendentes**
   - Se houver, aplicar uma a uma, na ordem, via `supabase--migration`, usando exatamente o conteúdo dos arquivos existentes.
   - Nenhuma migration antiga é editada, renomeada ou reescrita.
   - Nenhum `DROP`/`DELETE` de dados de usuários, checklists, revisões, tickets, fotos, assinaturas ou diagnósticos.
   - Após cada uma, `supabase--cloud_status` e uma verificação de sanidade (contagens ainda batem).

5. **Ocultar “Abrir no Webi Diagnostic” como Em homologação**
   - Localizar o botão/link atual (`diagnostics-section.tsx` e derivados).
   - Trocar o CTA por um estado desabilitado com rótulo **“Webi Diagnostic — Em homologação”** e `title`/`aria` explicando, sem remover a estrutura nem os endpoints `/api/public/webi-diagnostic/*`.
   - Gate por feature flag simples (`VITE_WEBI_DIAGNOSTIC_ENABLED`, default `false`) para reativar sem novo deploy quando homologar.
   - Nenhuma mudança em RPCs, rate limit, snapshots ou tabelas da integração.

6. **Validações locais**
   - `npx tsc --noEmit`
   - `npx eslint` nos arquivos alterados
   - `npx vitest run` (inclui `dossie-access` — 10 casos — e ordenação de revisões — 3 casos)
   - `npm run build`

7. **Verificações estruturais no banco (por SQL, sem alterar dados)**
   - `has_role`, `current_provider_id`, `provider_is_active` presentes.
   - RLS ativa em `checklists`, `checklist_fotos`, `checklist_diagnostic_reports`, `ont_exchange_tickets`, `user_roles`, `profiles`, `providers`.
   - Papel `almoxarifado` existente no enum e concedidos os GRANTs necessários.
   - Índice único `uq_checklists_numero_publico_revision` presente (habilita R2, R3…).
   - Trigger `trg_assign_ont_exchange_ticket` ativa (gera `T{YYYY}NN`).
   - Buckets `evidencias` e `webi-diagnostic-reports` continuam privados.

8. **Relatório final para você aprovar a publicação**
   Vou entregar, sem publicar:
   - Confirmação do backup (com sua data/hora).
   - Migrations pendentes encontradas × aplicadas nesta preparação.
   - Resultado das validações estruturais (tabelas, RLS, papéis, triggers).
   - Resultado de typecheck, lint, testes, build.
   - Status do botão “Abrir no Webi Diagnostic” → **Em homologação, oculto/desabilitado, código preservado**.
   - Riscos e avisos restantes.
   - Plano de rollback (ver abaixo).
   - Veredicto objetivo: WebiCheck pronto para publicar, desconsiderando a integração com Webi Diagnostic ainda pendente.

## Plano de rollback (a incluir no relatório)

- **Código**: reverter pelo History do Lovable ou pela branch anterior no GitHub — sem re-publicar até validar.
- **Banco**: restaurar o export feito no passo 2 via **Cloud → Advanced settings → Export data** (mesma tela oferece import assistido pelo suporte quando necessário). Como as migrations desta preparação são aditivas (não removem colunas nem apagam linhas), o caminho preferencial de recuperação é reverter o código; a restauração completa só entra em cena se dados forem corrompidos por uso pós-deploy.
- **Storage**: nenhuma migration mexe em objetos existentes; fotos, assinaturas, PDFs de checklist e diagnósticos permanecem intactos nos buckets `evidencias` e `webi-diagnostic-reports`.
- **Webi Diagnostic**: se algo relacionado ao botão precisar voltar, trocar `VITE_WEBI_DIAGNOSTIC_ENABLED` para `true` — sem novo deploy de código.

## Detalhes técnicos

- Ferramentas usadas: `supabase--cloud_status`, `supabase--read_query`, `supabase--migration` (só se houver pendentes), `code--exec` para tsc/eslint/vitest/build, `code--line_replace`/`code--write` só para o gate do botão.
- Nenhum uso de `preview_ui--publish`, `publish_settings--update_visibility` ou mudança de domínio.
- Nenhum `DROP`, `TRUNCATE`, `DELETE` sem `WHERE` restritivo, nem qualquer escrita fora do necessário para o gate do botão.
- Nenhum `pg_dump` (não suportado no Cloud pela nossa ferramenta).

Confirma que posso seguir? Se sim, também me diga: (a) autoriza os CSVs adicionais de tabelas críticas no passo 2, e (b) você já rodou o **Export data** do Cloud ou quer que eu pause até você rodar.
