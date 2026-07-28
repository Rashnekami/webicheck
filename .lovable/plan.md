# Plano — Remapeamento + Intervenções de Rede WebiCheck

Escopo grande. Vou dividir em **4 fases entregáveis** para evitar refatoração cega e permitir validar cada etapa. Confirme se quer que eu execute tudo em sequência, ou só a Fase 1 primeiro.

---

## Fase 1 — Correção do Remapeamento (base do restante)

**1.1 Validação sem cliente**
- Remover qualquer regra em `remapeamento-form.tsx` / `checklists.ts` que exija cliente em portas.
- Portas podem estar todas `livre` / `reserva` / `nao_identificada`; cliente e observação continuam opcionais.
- Ajustar labels/mensagens.

**1.2 Mapa Mapbox real (substitui Google Maps atual do MapPicker)**
- Trocar `MapPicker` para **Mapbox GL JS** (`mapbox://styles/mapbox/satellite-v9`), somente para Remapeamento e Intervenções. Não mexer nas outras telas que usam Google Maps.
- Conectar Mapbox via connector (`standard_connectors--connect mapbox`); pk. no browser, sk. no server para Static Images API.
- Comportamento:
  - GPS do técnico apenas centraliza o mapa inicialmente (não define CTO).
  - Marcador azul = técnico; pino vermelho = CTO (arrastável e clicável).
  - Botão **"Centralizar no meu GPS"** só move a câmera.
  - Botão **"Confirmar localização da CTO"** só habilita após interação.
  - Ao reabrir checklist com localização já confirmada, nunca sobrescrever com GPS atual.
- Persistir em `data.localizacao`: `gps_original {lat,lng,accuracy_m,captured_at}`, `cto {lat,lng}`, `confirmed`, `confirmed_at`, `confirmed_by`, `distancia_m`.

**1.3 Snapshot satélite (Mapbox Static Images API)**
- Nova server fn `generate-map-snapshot.functions.ts` — recebe `checklist_id`, lê `cto.lat/lng`, chama Static Images API via gateway Mapbox (sk.), salva PNG em bucket novo `map-snapshots` (privado, signed URL).
- Salvar `map_snapshot_path` em `data.localizacao.snapshot_path`.
- Regerar automaticamente sempre que a CTO for reconfirmada.

**1.4 Pipeline de finalização robusto**
Fluxo atômico com estados intermediários e botão "Tentar novamente":
```text
salvar → confirmar loc → snapshot satélite → imagem resumo → PDF → link público + QR → finalizar
```
- Se falhar em qualquer etapa: manter status `finalizando_com_erro`, exibir botão para reprocessar sem refazer checklist.
- Sinalizar visualmente no card.

**1.5 PDF de Remapeamento (substitui stub atual)**
- Implementar `remapeamento-pdf.tsx` real, tema dark igual aos outros PDFs, incluindo:
  - Cabeçalho com RMAP, CTO, cidade, setor, técnico, data.
  - **Bloco "Localização da CTO"** com a imagem satélite (map_snapshot), lat/lng, link "Abrir no Google Maps".
  - Splitter, tabela de portas com cores TIA-598, fotos antes/depois, resultado.
- Imagem resumo (PNG) usa o mesmo snapshot — nunca captura mapa interativo.
- Link público + QR já reutilizam infra existente de snapshots.

---

## Fase 2 — Módulo Remapeamentos (correções)

Já existe rota `/remapeamentos`. Ajustar:
- Aba **Mapa** passa a usar Mapbox (mesmo estilo satélite), lê `data.localizacao.cto`, InfoWindow com "Ver Remapeamento".
- Aba **Lista** e **Indicadores**: adicionar filtros por ano, cidade, técnico, provider (já existente). Garantir que indicadores do dashboard reflitam.
- Adicionar link "Mapa de CTOs" no dashboard principal.

---

## Fase 3 — Intervenções de Rede (Rompimento / Readequação / Melhoria de Sinal)

**3.1 Schema**
- Adicionar 3 novos valores ao enum `checklist_tipo`: `rompimento`, `readequacao`, `melhoria_sinal`.
- `empty_checklist_revision_data` retorna estruturas específicas por tipo.
- Novos códigos via triggers (paralelos ao `assign_rmap_code`):
  - `RPT-YYYY-XXXX`, `RDEA-YYYY-XXXX`, `MSIG-YYYY-XXXX` (sequência por provedor+ano).
- Coluna `intervention_code text` + índice único parcial `(provider_id, intervention_code)`.

