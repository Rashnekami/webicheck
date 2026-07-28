# Módulo Remapeamentos (acompanhamento) + Localização precisa da CTO

Escopo em três frentes, sem tocar em Troca de ONT nem duplicar o checklist.

## 1. Localização precisa da CTO no checklist de Remapeamento

Ajustes no `MapPicker` e na etapa "Localização" do `remapeamento-form.tsx`:

- Ao entrar na etapa: capturar GPS do técnico (`navigator.geolocation.getCurrentPosition`) e abrir o mapa **já** em `mapTypeId: "hybrid"`, zoom 20, centrado no GPS.
- Mostrar dois marcadores distintos: círculo azul (GPS do técnico, não arrastável) e pino vermelho (CTO, arrastável + reposicionável por clique/toque).
- Botão obrigatório **"Confirmar localização da CTO"** só habilita depois de mover/tocar. Antes disso, a etapa não é considerada preenchida (bloqueia "Próximo").
- Persistir em `data.localizacao`:
  - `gps_original` (lat/lng/accuracy_m/captured_at)
  - `confirmada` (lat/lng)
  - `confirmada_em` (novo campo — timestamp da confirmação)
  - `distancia_m` (calculada via haversine já existente)
- Exibir badge verde "✅ Localização da CTO confirmada" com lat/lng após confirmar.
- Nunca travar o pino no GPS — ponto inicial pode ser GPS mas o técnico precisa reposicionar.

## 2. Remover exigência de cliente

- Na validação de finalização (`remapeamento-form.tsx` / `checklists.ts`) remover qualquer regra que exija cliente em portas.
- Portas podem ficar todas `livre`. Cliente é campo opcional em cada porta.
- Ajustar mensagens/labels que sugiram obrigatoriedade.

## 3. Código RMAP automático

- Ao finalizar checklist do tipo `remapeamento_cto`, gerar `rmap_code` no formato `RMAP-YYYY-CTO{numero}`, com sufixo `-001/-002…` se já existir para o mesmo (provider, ano, CTO).
- Implementação via **trigger + sequência** no banco (paralelo ao `assign_ont_exchange_ticket`):
  - Nova coluna `checklists.rmap_code text` (nullable, único por provider).
  - Trigger `assign_rmap_code()` executa `BEFORE UPDATE` quando `status` muda para `finalizado` e `tipo = 'remapeamento_cto'`.
  - Usa `pg_advisory_xact_lock` + count por (provider, ano, cto_codigo) para gerar sufixo.
- Exibir o `rmap_code` no cabeçalho do checklist, no card de detalhes, no PDF stub e nas listagens.

## 4. Módulo Remapeamentos (só acompanhamento)

Nova rota `/_authenticated/remapeamentos.tsx` seguindo padrão de `trocas-ont.tsx`.

Estrutura:

```text
Remapeamentos
├── Aba "Lista"   → tabela com filtros e busca
├── Aba "Mapa"    → Google Maps satélite com todos os pinos
└── Aba "Indicadores" → cards + gráficos
```

**Lista** (server fn nova em `src/lib/remapeamentos.functions.ts`):
- Query em `checklists` onde `tipo = 'remapeamento_cto'`, `status = 'finalizado'`, `is_current = true`, escopo por provider (respeita RLS existente).
- Colunas: RMAP, CTO, cidade, setor, técnico, data, splitter, portas total/ocupadas/livres, status revisão, provider.
- Estatísticas derivadas de `dados` via `computeSplitterStats`.
- Busca: `rmap_code`, `cto_codigo`, cidade, setor, técnico.
- Filtros: provider (só platform admin), cidade, técnico, período, status, splitter.

**Mapa**:
- Reutiliza a chave `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`.
- Marcadores usam `data.localizacao.confirmada` (nunca `gps_original`). Ignora itens sem confirmada.
- InfoWindow com resumo + botão "Ver Remapeamento" → `/checklists/{id}`.
- Toggle padrão/satélite (`mapTypeControl`).

**Indicadores**:
- Cards: total, hoje, 7 dias, mês, CTOs únicas, portas totais/ocupadas/livres, pendentes revisão.
- Gráfico linha "Remapeamentos por mês" e barras "Ranking por técnico" (`recharts`).
- Filtros compartilhados com a Lista.

## 5. Dashboard geral

Adicionar cards e um gráfico compacto de remapeamentos no `_authenticated/dashboard.tsx`, reaproveitando os agregados do módulo.

## 6. Navegação

- Adicionar item "Remapeamentos" no menu principal (mesmo ponto em que "Trocas de ONT" está registrada).
- Visível para técnicos (só vê os próprios), supervisor/noc/admin conforme papéis já existentes.

## Detalhes técnicos

- **Migração SQL**: coluna `rmap_code`, índice único parcial `(provider_id, rmap_code)`, função + trigger `assign_rmap_code`, GRANTs preservados.
- **Tipos**: adicionar `rmap_code` em `ChecklistRow` e no snapshot payload público.
- **Sem novo formulário**: form permanece em `remapeamento-form.tsx`; apenas ajustes de etapa Localização e validação.
- **Multi-provider**: todas as queries usam `provider_id = current_provider_id()` já garantido por RLS de `checklists`.
- **Não mexer**: `ont_exchange_tickets`, fluxo de Troca de ONT, snapshots existentes.

Sigo com a migração primeiro (gera `rmap_code` retroativamente para finalizados), depois código.
