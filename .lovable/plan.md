# Remapeamento de CTO/NAP — novo tipo de Checklist

## Princípio
Reaproveitar 100% da infraestrutura de Checklist já existente (rascunho/autosave, técnico, provedor, cidade, código público, fotos, versões, permissões, snapshots, PDF/dossiê, finalização). O remapeamento entra apenas como mais um valor no enum `checklist_tipo` e um novo formulário/documento dedicado.

## 1. Banco (migration única)

- `ALTER TYPE public.checklist_tipo ADD VALUE 'remapeamento_cto';`
- Atualizar `public.empty_checklist_revision_data(_tipo)` para retornar o shape vazio do remapeamento quando `_tipo = 'remapeamento_cto'`.
- Nada de tabela nova. Todo o conteúdo do remapeamento vive em `checklists.dados` (jsonb), como os demais tipos.
- Reusar bucket `evidencias` para foto ANTES / DEPOIS (mesmo fluxo do `checklist_fotos`, categoria `outro` com legenda `antes`/`depois`).

## 2. Schema TypeScript (`src/lib/checklist-schema.ts`)

Adicionar:
- `TipoChecklist` inclui `"remapeamento_cto"`.
- `TIPO_LABEL.remapeamento_cto = "Remapeamento de CTO/NAP"`.
- Interface `RemapeamentoData` com:
  - `identificacao`: setor, cto_codigo
  - `localizacao`: gps_original {lat,lng,accuracy_m,captured_at}, confirmada {lat,lng}, distancia_m
  - `splitter`: tipo (`1x4|1x8|1x16|outro`), tipo_outro, potencia_entrada_dbm
  - `alimentacao`: cabo, tubo, fibra, cor_fibra, origem, observacao
  - `portas`: array<{ numero, cor, cor_custom?, status (`ocupada|livre|nao_identificado`), cliente?, cliente_id?, potencia_dbm? }>
  - `fusao`: { necessaria: `sim|nao|null`, itens: [{ fibra, motivo, antes_dbm, depois_dbm }] }
  - `resultado`: { estado: `sim|parcialmente|null`, pendencia? }
- `emptyRemapeamentoData()` e ajuste em `emptyDadosFor`.
- Helper `FIBER_COLORS` (12 cores TIA-598) + `getFiberColor(portIndex)` com repetição cíclica.
- Helper `computeSplitterStats(data)` → ocupadas/livres/nao_id/média/melhor/pior/perda_média/delta.

## 3. UI — seleção do tipo (`checklists.index.tsx`)

Dialog "Qual checklist" ganha um terceiro card:
- Título: **Remapeamento de CTO/NAP**
- Ícone: `Network` (lucide) 
- Ao clicar: `create.mutate("remapeamento_cto")` — mesma função `createDraft` já usada.

Nenhuma outra alteração em listagem, filtros, exclusão, revisão — o novo tipo entra transparente.

## 4. Formulário (`src/components/checklist/remapeamento-form.tsx`)

Componente único mobile-first. Seções colapsáveis (accordion) para preenchimento rápido no celular:

1. **Identificação** — usa header padrão (cidade/tecnico/data/hora já reaproveitado do `ChecklistForm` header) + `setor` + `cto_codigo`. `useChecklistAutoFill` para data/hora.
2. **Localização da CTO** — botão "Capturar minha localização" (Geolocation API, `enableHighAccuracy`), depois `<MapPicker>` (ver abaixo) com marcador arrastável. Botão "Confirmar poste da CTO" grava `confirmada` + `distancia_m` (haversine).
3. **Foto ANTES** — reusar `PhotoUploader` já usado nos outros checklists, categoria `outro`, legenda automática `antes-cto`. Bloquear avanço enquanto não houver foto.
4. **Splitter** — Select 1x4/1x8/1x16/Outro → gera portas com cor default.
5. **Alimentação** — cabo, tubo, fibra, cor, origem, obs, `potencia_entrada_dbm`.
6. **Portas** — grid de cards compactos. Cada card mostra:
   - Bolinha 20px com a cor da fibra (background = hex) + rótulo textual da cor.
   - Select de cor (permite trocar caso o padrão diverja).
   - Radio status (Ocupada/Livre/Não identificado). Se ocupada → inputs cliente, id, potência dBm.
   - Borda/badge separada para status (vermelho se `potencia > (média+2σ)` — nunca sobrepõe a cor da fibra).
