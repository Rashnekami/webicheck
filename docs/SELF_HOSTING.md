# WebiCheck fora do Lovable

O WebiCheck é uma aplicação TanStack Start com banco e autenticação Supabase. O código pode ser executado em qualquer serviço compatível com Node.js ou contêiner Docker; a publicação pelo Lovable não é requisito da arquitetura.

## Componentes

- Aplicação web e API: imagem criada pelo `Dockerfile`.
- Banco, autenticação e arquivos: Supabase Cloud ou Supabase self-hosted.
- HTTPS: proxy reverso como Caddy, Traefik ou Nginx.
- Backup: dump PostgreSQL, bucket de evidências e variáveis protegidas.

## Implantação em VM

1. Instale Docker e Docker Compose.
2. Crie `.env` a partir de `.env.example`.
3. Execute `docker compose -f compose.example.yml up -d --build`.
4. Configure o domínio HTTPS apontando para a porta 3000.
5. Cadastre a URL pública nos redirects permitidos do Supabase Auth e do Google OAuth.
6. Aplique as migrations do diretório `supabase/migrations` em ordem.

## Migração gradual

1. Suba um ambiente de homologação com outro domínio.
2. Restaure uma cópia anonimizada do banco e dos buckets.
3. Valide login Google/e-mail, PDFs, fotos, QR Code e integração com o Agent.
4. Reduza o TTL do DNS, coloque a produção em janela controlada e faça o backup final.
5. Troque o DNS e mantenha a versão anterior disponível para rollback.

Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no frontend. Ela deve existir apenas no runtime do servidor.
