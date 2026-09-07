# Revisão de acesso e desempenho — CheckTécnico

Data: 07/09/2026. Repositório: `Rashnekami/webicheck`.

Base: `feat/auth-hardening-v2-2026-07-28`, commit `13c4698ef58d6cf681ffb336846530b1b8692e25` (04/09/2026). A `main` consultada permanece no commit de julho `4a855ac`; por isso não foi usada como base. O conteúdo inicial de trabalho foi conferido pelo hash da árvore Git `1ca790e4172e0362d4644dd8579a0fa2621d00ec`, idêntico ao remoto. A conexão exata do editor Lovable com a branch não foi consultada na plataforma.

## Resultado

Pacote de otimizações preparado para revisão, com migração aditiva. Nenhuma migração foi aplicada ao banco e nenhuma publicação em produção foi realizada.

A revisão mapeou uma base com 220 arquivos TypeScript/TSX, 36 arquivos de rotas TSX e 80 migrações. A inspeção concentrou-se nos fluxos compartilhados de autenticação, consultas, checklists, dashboard, relatórios, Postit, mapas, administração e configuração de build/PWA. Esse inventário não equivale a teste funcional de cada tela ou certificação integral de segurança.

## Mudanças implementadas

| Área | Problema encontrado | Mudança |
| --- | --- | --- |
| Entrada e navegação | Guard de acesso e componentes consultavam novamente usuário/perfil/provedor; erro temporário no perfil podia causar logout | Consulta compartilhada no React Query; acesso continua revalidado em cada navegação; erros de consulta chegam à tela de tentativa novamente |
| Troca de conta | Logout mantinha consultas privadas em memória; eventos repetidos de login invalidavam todo o sistema | Limpeza imediata do cache e cancelamento de consultas na troca de identidade/logout; eventos repetidos da mesma conta não geram recarga geral |
| Identidade | Perfil ausente recebia `active: true` no hook | Ausência de perfil não concede estado ativo |
| Checklists | `select('*')` baixava documentos e JSON completos; busca e paginação aconteciam depois no navegador | RPC com resumo de campos, pesquisa e filtro no banco; dez linhas por página; ordenação por data e UUID; cancelamento de buscas antigas e debounce de 300 ms |
| Pesquisa | Busca dependia dos registros já retornados pela API | Pesquisa sobre os registros autorizados no banco, incluindo técnico, OS, cliente, cidade, serial, código, ticket e CTO/RMAP; pontuação e `%` são tratados literalmente |
| Dashboard | Baixava rascunhos, revisões antigas, checklists de rede e JSON desnecessário; podia ficar limitado à primeira resposta da API | Filtros no banco para ONT/instalação finalizada e vigente; projeção de sintomas/NOC; paginação por UUID até o fim, inclusive com limite de API inferior ao lote |
| CSV | Exportação detalhada respeitava o período, mas ignorava os demais filtros ativos | Exporta os mesmos IDs do conjunto filtrado exibido no dashboard |
| PDF e ZIP | Bibliotecas grandes carregadas ao abrir telas | Importação no clique de exportação em checklists, revisões/dossiês, trocas ONT, avaliações, Canal Ético e ZIP do dashboard |
| Evidências | Uma chamada para assinar cada foto | Assinatura em lotes de até 100 caminhos distintos nos resolvedores de fotos; preserva URLs previamente autorizadas do dossiê |
| Postit e conta | Frontend admitia contas sem cidade técnica; middleware recusava as chamadas | Middleware específico para esses fluxos, com JWT verificado, usuário ativo e provedor válido; permissões de Postit continuam nos handlers; middleware técnico gerado permanece intacto |
| Postit | Busca de responsáveis percorria a lista inteira para cada item | Conjunto de IDs para verificação e leituras independentes de permissões em paralelo |
| Validação | Dois erros de tipo preexistentes em `ScreenOrientation.lock`; CI não executava testes | Tipagem da API opcional de orientação, testes unitários no CI e configuração Vitest independente dos plugins de hospedagem |

Ao finalizar/criar revisão/remover/criar checklist, as alterações correspondentes invalidam os indicadores e listas afetados. O cache da lista mantém a página anterior apenas enquanto troca de página com o mesmo usuário, provedor e filtros.

## Medição do JavaScript

Soma dos arquivos JavaScript da rota e de suas dependências estáticas, comprimidos individualmente com gzip, em kB decimais. Imports dinâmicos ficam fora dessa soma. Antes e depois foram medidos no mesmo ambiente e com as mesmas dependências instaladas.

| Tela | Antes | Depois | Redução |
| --- | ---: | ---: | ---: |
| Checklist individual | 970,4 kB | 336,6 kB | 65,3% |
| Trocas de ONT | 856,9 kB | 205,1 kB | 76,1% |
| Avaliação individual | 698,1 kB | 257,5 kB | 63,1% |
| Canal Ético individual | 678,3 kB | 239,5 kB | 64,7% |
| Dashboard | 391,8 kB | 362,2 kB | 7,6% |
| Painel inicial | 239,5 kB | 239,8 kB | acréscimo de 0,1% |

Isso mede dependências de abertura, não tempo real de carregamento, LCP, INP ou tráfego observado em produção. Bibliotecas de exportação continuam sendo baixadas quando necessárias. Cache do navegador, infraestrutura e dados reais alteram a experiência. Não foi calculado percentual de ganho das consultas ao banco sem dados reais e planos de execução.

