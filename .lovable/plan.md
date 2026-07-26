# Plano — Permissões, Multi-provedor com Branding e Login Interno

## 1. Restaurar exclusão de checklists finalizados (só para você)

- Nova policy RLS em `public.checklists`: `DELETE` permitido quando `profiles.platform_admin = true` do usuário atual (via função `SECURITY DEFINER` `is_platform_admin(auth.uid())` para evitar recursão).
- Cascata segura: apagar em ordem — `checklist_fotos`, `checklist_diagnostic_reports`, `checklist_document_snapshots`, `checklist_public_access_logs`, `customer_counterproof_events`, `customer_counterproofs`, `ont_exchange_tickets` → depois `checklists`. Feito via server fn `deleteChecklistCascade` usando `supabaseAdmin` após checar `platform_admin`.
- UI: em `src/routes/_authenticated/checklists.$id.tsx` e na lista, botão "Excluir" volta a aparecer para você (mesmo se `status = finalizado`), com confirmação dupla.

## 2. Cadastro de provedores com branding

- Migration em `public.providers`:
  - `logo_url text`, `primary_color text`, `accent_color text`, `pdf_template text default 'dark-neon'` (valores: `'dark-neon'` | `'light-classic'`).
- Novo bucket `provider-branding` (público-leitura, upload restrito a platform_admin).
- Server fns em `src/lib/platform-admin.functions.ts` (só `platform_admin = true`):
  - `createProvider({ name, slug, logo, primary_color, accent_color, pdf_template })`
  - `updateProviderBranding(...)`
  - `listAllProviders()`
- Nova página `src/routes/_authenticated/plataforma.tsx` (visível só para você): lista todos provedores + form "Novo provedor" com upload de logo, seletor de cores, seletor de template PDF (preview lado a lado dos 2 layouts).
- Em `src/routes/_authenticated/provedor.tsx`: admin do próprio provedor pode trocar logo/cores/template, mas não pode criar outro provedor.

## 3. Aplicar branding nos PDFs e na UI

- Contexto `ProviderBrandingContext` carregado no `_authenticated/route.tsx` (logo, cores, template).
- Cabeçalho do app e `WebifibraLogo` passam a usar logo do provedor.
- PDFs (`checklist-pdf.tsx`, `instalacao-pdf.tsx`, `dossie-pdf.ts`, `customer-counterproof-pdf-page.tsx`, `validation-dark-document.tsx`, `installation-dark-document.tsx`):
  - Se `pdf_template = 'dark-neon'` → layout atual, cores do provedor substituem azul/cyan.
  - Se `pdf_template = 'light-classic'` → segundo template (fundo claro, cabeçalho colorido com logo, mesmo conteúdo).
  - Logo do provedor no header do PDF (fallback: Webifibra).

## 4. Login usuário+senha coexistindo com Google

- Migration `public.provider_login_accounts`:
  - `user_id uuid → auth.users`, `provider_id uuid`, `login text`, `password_hash text` (bcrypt), `active bool`, `created_by uuid`, timestamps.
  - Unique `(provider_id, lower(login))`.
- Server fns:
  - `createTechnicianCredential({ provider_id, login, password, full_name, matricula, phone, city, role })` — só admin do provedor. Cria auth user com email sintético `login@<slug-provedor>.webicheck.local`, salva hash bcrypt em `provider_login_accounts`, popula `profiles` e `user_roles`.
  - `resetTechnicianPassword({ account_id, new_password })`.
  - `deactivateTechnicianCredential({ account_id })`.
- Login: server route `src/routes/api/public/auth/login-internal.ts` — recebe `{ provider_slug, login, password }`, valida bcrypt em `provider_login_accounts`, gera magic link/token do Supabase e devolve para o front chamar `supabase.auth.setSession`.
- UI `src/routes/auth.tsx` ganha duas abas: **Login interno** (dropdown provedor + login + senha) e **Google** (mantido).
- Vínculo com histórico: técnicos que já logaram por Google mantêm o mesmo `user_id`; supervisor pode adicionar credencial interna ao mesmo `profiles.id` via botão "Adicionar login/senha" no `usuarios.tsx`. Os checklists ficam intactos (já são atrelados por `tecnico_id = user_id`).
- Preparação para Webi Diagnostic: o `provider_login_accounts` já expõe `provider_id` + `login`, então o agente futuro poderá usar as mesmas credenciais via endpoint dedicado (fora do escopo agora, só deixar a base pronta).

## 5. Ordem de execução

1. Migration 1 — RLS de delete + função `is_platform_admin`.
2. Migration 2 — colunas de branding em `providers` + bucket.
3. Migration 3 — tabela `provider_login_accounts` + índices + RLS.
4. Server fns: `deleteChecklistCascade`, `platform-admin.functions.ts`, `technician-credentials.functions.ts`.
5. Server route de login interno + hook no `auth.tsx`.
6. Contexto de branding + aplicação nos PDFs (dois templates).
7. Página `/plataforma`, ajustes em `/provedor` e `/usuarios`.
8. Restaurar botão de excluir na tela do checklist.

## Notas técnicas

- Senha em bcrypt (`bcryptjs`, roda no worker). Nunca em texto puro; nunca retornada por API.
- Google continua ativo — não vou chamar `configure_social_auth` para desabilitar.
- Emails sintéticos (`login@slug.webicheck.local`) nunca são exibidos ao usuário; a UI mostra apenas `login` e nome do provedor.
- `platform_admin` continua sendo você (`renan.rash@gmail.com`); apenas você vê `/plataforma` e o botão de deletar checklist finalizado.
- Sem mudança de domínio nem republicação forçada — tudo aplicado em preview primeiro.
