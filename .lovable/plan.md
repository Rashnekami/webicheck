## Etapa 2 — Checklist de Validação de ONT

Nesta etapa entregamos o **primeiro (e por ora único) tipo de checklist**: *Validação de ONT*, exatamente como no modelo `.docx` enviado. Ele será fixo em código (não haverá construtor de formulários ainda — isso fica para uma etapa futura, se você quiser). O foco é: o técnico preenche pelo celular, finaliza, e o registro fica **imutável** para fiscalização.

### O que o técnico verá
- **Lista "Meus checklists"** com filtros por status: `Rascunho`, `Finalizado`.
- **Botão "+ Novo checklist"** → abre o formulário multi-seção (mobile-first):
  1. Identificação do atendimento (OS, data, hora, cliente, cidade, modelo, serial, CTO/porta)
  2. Sintoma confirmado em campo (checkboxes + "outro" + falha presenciada)
  3. Validação física
  4. Teste cabeado (com download/upload/ping)
  5. Teste Wi-Fi
  6. Evidências anexadas (checkboxes + upload de fotos)
  7. Resultado após reset/teste final
  8. Relato objetivo (texto longo)
  9. Registro da autorização do NOC (autorizado sim/não, analista, data, hora, protocolo)
- **Rascunho automático** (salva a cada alteração) — funciona mesmo com internet ruim (retry).
- **Finalizar** → confirmação, gera código de validação + timestamp, trava edição.
- **Baixar PDF** do checklist finalizado (layout igual ao modelo).

### O que o admin (você) verá
- **Painel** com contadores (total, no mês, por técnico, por cidade).
- **"Todos os checklists"** com filtros: técnico, cidade, período, status, OS/cliente/serial.
- Abrir qualquer checklist em modo leitura + baixar PDF.
- **Fiscalização**: registros finalizados não podem ser apagados nem alterados (nem por admin — apenas leitura + PDF).

### Banco de dados
- `checklists` — cabeçalho (id, tecnico_id, status `rascunho`/`finalizado`, os, cliente, cidade, modelo, serial, cto_porta, data_atendimento, hora_atendimento, código de validação, finalizado_em, criado_em, atualizado_em).
- `checklist_dados` — JSON com as respostas das seções 2 a 9 (flexível, permite ajustes finos sem migração).
- `checklist_fotos` — evidências (id, checklist_id, categoria: `etiqueta`/`leds`/`fonte`/`teste_cabeado`/`teste_wifi`/`outro`, storage_path, criado_em).
- **Storage bucket** `evidencias` (privado) com política: técnico só vê as próprias; admin vê tudo.
- **RLS**:
  - Técnico: SELECT/INSERT/UPDATE/DELETE apenas dos próprios rascunhos; SELECT dos próprios finalizados; **não pode** UPDATE/DELETE de finalizados.
  - Admin: SELECT em tudo; sem UPDATE/DELETE de finalizados (regra também no banco).

### PDF
Gerado no navegador com `@react-pdf/renderer` (sem dependência de servidor, funciona no Cloudflare Worker). Layout idêntico ao modelo: cabeçalho com logo Webifibra, 9 seções, rodapé com "Técnico / Data-hora / Assinatura eletrônica + código de validação". Fotos anexadas são incluídas ao final.

### Rotas novas
- `/_authenticated/checklists` — lista (técnico vê as suas / admin vê todas).
- `/_authenticated/checklists/novo` — criar (redireciona para `/checklists/:id`).
- `/_authenticated/checklists/:id` — editar (rascunho) ou visualizar (finalizado).
- `/_authenticated/checklists/:id/pdf` — pré-visualizar/baixar PDF.

### O que **não** entra nesta etapa
- Construtor visual de novos tipos de checklist (o modelo ONT é fixo em código).
- Gestão de usuários pelo admin (ativar/desativar, promover técnico) — fica para Etapa 3.
- Modo offline completo (PWA + fila de sync) — fica para Etapa 4, se necessário.

Ordem de implementação: 1) migração + storage, 2) telas de lista/criar/editar/visualizar, 3) upload de fotos, 4) finalização com código, 5) PDF. Confirma e eu já começo.
