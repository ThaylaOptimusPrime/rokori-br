# Rokori BR — Formulário de Admin + Backend

## O que já está pronto
- Formulário conectado ao backend em `POST /api/applications`.
- Candidaturas salvas em `data/applications.json`.
- Painel administrativo em `/admin`.
- Aprovar, recusar, deixar pendente e excluir candidaturas.
- Senha do painel configurável por variável de ambiente.
- Banner original mantido.

## Rodar no PC/servidor
1. Instale Node.js 18+.
2. Abra esta pasta no terminal.
3. Rode `npm install`.
4. Defina `ADMIN_PASSWORD` com uma senha forte.
5. Rode `npm start`.
6. Abra `/` para o formulário e `/admin` para o painel.

Exemplo de variável:
`ADMIN_PASSWORD=minha-senha-forte`

**Importante:** não coloque a senha do painel dentro do `index.html`. Ela deve ficar somente no ambiente do servidor.

## Publicar na internet
Este projeto está preparado para Render: o servidor escuta em `0.0.0.0` e usa a porta fornecida pela variável `PORT`.

No Render:
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variable: `ADMIN_PASSWORD` = sua senha

**Atenção:** o arquivo `data/applications.json` usa o disco local. Em serviços gratuitos com filesystem efêmero, candidaturas podem ser perdidas após reinícios/redeploys. Para uso real, migre as candidaturas para um banco de dados ou armazenamento persistente.
