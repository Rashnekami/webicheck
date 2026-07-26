# Supervisores, NOC e Castro

## 1. Cidades
- Adicionar **Castro** em `src/lib/profile-cities.ts` (agora 6 cidades).

## 2. Banco (uma migration)
- Enum `app_role`: adicionar `'supervisor'` e `'noc'`.
- `profiles`: nova coluna `supervisor_id uuid REFERENCES auth.users(id)` (técnico → supervisor).
- Nova tabela `supervisor_cities (supervisor_id, city, provider_id)` — cidades que cada supervisor supervisiona (M2M).
- `checklists`: colunas de revisão de supervisor:
  - `review_status text` (`pendente`, `aprovado`, `reprovado`) — default `pendente` quando finalizado.
  - `review_comment text`, `reviewed_by uuid`, `reviewed_at timestamptz`.
  - `locked_for_rework bool` — quando true, técnico é obrigado a criar revisão (Rn) antes de novo envio.
- Funções `SECURITY DEFINER`:
  - `is_supervisor_of(_supervisor uuid, _tecnico uuid) → bool`
  - `supervisor_covers_city(_supervisor uuid, _city text) → bool`
  - `review_checklist(_id uuid, _decision text, _comment text)` — só supervisor do técnico, seta review_status/locked_for_rework, cria evento.
- RLS atualizada:
  - **checklists SELECT**: acrescenta `supervisor` (vê checklists dos técnicos atribuídos OU dentro das cidades cobertas) e `noc` (vê tudo do provedor, read-only).
  - **checklists UPDATE**: bloqueia edição quando `locked_for_rework=true` (só destrava via `create_checklist_revision`).
  - **profiles**: supervisor lê/edita perfis dos seus técnicos; NOC lê perfis do provedor.
  - **provider_login_accounts**: supervisor pode gerenciar credenciais dos técnicos do seu escopo.
- Trigger em `checklists`: ao finalizar, seta `review_status='pendente'`.
- GRANTs para `authenticated` em todas as novas tabelas/colunas.

## 3. Server functions
- `src/lib/supervisor.functions.ts`
  - `listSupervisorScope()` — cidades cobertas + técnicos vinculados.
  - `reviewChecklist({ id, decision, comment })` — chama RPC.
  - `assignTechnicianToSupervisor({ tecnicoId, supervisorId })` — admin/platform.
- `src/lib/admin-users.functions.ts` (existente): estender criação/edição para escolher **papel** (`tecnico | supervisor | noc | admin | almoxarifado`), cidades cobertas (supervisor) e supervisor vinculado (técnico).
- `src/lib/technician-credentials.functions.ts`: permitir supervisor criar login dos seus técnicos.

## 4. UI
- **Usuários** (`src/routes/_authenticated/usuarios.tsx`):
  - Novo seletor de papel no diálogo de criação/edição.
  - Se papel = `supervisor`: multi-select de cidades cobertas.
  - Se papel = `tecnico`: dropdown "Supervisor responsável" (lista supervisores do provedor).
  - Badge visual do papel em cada card.
- **Checklist detalhe** (`src/routes/_authenticated/checklists.$id.tsx`):
  - Novo card **Revisão do Supervisor** (visível quando finalizado): botões Aprovar/Reprovar + textarea de comentário; mostra status atual e histórico.
  - Se `locked_for_rework=true` e o usuário for o técnico: banner vermelho "Reprovado por supervisor — crie uma nova revisão" + botão que abre o fluxo de revisão existente.
- **Lista de checklists** (`src/routes/_authenticated/checklists.index.tsx`):
  - Badge de `review_status` (Pendente/Aprovado/Reprovado).
  - Filtro rápido para supervisores: "Aguardando minha revisão".
- **Dashboard**: sem mudança de UI, RLS já dá acesso ao NOC.

## 5. Detalhes técnicos
- `handle_new_user`: mantém `renan.rash@gmail.com` / `renanparkofthedeath@gmail.com` como platform_admin.
- Notificação ao técnico = banner in-app + toast na próxima abertura (sem email nesta iteração).
- Supervisor NÃO consegue apagar checklists finalizados (só platform admin e admin do provedor).
- NOC: policies só SELECT — nenhuma policy de INSERT/UPDATE/DELETE.

## 6. Verificação
- `supabase--linter` após a migration.
- Teste manual: criar supervisor SUP-PG cobrindo Ponta Grossa, vincular técnico T0113, finalizar checklist como T0113, aprovar/reprovar como SUP-PG, tentar editar após reprovação (deve travar), criar revisão.
