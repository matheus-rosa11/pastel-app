# PastelApp Local

Aplicacao React/Vite adaptada para rodar localmente, sem dependencia da plataforma original.

## Como rodar

```bash
npm install
npm run dev
```

Para gerar build de producao:

```bash
npm run build
```

## Persistencia local

Os dados agora ficam no `localStorage` do navegador, usando estas chaves:

- `pastelapp_local_sabores`
- `pastelapp_local_pedidos`

Na primeira execucao, o app cria automaticamente um seed inicial de sabores para voce nao precisar cadastrar tudo a mao.

Se quiser resetar o ambiente, apague essas chaves no DevTools do navegador ou limpe o armazenamento do site.

Depois de limpar `pastelapp_local_sabores`, o seed sera aplicado novamente no proximo carregamento da aplicacao.

## O que mudou

- O cliente `src/api/pastelAppClient.js` foi substituido por um adaptador local compativel com a API usada nas telas.
- A autenticacao externa foi removida e o app passa a operar em modo local.
- O `vite.config.js` deixou de depender do plugin original e usa alias local para `@/`.