## Objetivo

Transformar o Webifibra em PWA instalável completo em Android e iOS, com:
- Ícone e splash da marca
- Abertura em tela cheia (standalone)
- Funcionamento offline básico (shell do app + navegação)
- Botão visível de "Instalar app"

Preservando design, autenticação, Cloud, checklists, PDFs e link público.

## O que já existe

- `public/manifest.webmanifest` com `display: standalone`, `start_url: /painel`, ícones 192/512 e `apple-touch-icon`.
- Tags `manifest`, `apple-touch-icon` e `theme-color` já em `src/routes/__root.tsx`.
- Nenhum service worker registrado (correto — instalável, mas sem offline e sem prompt visível).

Falta: tags iOS de tela cheia, service worker offline seguro para Lovable, e UI de instalação.

## O que vai ser feito

### 1. Metadados iOS/Android e splash
Editar `src/routes/__root.tsx`:
- `apple-mobile-web-app-capable: yes`
- `apple-mobile-web-app-status-bar-style: black-translucent`
- `apple-mobile-web-app-title: Webifibra`
- `mobile-web-app-capable: yes`
- Gerar `public/apple-splash-*.png` (2 tamanhos principais — iPhone retrato) e adicionar `<link rel="apple-touch-startup-image">`.
- Ajustar manifest: adicionar `id: "/"`, `categories`, `screenshots` opcionais e um ícone `purpose: "maskable"` separado (hoje só um entry combina "any maskable", o que degrada em Android — separar em dois entries).

### 2. Service worker offline (via vite-plugin-pwa, seguindo a skill PWA)
- `bun add -D vite-plugin-pwa`
- Editar `vite.config.ts` para adicionar `VitePWA` com:
  - `registerType: "autoUpdate"`
  - `injectRegister: null`
  - `devOptions: { enabled: false }`
  - `strategies: "generateSW"`
  - `workbox`: navegações `NetworkFirst`, assets hashados `CacheFirst`, exclusão de `/~oauth`, `/api/*`, `/validar/*` (dinâmico, sempre online) e rotas autenticadas de dados.
  - Filename `/sw.js`.
- Criar `src/pwa/register-sw.ts` — wrapper único de registro, com todos os guards da skill:
  - Só registra se `import.meta.env.PROD`
  - Recusa em iframe, hostnames `id-preview--*`, `preview--*`, `*.lovableproject.com`, `*.lovableproject-dev.com`, `*.beta.lovable.dev`
  - Kill switch `?sw=off`
  - Em qualquer contexto recusado: `unregister()` de qualquer SW existente em `/sw.js`
- Chamar o wrapper uma única vez a partir de `src/start.ts` (client bootstrap).

Fallback offline: página cacheada do shell `/painel` (via NetworkFirst com cache de navegação). Sem tentar sincronizar mutações offline (fora de escopo desta iteração).

### 3. Botão "Instalar app" visível
Criar `src/components/pwa/install-button.tsx`:
- Escuta `beforeinstallprompt` (Android/Chrome desktop), guarda o evento, mostra botão "Instalar app" no cabeçalho autenticado.
- Ao clicar: `prompt()` + trata `userChoice`.
- Detecta iOS Safari (sem `beforeinstallprompt`): abre um dialog com instruções passo a passo ("Toque em Compartilhar → Adicionar à Tela de Início").
- Esconde quando `display-mode: standalone` (já instalado) ou `navigator.standalone`.
- Persistência leve em `localStorage` para permitir "lembrar depois" sem sumir para sempre.

Integração: renderizar o botão no header do layout `_authenticated/route.tsx` (ou onde estiver a barra superior atual), e também um card discreto em `/painel` na primeira visita.

### 4. Sinalização de status
- Toast "Novo app disponível — recarregar" quando o SW detectar update (`autoUpdate` + evento).
- Badge "Offline" pequeno quando `navigator.onLine === false`.

### 5. Verificação
- Build de produção local, checar via Playwright que:
  - `/manifest.webmanifest` retorna 200 com os campos esperados
  - `/sw.js` existe apenas no build de produção
  - Tags iOS presentes no HTML
  - Botão "Instalar app" aparece após disparar `beforeinstallprompt` simulado
- Confirmar no ambiente Lovable preview que **nenhum** SW é registrado (guard funcionando).

## Fora de escopo
- Sincronização offline de mutações (formulários salvos localmente e enviados depois).
- Push notifications.
- Empacotamento nativo (Capacitor/TWA) — segue web PWA.

## Arquivos

**Novos:**
- `src/pwa/register-sw.ts`
- `src/components/pwa/install-button.tsx`
- `src/components/pwa/ios-install-dialog.tsx`
- `public/apple-splash-1170x2532.png`, `public/apple-splash-1290x2796.png` (gerados)

**Editados:**
- `public/manifest.webmanifest` (id, ícone maskable separado)
- `src/routes/__root.tsx` (tags iOS + splash links)
- `src/routes/_authenticated/route.tsx` (botão no header)
- `src/routes/_authenticated/painel.tsx` (card de instalação)
- `src/start.ts` (chamada do register)
- `vite.config.ts` (VitePWA)
- `package.json` (vite-plugin-pwa)

Se aprovar, executo nessa ordem: manifest+ícones/splash+tags iOS → botão instalar (Android+iOS) → vite-plugin-pwa + wrapper guardado → verificação.
