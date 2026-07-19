## Objetivo

Aplicar no banco de dados conectado (ambiente de preview, não produção) a migration já existente no repositório:

`supabase/migrations/20260719090000_provider_agent_foundation.sql` (254 linhas)

Sem reescrever a migration, sem editar outros arquivos e sem publicar.

## Passos

1. Executar o SQL exato do arquivo `supabase/migrations/20260719090000_provider_agent_foundation.sql` através do fluxo de migration do Lovable Cloud (ferramenta `supabase--migration`), enviando o conteúdo original para aprovação.
2. Aguardar sua aprovação da migration na UI (etapa obrigatória do fluxo).
3. Após a execução, a preview é reconstruída automaticamente (regeneração de types + rebuild).
4. Verificar se a migration foi aplicada completamente consultando o banco:
   - Presença das tabelas criadas (ex.: `providers`, `agent_devices`, `agent_authorization_requests`, e demais definidas no arquivo).
   - Presença das colunas novas em tabelas existentes (ex.: `provider_id`).
   - RLS habilitada e policies criadas conforme o arquivo.
5. Reportar o resultado: aplicada com sucesso, ou apontar qualquer statement que não tenha executado, com a mensagem de erro exata do Postgres.

## Fora do escopo

- Não altero o SQL da migration.
- Não modifico código-fonte da aplicação.
- Não publico em produção — a migration é aplicada apenas no banco conectado à preview.
- Não regenero `src/integrations/supabase/types.ts` manualmente (isso ocorre automaticamente após a migration).