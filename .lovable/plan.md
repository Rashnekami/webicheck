## Problema

O Firefox bloqueia a página com `NS_ERROR_DOM_COOP_FAILED` porque:

1. A página do WebiCheck é servida com `Cross-Origin-Opener-Policy: same-origin` (padrão do preview Lovable / PWA).
2. Ao clicar em "Enviar pelo WhatsApp", abrimos `https://wa.me/55...` numa nova aba.
3. `wa.me` responde com um **redirect 301** para `https://api.whatsapp.com/send/?phone=...`.
4. O Firefox compara o COOP entre o documento que iniciou a navegação e o destino final e, como diferem no meio do redirect, aborta a nova aba com o erro do print.

O `noopener` que já usamos não resolve esse caso específico do Firefox — o bloqueio acontece dentro da própria navegação da aba nova, não na relação com a janela mãe.

## Correção

Ir direto para o endpoint final do WhatsApp, eliminando o hop `wa.me → api.whatsapp.com` que dispara o bloqueio do Firefox. O `api.whatsapp.com/send` é o endpoint oficial de Click-to-Chat: no celular abre o app do WhatsApp normalmente; no PC mostra a tela "Abrir app / WhatsApp Web".

### Alterações em `src/components/checklist/customer-counterproof-card.tsx`

1. Em `buildWhatsappPayload`, trocar a URL montada de:
   ```
   https://wa.me/55<digits>?text=<msg>
   ```
   para:
   ```
   https://api.whatsapp.com/send?phone=55<digits>&text=<msg>&type=phone_number&app_absent=0
   ```
   Renomear o campo `waMeUrl` para `whatsappUrl` (ou manter o nome por compatibilidade) e ajustar os dois consumidores: botão "Enviar pelo WhatsApp" e botão "Copiar".

2. Manter `window.open(url, "_blank", "noopener,noreferrer")` — sem o redirect intermediário, o Firefox não dispara mais o COOP.

3. Renomear o botão secundário de "Copiar wa.me" para "Copiar link do WhatsApp" (o link agora é `api.whatsapp.com`).

### Por que não usar `wa.me` mesmo

`wa.me` é apenas um encurtador que redireciona para `api.whatsapp.com`. Chamar o destino final é equivalente para o usuário e evita o problema do Firefox. Em celular o comportamento é idêntico — o app do WhatsApp intercepta o link `api.whatsapp.com/send` da mesma forma.

### Validação

Após a alteração, verificar no Firefox desktop que clicar em "Enviar pelo WhatsApp" abre a página oficial do WhatsApp com os botões "Abrir app" / "Continuar para o WhatsApp Web" (como no segundo print que você enviou), sem o erro `NS_ERROR_DOM_COOP_FAILED`.