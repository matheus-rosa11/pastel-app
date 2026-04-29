import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import {
  closePool,
  createFlavor,
  createOrder,
  deleteFlavor,
  deleteOrder,
  deleteOrderPhoto,
  getOrderPhoto,
  initializeDatabase,
  listFlavors,
  listOrders,
  saveOrderPhoto,
  updateFlavor,
  updateOrder,
} from './database.js';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024,
  },
});

const port = Number(process.env.PORT || 4000);
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const asyncHandler = (handler) => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

app.use(cors({
  origin: allowedOrigins,
}));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/flavors', asyncHandler(async (request, response) => {
  const flavors = await listFlavors({
    sortField: request.query.sort,
    limit: request.query.limit,
  });

  response.json(flavors);
}));

app.post('/api/flavors', asyncHandler(async (request, response) => {
  const flavor = await createFlavor(request.body);
  response.status(201).json(flavor);
}));

app.patch('/api/flavors/:id', asyncHandler(async (request, response) => {
  const flavor = await updateFlavor(request.params.id, request.body);
  response.json(flavor);
}));

app.delete('/api/flavors/:id', asyncHandler(async (request, response) => {
  await deleteFlavor(request.params.id);
  response.status(204).send();
}));

app.get('/api/orders', asyncHandler(async (request, response) => {
  const filters = {};
  if (request.query.status) {
    filters.status = request.query.status;
  }

  const orders = await listOrders({
    filters,
    sortField: request.query.sort,
    limit: request.query.limit,
  });

  response.json(orders);
}));

app.post('/api/orders', asyncHandler(async (request, response) => {
  const order = await createOrder(request.body);
  response.status(201).json(order);
}));

app.patch('/api/orders/:id', asyncHandler(async (request, response) => {
  const order = await updateOrder(request.params.id, request.body);
  response.json(order);
}));

app.delete('/api/orders/:id', asyncHandler(async (request, response) => {
  await deleteOrder(request.params.id);
  response.status(204).send();
}));

app.post('/api/order-photos', upload.single('photo'), asyncHandler(async (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: 'Arquivo de foto é obrigatório.' });
    return;
  }

  const photoId = await saveOrderPhoto({
    buffer: request.file.buffer,
    mimeType: request.file.mimetype || 'image/jpeg',
  });

  response.status(201).json({ id: photoId });
}));

app.get('/api/order-photos/:id', asyncHandler(async (request, response) => {
  const photo = await getOrderPhoto(request.params.id);
  if (!photo) {
    response.status(404).send();
    return;
  }

  response.setHeader('Content-Type', photo.mime_type);
  response.setHeader('Content-Length', String(photo.size_bytes));
  response.setHeader('Cache-Control', 'private, max-age=300');
  response.send(photo.blob);
}));

app.delete('/api/order-photos/:id', asyncHandler(async (request, response) => {
  await deleteOrderPhoto(request.params.id);
  response.status(204).send();
}));

app.use((error, _request, response, _next) => {
  console.error(error);

  if (error?.message?.includes('não encontrado') || error?.message?.includes('not found')) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error?.message?.includes('indisponível') || error?.message?.includes('unavailable')) {
    response.status(409).json({ error: error.message });
    return;
  }

  response.status(500).json({ error: 'Erro interno do servidor.' });
});

async function start() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada.');
  }

  await initializeDatabase();

  app.listen(port, () => {
    console.log(`PastelApp backend listening on port ${port}`);
  });
}

start().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exit(1);
});