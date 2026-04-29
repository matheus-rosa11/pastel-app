# PastelApp Monorepo

Repositorio organizado em dois servicos:

```text
frontend/  -> app React/Vite
backend/   -> API Express + Postgres
```

## Railway

Use o mesmo repositorio para os dois servicos, mudando apenas o `Root Directory`.

### Frontend

Recomendacao: criar como `Static Site` na Railway.

- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Start Command: nao precisa
- Variavel principal: `VITE_API_URL=https://SEU-BACKEND.up.railway.app/api`

### Backend

Criar como `Service` Node.js.

- Root Directory: `backend`
- Build Command: pode deixar automatico ou usar `npm install`
- Start Command: pode deixar automatico porque existe `npm start`
- Variaveis principais: `DATABASE_URL`, `CORS_ORIGIN`, `PORT`

### Postgres

Provisionar direto pela Railway e conectar o `DATABASE_URL` privado ao backend.

## Root Directory vs Start Command vs Watch Paths

- `Root Directory` e o principal no seu caso. E ele que diz qual pasta do monorepo cada servico vai usar.
- `Start Command` customizado nao e obrigatorio se o servico ja tem `package.json` com scripts corretos dentro do `Root Directory`.
- `Watch Paths` e opcional. Serve para evitar redeploy quando voce altera outra parte do monorepo.

Configuracao recomendada:

- Frontend: watch path `frontend/**`
- Backend: watch path `backend/**`

Se a Railway estiver respeitando bem o `Root Directory`, normalmente o deploy ja funciona sem customizar `Start Command`. Eu usaria `Watch Paths` so para reduzir rebuild desnecessario.

## Desenvolvimento local

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
npm install
npm run dev
```# PastelApp

Aplicacao React/Vite com backend Node.js e Postgres para operacao compartilhada entre multiplas instancias do app.

## Como rodar

Frontend em um terminal:

```bash
npm install
npm run dev
```

Backend em outro terminal:

```bash
npm install --prefix backend
npm run dev:backend
```

Por padrao, o frontend espera a API em `http://localhost:4000/api`.

Use `.env.example` na raiz para o frontend e `backend/.env.example` para o backend.

Para gerar build de producao:

```bash
npm run build
```

## Arquitetura

- Frontend React/Vite na raiz do repositorio.
- Backend Express/Postgres em `backend/`.
- Banco compartilhado via `DATABASE_URL`.
- Fotos armazenadas no Postgres e servidas sob demanda por endpoint dedicado.

## Railway

Estrutura recomendada no Railway:

1. Servico `frontend` apontando para este repositorio.
2. Servico `backend` usando a pasta `backend/`.
3. Banco Postgres provisionado pela Railway.

Variaveis principais:

- Frontend: `VITE_API_URL`
- Backend: `DATABASE_URL`, `CORS_ORIGIN`, `PORT`

No deploy do backend dentro da Railway, prefira `DATABASE_URL` privada do Postgres provisionado na propria plataforma.

## Fotos e desempenho

- A foto continua comprimida no cliente antes do upload, com limite de 1280px e JPEG com qualidade reduzida.
- As listagens de pedidos nao carregam o blob da foto; apenas o `customer_photo_id`.
- A foto so e baixada quando a UI realmente precisa exibi-la.
- Para um evento com cerca de 400 pedidos, esse modelo e suficiente para manter a interface fluida sem depender de storage externo.
- Se o volume crescer bastante depois, o proximo passo natural e mover fotos para object storage e manter apenas metadados no Postgres.

## O que mudou

- O cliente `src/api/pastelAppClient.js` agora fala com a API HTTP compartilhada.
- O armazenamento local de pedidos/sabores foi removido em favor do Postgres.
- O store de fotos `src/lib/orderPhotoStore.js` agora usa a API do backend.
- A logica de ajuste de estoque foi centralizada no backend para evitar divergencia entre caixas simultaneos.