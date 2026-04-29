# PastelApp

Aplicacao React/Vite com backend Node.js e Postgres para operacao compartilhada entre multiplas instancias do app.

## Como rodar

Frontend em um terminal:

```bash
cd frontend
npm install
npm run dev
```

Backend em outro terminal:

```bash
cd backend
npm install
npm run dev
```

Por padrao, o frontend espera a API em `http://localhost:4000/api`.

Use `frontend/.env.example` para o frontend e `backend/.env.example` para o backend.

Para gerar build de producao:

```bash
cd frontend
npm run build
```

## Arquitetura

- Frontend React/Vite em `frontend/`.
- Backend Express/Postgres em `backend/`.
- Banco compartilhado via `DATABASE_URL`.
- Fotos armazenadas no Postgres e servidas sob demanda por endpoint dedicado.

## Railway

Estrutura recomendada no Railway:

1. Servico `frontend` usando a pasta `frontend/`.
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