7. **Análise automática** — bloco readonly com stats de `computeSplitterStats`.
8. **Fusão** — Radio Sim/Não. Se Sim → lista dinâmica de itens.
9. **Foto DEPOIS** — igual ANTES; legenda `depois-cto`. Componente `AntesDepois` mostra as duas lado a lado.
10. **Finalização** — Sim/Parcialmente + campo pendência.
11. **Resumo** — card final antes do botão "Finalizar", com todos os dados agregados.

Autosave via mesma `updateChecklist` já usada. Botão finalizar chama a mesma `finalizeChecklist`.

### MapPicker (`src/components/checklist/map-picker.tsx`)
Google Maps JS via `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` (connector Google Maps Platform), `mapTypeId: 'hybrid'`, `google.maps.Marker` arrastável, sem `mapId`. Carregado dinamicamente (`React.lazy` + `<ClientOnly>`). Se a chave não estiver configurada, fallback texto "GPS: lat,lng — abrir no Google Maps".

Conector Google Maps já está listado como recomendado — se ainda não estiver linkado, chamar `standard_connectors--connect` após aprovação do plano.

## 5. Roteamento (`checklists.$id.tsx`)

Já é o mesmo arquivo pra todos os tipos. Adicionar:
```ts
if (checklist.tipo === "remapeamento_cto") return <RemapeamentoForm ... />;
```
Nenhuma nova rota.

## 6. Documento/PDF/Dossiê

- Novo `src/components/checklist/remapeamento-dark-document.tsx` no mesmo estilo dos `ValidationDarkDocument`/`InstallationDarkDocument` (tema dark neon):
  - Cabeçalho padrão (logo provedor, código público, técnico, data).
  - Bloco Localização com mini-mapa estático (Static Maps API via gateway) + coordenadas + precisão.
  - Foto ANTES.
  - Splitter + alimentação + potência de entrada.
  - **Tabela de portas** (Porta | Fibra [swatch+nome] | Status | Cliente | Potência).
  - Bloco análise (média/perda/melhor/pior).
  - Fusões, se houver.
  - Foto DEPOIS.
  - Status final + pendência.
- `checklist-document-view.tsx` roteia por tipo para o novo componente.
- `dossie-pdf.ts` inclui a seção quando `tipo=remapeamento_cto` (mesmo pipeline dos demais).
- `document-actions.tsx` — botão de imagem do técnico já funciona genericamente; contra-prova do cliente **não** se aplica ao remapeamento (esconder botão).

## 7. Dashboard/listagens

`checklists.index.tsx` já mostra badge do tipo — adicionar cor/ícone (`Network`) para `remapeamento_cto`. Sem mudanças em `dashboard-analytics` além de incluir o novo tipo nas contagens agregadas.

## 8. Testes rápidos

- `emptyDadosFor("remapeamento_cto")` retorna shape esperado.
- `computeSplitterStats` casos: todas livres, mistura, uma ocupada.
- `getFiberColor(0..15)` bate com sequência TIA-598 com repetição.

## Notas técnicas

- Sem novas tabelas — reduz risco em RLS/permissões (herda tudo de `checklists`).
- Fotos usam `checklist_fotos` existente (categoria `outro` + legenda semântica).
- Mapa carregado dinâmico para não quebrar SSR.
- Trigger `assign_ont_exchange_ticket` ignora este tipo automaticamente (`troca_realizada` nunca é true).
- Trigger de finalização (código público `WEBICHECK…`) já cobre qualquer tipo.

## Ordem de execução após aprovação

1. Migration (enum + função `empty_checklist_revision_data`).
2. Regenerar types Supabase (automático).
3. Schema TS + helpers de cor/stats.
4. Formulário + MapPicker + conectar Google Maps se necessário.
5. Documento dark + integração em view/dossiê.
6. Ajustes no picker de tipo e listagem.
7. Testes.
