# Aviso — auth hardening pausado, retomar aqui

Pra qualquer agente (Claude, GPT, etc.) que pegar este repo depois: o
trabalho de auth centralizada está pausado nesta branch
(`feat/auth-hardening-v2-2026-07-28`), **não mesclado**, esperando
crédito da Lovable voltar. Foco mudou para o `webi-diagnostic`
(branch `agent/diagnostico-avancado-0-7`, ver `webicheck_client.py`).

## Contexto importante antes de mexer em qualquer coisa

- A branch de produção real, conectada à Lovable, é
  `agent/finalizar-webicheck-integracao` — **não é `main`**, que está
  desatualizada. Sempre confirmar isso antes de basear trabalho novo.
- O banco Supabase é **compartilhado entre todas as branches** — não é
  um banco por preview. Aplicar uma migration afeta todo mundo na hora,
  independente de qual branch está "publicada" na Lovable.
- Esta branch (`feat/auth-hardening-v2-2026-07-28`) parte de
  `agent/finalizar-webicheck-integracao` no commit `12fdc7b`. Rebasear
  nele de novo antes de continuar, caso produção tenha avançado.

## O que já está pronto nesta branch (código, aguardando aplicar)

- `supabase/migrations/20260728180000_auth_hardening_v2.sql`:
  - `profiles.must_change_password` (default false, aditivo).
  - `generate_next_technician_login(provider_id)`: gera `tec01`,
    `tec02`... por provedor.
  - `handle_new_user()` bloqueia Google criando conta nova (RAISE
    EXCEPTION quando `raw_app_meta_data->>'provider' = 'google'` e não
    há auth.users existente pro mesmo e-mail). Quem já usa Google hoje
    não é afetado.
- `/usuarios`: botão de criar/resetar credencial agora gera
  login+senha temporária automaticamente (`autoGenerateTechnicianCredential`,
  `autoResetTechnicianPassword` em `src/lib/technician-credentials.functions.ts`),
  mostra uma vez, marca `must_change_password=true`.
- `/trocar-senha`: gate obrigatório antes de liberar `/_authenticated`
  quando `must_change_password=true`. **Degrada com segurança** se a
  coluna ainda não existir no banco (não derruba login — ver
  `fetchMustChangePassword()` em `src/routes/_authenticated/route.tsx`).
- `/auth`: só 2 abas — Login (Provedor+Login+Senha, Google embaixo) e
  Recuperar acesso. Aba "Cadastrar" e o login por e-mail direto foram
  removidos.
- `/minha-conta`: usuário logado vincula a própria conta Google
  (`supabase.auth.linkIdentity`) — vínculo explícito, nunca automático,
  nunca cria conta nova.

## Pendências que travam isso funcionar de verdade

1. **Aplicar a migration no banco real.** O usuário só tem acesso via
   Lovable (sem login direto no Supabase) e está sem crédito de IA lá.
   Rodar SQL não deveria gastar crédito (é ação de infra, não geração de
   código) — procurar um painel "Cloud"/"Database"/"Supabase" separado
   do chat de IA na Lovable, com aba de migrations pendentes.
2. **Habilitar "Manual Linking"** no Supabase Auth Dashboard
   (Authentication → Settings) — sem isso, `linkIdentity()` em
   `/minha-conta` retorna erro. Não dá pra fazer isso por SQL/migration.
3. Depois de aplicado: testar o fluxo completo — admin cria técnico em
   `/usuarios` → técnico loga com login+senha temporária em `/auth` →
   é forçado a `/trocar-senha` → depois pode vincular Google em
   `/minha-conta`.
4. Ainda não tem link de navegação óbvio pra alguns admins descobrirem
   `/usuarios` fora do card do painel — já existe (`painel.tsx` linha
   ~347), então isso está OK, só deixando registrado que foi checado.

## Branches órfãs para ignorar/limpar

- `feat/auth-centralizada-2026-07-28` (webicheck e webi-diagnostic):
  trabalho descartado, foi construído em cima da `main` desatualizada
  por engano. Não usar. Não consegui deletar via git (proxy bloqueia
  `push --delete`, HTTP 403) — seguro deletar manualmente pelo GitHub
  quando alguém lembrar.
- `backup/pre-webicheck-auth-2026-07-28` (baseado na `main` errada) e
  `backup/pre-webicheck-auth-producao-2026-07-28` (baseado na
  `agent/finalizar-webicheck-integracao` real, commit `12fdc7b`) — o
  segundo é o backup de segurança que importa.
