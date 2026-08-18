# Canal Ético — Canal de Denúncias (V1)

Módulo isolado dentro do CheckTécnico, com foco em anonimato real, sigilo e acompanhamento por protocolo + chave. Nada da operação técnica atual é alterado.

## Como vai funcionar

**Denunciante (sem login)**
1. Na tela de login aparece um bloco separado "Canal de Denúncias" com os botões *Fazer uma denúncia* e *Acompanhar denúncia*.
2. `/denuncia`: explicação curta, escolha entre anônima e identificada, e formulário em etapas — categoria, título, descrição, campos opcionais (unidade, cidade, setor, local, data/hora aproximada, envolvidos, testemunhas, frequência), anexos, revisão final com checkbox de confirmação.
3. Após enviar: tela com protocolo (`DEN-2026-XXXXXX`) e chave de acesso (`XXXX-XXXX`), com botões copiar, baixar comprovante PDF e ir para o acompanhamento. Aviso claro de que a chave não é recuperável.
4. `/denuncia/acompanhar`: protocolo + chave → status, linha do tempo pública, chat anônimo com o RH, envio de novas evidências e download do PDF atualizado.
5. `/denuncia/validar/$codigo`: página pública que confirma apenas protocolo, data de emissão e validade do documento.

**RH autorizado**
- Menu "Canal de Denúncias" visível só para quem tem permissão explícita.
- Dashboard com indicadores (por status, categoria, unidade, período, tempo médio até primeira análise e até conclusão) e filtros.
- Tela da denúncia: identificação (anônima/identificada), relato, evidências, mensagens, histórico, notas internas, responsável, prioridade, conclusão e "Gerar relatório completo PDF" marcado como CONFIDENCIAL — USO INTERNO.
- Toda visualização, mudança de status, nota, download e exportação fica registrada na trilha de auditoria.

## Estrutura de dados

Novas tabelas (todas com `provider_id`, RLS habilitada, GRANTs explícitos e **sem acesso anônimo direto**):

- `whistleblower_categories` — catálogo administrável, com as 16 categorias iniciais via seed.
- `whistleblower_reports` — protocolo, `access_key_hash` (hash + salt, nunca texto puro), tipo (ANONYMOUS/IDENTIFIED), categoria, título, descrição, unidade/cidade/setor/local, data e hora aproximadas, envolvidos, testemunhas, frequência, status, prioridade, campos de identificação opcionais, responsável interno, conclusão, timestamps. Em denúncias anônimas nenhum campo de identificação, `user_id`, IP bruto, device ou GPS é gravado.
- `whistleblower_attachments` — caminho no bucket privado, nome exibido, mime, tamanho, origem (denunciante/RH).
- `whistleblower_messages` — `report_id`, `sender_type` (REPORTER | RH), texto, `created_at`, `read_at`, anexo opcional; `user_id` só é gravado para mensagens do RH.
- `whistleblower_status_history` — movimentações com flag `is_public` (o denunciante só vê as públicas).
- `whistleblower_internal_notes` — exclusivo do RH.
- `whistleblower_access_logs` — usuário do RH, denúncia, ação, data/hora.
- `whistleblower_settings` — configurações por provedor.
- `whistleblower_access` — concessão explícita da permissão, no mesmo padrão já usado pelo módulo de avaliação técnica; nenhum papel existente (técnico, supervisor, NOC, admin comum) recebe acesso automático.

Bucket privado novo: `whistleblower-evidence`, sem policies públicas; download só por URL assinada de curta duração emitida pelo backend.

## Detalhes técnicos

- Rotas públicas `/denuncia`, `/denuncia/acompanhar`, `/denuncia/validar/$codigo` (SSR, fora de `_authenticated`); painel interno em `/canal-etico` e `/canal-etico/$id` sob `_authenticated`.
- Todo acesso público passa por server functions sem autenticação (`src/lib/whistleblower-public.functions.ts`) que usam o cliente privilegiado apenas depois de validar protocolo + chave; nenhuma tabela do módulo terá policy `TO anon`. Consulta só por protocolo é impossível por construção.
- Rate limiting server-side por protocolo e por IP com hash irreversível (janela curta, contador em tabela dedicada), bloqueando força bruta na consulta e limitando envios de novas denúncias.
- Upload validado no servidor: extensão + MIME + tamanho máximo + quantidade máxima, nome de arquivo aleatório; imagens passam por reencode no cliente (canvas) que descarta EXIF/GPS antes do envio.
- Protocolo e chave gerados com `crypto.getRandomValues`; a chave é comparada por hash com comparação de tempo constante.
- PDFs com `@react-pdf/renderer`, reutilizando o padrão dos documentos atuais: um público (comprovante, sem notas internas) e um interno confidencial. QR Code aponta para a página de validação.
- Funções internas do RH usam `requireSupabaseAuth` + verificação da permissão do canal; toda leitura/ação grava log de auditoria.
- UI dark alinhada ao CheckTécnico porém com identidade própria do Canal Ético (escudo, tons sóbrios), mobile-first, formulário progressivo, labels claros e alvos de toque grandes.

## Fora desta primeira entrega

- Notificações por e-mail ao denunciante (opt-in) — a estrutura fica preparada, mas o envio não entra na V1.
- CAPTCHA de terceiros: a V1 usa rate limiting + verificação leve própria; integração com um provedor externo pode ser adicionada depois, se você quiser.