Dados brutos: `docs/performance/bundle-before-2026-09-07.json` e `bundle-after-2026-09-07.json`. Reprodução: build limpo seguido de `node scripts/measure-route-js.mjs`. O script recusa múltiplos chunks da mesma rota para não misturar artefatos antigos.

## Validação e limites

- 37 testes unitários aprovados, incluindo isolamento de cache, resposta pendente após logout, eventos repetidos de login, usuário sem cidade, usuário inativo, provedor suspenso, token inválido, perfil ausente, falha temporária, paginação e erro em uma página intermediária.
- TypeScript sem erros, lint dos arquivos TypeScript alterados sem erros/avisos e build de produção aprovado. O build mantém avisos preexistentes de dependências/plugins.
- A nova função SQL não foi executada em PostgreSQL/Supabase nesta sessão. Os testes do cliente usam respostas simuladas e não substituem a validação da migração, RLS e plano SQL.
- A abertura visual local foi bloqueada pelo navegador do ambiente; o servidor de desenvolvimento também encontrou uma limitação ao consultar interfaces de rede. Não houve teste de navegação autenticada, assinatura visual, exportação ponta a ponta ou medição em celular real.

## Migração e homologação

Aplicar `supabase/migrations/20260907120000_checklist_list_performance.sql` em homologação antes do frontend. A nova tela depende da RPC. A migração cria três índices parciais e uma função `SECURITY INVOKER`; não altera políticas RLS nem usa `service_role` para a listagem. O resultado é submetido às políticas do usuário tanto em checklists quanto em perfis. `anon` e `PUBLIC` não recebem execução.

Em uma base representativa, verificar:

1. Técnico vendo seus checklists; supervisor/NOC/admin vendo apenas o escopo definido nas políticas; usuário de outro provedor sem acesso; conta/provedor inativo bloqueado; platform admin conforme regras existentes.
2. Lista com mais de 1.000 registros, busca por nome/CTO e pontuação, revisão antiga excluída, troca de aba, página após exclusão e contagem com todos os filtros.
3. Nome do técnico disponível no `LEFT JOIN` sob RLS; perfil não visível não pode remover um checklist autorizado da lista.
4. Entrada Google e interna, Postit sem cidade, troca obrigatória de senha, logout e entrada com outra conta no mesmo navegador.
5. PDFs dos tipos de checklist, dossiê, avaliações e Canal Ético, preservando todas as evidências e contra-provas.
6. `EXPLAIN (ANALYZE, BUFFERS)` das pesquisas e contagens. A pesquisa literal usa `strpos` e pode percorrer muitos registros; índices de texto ou busca dedicada devem ser escolhidos após essa medição.

Os índices são criados sem `CONCURRENTLY` para compatibilidade com migrações transacionais. Avaliar a duração/bloqueio de escrita em homologação antes de aplicá-los em uma tabela grande. Após aprovação, aplicar a migração no ambiente alvo e publicar pelo fluxo habitual. Para reverter o frontend, reverter o commit do PR; a função e os índices aditivos podem permanecer enquanto a necessidade de removê-los é avaliada.

## Pendências priorizadas da revisão

| Prioridade | Evidência | Próximo trabalho |
| --- | --- | --- |
| Alta | `getPostitWorkspace` limita itens a 500 antes de filtrar visibilidade, busca tabelas relacionadas inteiras e refaz esse trabalho no polling de 60 s | Filtrar visibilidade no banco antes de paginar; carregar histórico/comentários/anexos por item e substituir polling amplo por atualização incremental |
| Alta | `remapeamentos.tsx` e `intervencoes.tsx` têm limites fixos de 1.000; cobertura CTO também consulta conjuntos sem paginação completa | Paginação/consulta por área do mapa e agregações no banco; conferir contagens com volume acima do limite |
| Alta | Build observado gera `dist/sw.js`, mas o artefato de hospedagem é `.output/public`; aviso de precache sem arquivos | Corrigir integração PWA em mudança própria e validar instalação, atualização, offline e cache de conteúdo privado antes de ativar |
| Média | `listAdminUsers` varre todos os usuários de Auth e só depois filtra o provedor | Paginar pela base de perfis do provedor; buscar detalhes de autenticação quando necessários |
| Média | Dashboard ainda precisa de histórico completo dos campos analíticos para seletores, tendência e exportação | Agregações por período no banco e exportação separada; medir antes de mudar os indicadores |
| Média | Há múltiplos handlers com cliente administrativo e várias gerações de migrações de acesso | Testes de integração por papel, provedor, cidade e ID de recurso; confirmar no banco implantado quais políticas estão ativas |
| Média | Cache offline e armazenamento de evidências têm ciclo independente do cache de consultas | Validar retenção por identidade e comportamento de dispositivo compartilhado; a limpeza implementada aqui cobre React Query |
| Baixa | `inputValidator` obsoleto no build, plugin de paths redundante e instalação CI usando `npm install` por divergência histórica do lock | Atualizar APIs e sincronizar lock em alteração dedicada, validando compatibilidade Lovable/Cloudflare |

Referências de implementação: [paginação no TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries), [eventos de autenticação do Supabase](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) e [funções de banco e segurança](https://supabase.com/docs/guides/database/functions).