**3.2 Estrutura de dados por tipo** (jsonb em `dados`)
- Comum: `mapa.pontos[]` (tipo, id, lat, lng, sequência, observação, foto_id, técnico, timestamp), `mapa.rota_antes` e `mapa.rota_depois` (GeoJSON LineString), `otdr.antes[]`, `otdr.depois[]`, `laudos[]` (PDFs anexos preservados), `evidencias.antes[]`, `evidencias.depois[]`, `fechamento_hubsoft {ia, editado}`.
- Rompimento/Readequação: `motivo`, `cabo`, `qtd_fibras`, `ctos_afetadas`, `equipe`, `caixas[]` (entrada/saída/FO/fusões/passantes/reservas/rompidas/fotos).
- Melhoria Sinal: `motivo`, `medidas.antes {olt_tx, olt_rx, cto_entrada, cto_pos_splitter, ont_rx, ont_tx, retorno_olt}` e `medidas.depois`, cálculo automático `melhoria_db`.

**3.3 UI — form multi-etapas** (`intervencao-form.tsx`)
- Reaproveita layout do Remapeamento; renderiza etapas conforme tipo.
- Etapa Mapa: componente `MapaIntervencao` (Mapbox) — múltiplos pinos, arrastáveis, tipos configuráveis; para Readequação permite ordenar pontos e desenhar linha (GeoJSON) — antes/depois.
- Etapa Evidências: fotos antes/depois (bucket `evidencias` existente, nova `foto_categoria` se preciso).
- Etapa OTDR: múltiplas medições (1310/1550/1650), campos técnicos.
- Etapa Laudo OTDR: upload de PDFs originais → bucket novo `otdr-reports` (privado). Campo `fabricante` livre (VIAVI/EXFO/Yokogawa/...).
- Etapa Análise IA: botão "Analisar" → server fn `analyze-otdr.functions.ts` chama Lovable AI Gateway com PDFs + medições. Retorna eventos, perdas, PASS/FAIL, comparação antes/depois. Sem inventar.
- Etapa Cruzamento OTDR+Mapa: server fn compara distância do evento OTDR × rota; retorna status indicativo.
- Etapa Fechamento HubSoft: botão gera texto via IA baseado só em dados reais existentes; guarda `fechamento_ia` + `fechamento_editado`; botões Copiar / Editar / Regerar.

**3.4 Roteamento**
- Adicionar tipos no seletor de criação de checklist e no editor (`checklists.$id.tsx`).
- Suportar geração de PDF, imagem, link público e QR — reaproveitando pipeline da Fase 1.

**3.5 Módulo de acompanhamento**
- Nova rota `/intervencoes` com abas Lista, Mapa, Indicadores (mesmo padrão de `/remapeamentos`), filtro por tipo.

---

## Fase 4 — Dashboard + Housekeeping

- Cards adicionais no dashboard: remapeamentos (hoje/7d/mês/ano), CTOs remapeadas, portas ocupadas/livres, intervenções por tipo, melhoria média em dB.
- Ranking por técnico e cidade.
- Filtros: provedor, cidade, técnico, período.
- Atualizar menu principal com "Intervenções".
- Testes vitest para: cálculo de melhoria dB, geração de código, pipeline de snapshot com falha e retry.

---

## Detalhes técnicos

- **Migração 1** (Fase 1): remove exigência de cliente no data-shape (não altera schema; só form/lib), cria bucket `map-snapshots`.
- **Migração 2** (Fase 3): enum + coluna `intervention_code` + trigger + bucket `otdr-reports` + `foto_categoria` novas (`otdr_antes`, `otdr_depois`, `intervencao_antes`, `intervencao_depois`, `caixa_emenda`).
- **Connector Mapbox**: precisa do usuário linkar (pk. + sk.). Sem sk. não há snapshot; UI mostra aviso.
- **Sem contra-prova de cliente** em nenhum desses tipos (bloquear na UI).
- **Multi-provider**: tudo passa por RLS existente em `checklists` (`provider_id`).
- **Não tocar**: fluxo de Validação ONT, Instalação, Troca de ONT, contra-prova do cliente.

---

## Ordem de execução sugerida

1. Confirmar connector Mapbox linkado (pré-requisito da Fase 1.3+).
2. Fase 1 completa → validar em preview.
3. Fase 2.
4. Fase 3 (migração + form + acompanhamento).
5. Fase 4 (dashboard + testes).

**Pergunta antes de começar:** posso conectar o Mapbox agora e executar as **Fases 1 e 2 nesta rodada**, deixando Fases 3 e 4 (Intervenções + OTDR + IA + HubSoft) para as próximas rodadas? Ou prefere que eu tente empurrar tudo de uma vez?
