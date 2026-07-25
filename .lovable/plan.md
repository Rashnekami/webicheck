## Objetivo

Fazer o botão "Enviar pelo WhatsApp" abrir uma URL no mesmo formato usado pelo `wa.link` / `criar.wa.link`:

```
https://wa.me/55<DDD><numero>?text=<mensagem-url-encoded>
```

Hoje o botão já monta essa URL, mas usa `window.open(...)` dentro de uma mutação assíncrona (`await` antes do open). No desktop, isso faz o Firefox bloquear o redirecionamento `wa.me → api.whatsapp.com` com `NS_ERROR_DOM_COOP_FAILED` — foi exatamente o que apareceu no print.

## Mudança (somente frontend)

Arquivo único: `src/components/checklist/customer-counterproof-card.tsx`

1. Ao clicar em "Enviar pelo WhatsApp":
   - Validar dígitos no cliente (10–11 dígitos, sem 55).
   - Montar a URL final `https://wa.me/55${digitos}?text=${encodeURIComponent(mensagem)}`.
   - Criar um `<a href={url} target="_blank" rel="noopener noreferrer">` programaticamente, clicar e remover — a navegação nasce direto do gesto do usuário, sem `await` no meio, evitando o bloqueio COOP.
2. Em paralelo (fire-and-forget, sem `await` antes do open) chamar `registerCounterproofPhone` para registrar o telefone e o evento `whatsapp_opened`. Erros do registro viram `toast.error`, mas não impedem a abertura.
3. Manter o input "DDD + número" e a dica "sem 55".

## Fora de escopo

- Sem mudanças no servidor, banco, migrations, PDF, snapshots ou dossiê.
- Sem mudança na mensagem enviada (link da Contra-Prova + código).
