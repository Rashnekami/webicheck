
## Objetivo

Adicionar ao Webifibra, sem mexer no PDF/assinaturas/RLS/design existentes:

1. **PWA instalável** (só ícone/tela inicial, sem offline).
2. **Baixar imagem PNG** do checklist finalizado (para anexar no Hubsoft pelo celular).
3. **Link público de validação** `/validar/:token` (sem login), com snapshot imutável, hash, QR Code, revogação/regeneração e registro de acessos.

Nada do que já funciona é reescrito. Reuso o PDF/dados atuais e adiciono uma camada nova.

## Entregas por bloco

### 1. PWA instalável
- `public/manifest.webmanifest` (nome Webifibra, cor `#1a53ff`, `display: standalone`, `start_url: "/painel"`).
- Ícones 192/512 gerados a partir da logo atual.
- Tags no `__root.tsx` (`manifest`, `apple-touch-icon`, `theme-color` já existe).
- Nenhum service worker.

### 2. Banco (uma migration)
Nova tabela `checklist_document_snapshots`:
- `id`, `checklist_id → checklists`, `version int`, `public_token_hash text unique`
- `public_status text` (`active | revoked | replaced`), `snapshot_data jsonb`, `document_hash text`
- `finalized_at`, `created_at`, `created_by`, `revoked_at`, `revoked_by`, `replaced_by_snapshot_id`
- `view_count int`, `last_viewed_at`

Nova tabela `checklist_public_access_logs`:
- `id`, `snapshot_id`, `accessed_at`, `event_type` (`view|download_pdf|download_image`), `user_agent_summary`, `ip_hash`, `referer_domain`

RLS: SELECT/INSERT/UPDATE só para autenticado (admin gerencia); leitura pública via server function que valida o hash do token. GRANTs incluídos.

Trigger: ao finalizar checklist (novo ou já finalizado sem snapshot) → cria versão 1. Ao re-finalizar após edição de admin → cria v2 e marca v1 como `replaced`.

### 3. Server functions (`src/lib/public-checklist.functions.ts`)
- `getPublicChecklist({ token })` — sem auth. Hash SHA-256 do token → busca snapshot ativo/substituído → retorna `snapshot_data`, `status`, `document_hash`, `finalized_at`, `version`. Registra `access_log` via `supabaseAdmin`. Resposta genérica para token inválido.
- `revokeSnapshot({ snapshotId })` — admin only.
- `regenerateSnapshotToken({ snapshotId })` — admin only, revoga antigo e cria novo com novo token.

Callers autenticados usam `requireSupabaseAuth` + verificação `has_role('admin')`. Público usa client publishable com policy `TO anon` só na função (sem SELECT direto).

### 4. Componente de documento visual (`ChecklistDocumentView`)
Componente React HTML/Tailwind que renderiza o checklist finalizado no mesmo layout visual do PDF (cabeçalho azul, seções, checkboxes, assinaturas, QR Code no rodapé). Usado por:
- Página de detalhe (prévia)
- Exportação PNG (`html-to-image`)
- Página pública `/validar/:token`

Um único componente, alimentado por `snapshot_data`. Sem menus/botões dentro.

### 5. Exportação PNG (cliente)
- `bun add html-to-image qrcode`
- `src/services/checklist-image-export.ts`: monta um container off-screen (largura fixa 1800px, fundo branco), renderiza `<ChecklistDocumentView />`, aguarda logo/fontes/QR, chama `htmlToPng`, faz download `checklist-webifibra-OS-123456.png` (ou `-CHK-000123.png`).
- Se altura > 12000px → gera múltiplas páginas numeradas e oferece ZIP (usa `jszip`, já presente ou instalar).

### 6. Link público
- Nova rota **pública** `src/routes/validar.$token.tsx` (top-level, SSR ok, `head()` com `noindex,nofollow,noarchive`).
- Chama `getPublicChecklist` via `useSuspenseQuery`.
- Estados: válido / substituído / revogado / não encontrado — badge visual.
- Renderiza `<ChecklistDocumentView />`, botões "Baixar PDF", "Baixar imagem", "Copiar link".
- Não expõe telefone/email/endereço completo por padrão (mostra nome completo conforme sua escolha; oculta telefone/email; endereço só cidade).

### 7. Ações e admin no detalhe (`checklists.$id.tsx`)
Nova seção "Documentos e comprovação" quando `status = finalizado`:
- Baixar PDF (mantém atual)
- Baixar imagem
- Copiar link público
- Copiar texto para OS
- Compartilhar (Web Share API com fallback)
- Visualizar documento (dialog com `ChecklistDocumentView`)
- **Admin apenas**: revogar link, gerar novo link, ver contadores de acesso, ver hash e versão

### 8. QR Code
- `qrcode` no cliente, tamanho 160px, canto inferior do documento.
- Só renderiza depois do token existir.

## Segurança e detalhes

- Token: `crypto.randomUUID()` + `crypto.getRandomValues` → 32 bytes base64url (256 bits).
- Armazena apenas `SHA-256(token)` no banco.
- Hash de integridade: SHA-256 do JSON canônico do snapshot.
- Página pública: `<meta name="robots" content="noindex,nofollow,noarchive">`.
- Nunca expõe IDs internos, credenciais, senhas.
- Rate limit básico (contador em memória por IP na server function) — best-effort.

## Fora de escopo (para não estourar)

- Geração server-side de PNG (você escolheu cliente).
- Fila offline.
- Bloqueio de edição pós-finalização (sua escolha foi criar nova versão).
- Storage de PDF/PNG no servidor (gera sob demanda).

## Migrations & arquivos

**Novos:**
- `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`
- `supabase/migrations/*_snapshots.sql`
- `src/lib/public-checklist.functions.ts`
- `src/lib/document-hash.ts`
- `src/components/checklist/checklist-document-view.tsx`
- `src/components/checklist/document-actions.tsx`
- `src/components/checklist/public-link-manager.tsx`
- `src/services/checklist-image-export.ts`
- `src/routes/validar.$token.tsx`

**Editados:**
- `src/routes/__root.tsx` (manifest link)
- `src/routes/_authenticated/checklists.$id.tsx` (nova seção)
- `src/start.ts` (garantir bearer middleware já presente)
- `package.json` (html-to-image, qrcode, jszip)

Se ok, executo em sequência: (1) manifest+ícones, (2) migration, (3) componente + hash + QR, (4) server functions, (5) rota pública, (6) exportação PNG, (7) integração no detalhe. Vou parar após a migration para você aprovar.
