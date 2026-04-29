import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { seedFlavors } from './seedFlavors.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function nowIso(value) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeFlavor(row) {
  return {
    ...row,
    created_date: nowIso(row.created_date),
    updated_date: nowIso(row.updated_date),
  };
}

function serializeOrder(orderRow, items = []) {
  return {
    ...orderRow,
    created_date: nowIso(orderRow.created_date),
    updated_date: nowIso(orderRow.updated_date),
    itens: items.map((item) => ({
      sabor_id: item.sabor_id,
      sabor_nome: item.sabor_nome,
      quantidade: item.quantidade,
      status_item: item.status_item || 'ativo',
    })),
  };
}

function normalizeItemStatus(status) {
  return status || 'ativo';
}

function effectiveItemTotals(status, items = []) {
  if (status === 'cancelado') {
    return new Map();
  }

  const totals = new Map();
  for (const item of items) {
    if (normalizeItemStatus(item.status_item) === 'cancelado') {
      continue;
    }

    const itemId = item.sabor_id;
    totals.set(itemId, (totals.get(itemId) || 0) + Number(item.quantidade || 0));
  }

  return totals;
}

async function adjustFlavorStocks(client, previousStatus, previousItems, nextStatus, nextItems) {
  const previousTotals = effectiveItemTotals(previousStatus, previousItems);
  const nextTotals = effectiveItemTotals(nextStatus, nextItems);
  const flavorIds = [...new Set([...previousTotals.keys(), ...nextTotals.keys()])];

  if (flavorIds.length === 0) {
    return;
  }

  const { rows } = await client.query(
    'SELECT id, quantidade_disponivel FROM flavors WHERE id = ANY($1) FOR UPDATE',
    [flavorIds],
  );

  const flavorRows = new Map(rows.map((row) => [row.id, row]));

  for (const flavorId of flavorIds) {
    const row = flavorRows.get(flavorId);
    if (!row) {
      throw new Error(`Sabor ${flavorId} não encontrado.`);
    }

    const previousQuantity = previousTotals.get(flavorId) || 0;
    const nextQuantity = nextTotals.get(flavorId) || 0;
    const delta = nextQuantity - previousQuantity;
    const nextAvailableQuantity = Number(row.quantidade_disponivel) - delta;

    if (nextAvailableQuantity < 0) {
      throw new Error('Quantidade indisponível para um dos sabores selecionados.');
    }

    await client.query(
      'UPDATE flavors SET quantidade_disponivel = $2, updated_date = NOW() WHERE id = $1',
      [flavorId, nextAvailableQuantity],
    );
  }
}

async function replaceOrderItems(client, orderId, items) {
  await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

  for (const item of items) {
    await client.query(
      `
        INSERT INTO order_items (id, order_id, sabor_id, sabor_nome, quantidade, status_item)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        randomUUID(),
        orderId,
        item.sabor_id,
        item.sabor_nome,
        Number(item.quantidade || 0),
        normalizeItemStatus(item.status_item),
      ],
    );
  }
}

async function fetchOrderItemsByOrderIds(client, orderIds) {
  if (orderIds.length === 0) {
    return new Map();
  }

  const { rows } = await client.query(
    `
      SELECT order_id, sabor_id, sabor_nome, quantidade, status_item
      FROM order_items
      WHERE order_id = ANY($1)
      ORDER BY created_at ASC
    `,
    [orderIds],
  );

  const itemsByOrderId = new Map();

  for (const row of rows) {
    const existing = itemsByOrderId.get(row.order_id) || [];
    existing.push(row);
    itemsByOrderId.set(row.order_id, existing);
  }

  return itemsByOrderId;
}

function buildOrderListQuery({ filters = {}, sortField = 'created_date', limit }) {
  const allowedSortFields = new Set(['created_date', 'updated_date', 'numero_pedido', 'nome_cliente', 'status']);
  const descending = sortField.startsWith('-');
  const rawField = descending ? sortField.slice(1) : sortField;
  const effectiveSortField = allowedSortFields.has(rawField) ? rawField : 'created_date';
  const whereClauses = [];
  const values = [];

  Object.entries(filters).forEach(([key, value]) => {
    if (value == null) {
      return;
    }

    values.push(value);
    whereClauses.push(`${key} = $${values.length}`);
  });

  const limitValue = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : null;
  if (limitValue) {
    values.push(limitValue);
  }

  return {
    text: `
      SELECT *
      FROM orders
      ${whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''}
      ORDER BY ${effectiveSortField} ${descending ? 'DESC' : 'ASC'}
      ${limitValue ? `LIMIT $${values.length}` : ''}
    `,
    values,
  };
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS flavors (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      disponivel BOOLEAN NOT NULL DEFAULT TRUE,
      quantidade_disponivel INTEGER NOT NULL DEFAULT 0,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_photos (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      blob BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      numero_pedido INTEGER NOT NULL,
      nome_cliente TEXT NOT NULL,
      customer_photo_id TEXT REFERENCES order_photos(id) ON DELETE SET NULL,
      delivery_status TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      sabor_id TEXT NOT NULL,
      sabor_nome TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      status_item TEXT NOT NULL DEFAULT 'ativo',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_flavors_nome ON flavors (nome);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
    CREATE INDEX IF NOT EXISTS idx_orders_created_date ON orders (created_date);
    CREATE INDEX IF NOT EXISTS idx_orders_updated_date ON orders (updated_date);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM flavors');
  if (rows[0].total > 0) {
    return;
  }

  for (const flavor of seedFlavors) {
    await pool.query(
      `
        INSERT INTO flavors (id, nome, descricao, disponivel, quantidade_disponivel)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), flavor.nome, flavor.descricao, flavor.disponivel, flavor.quantidade_disponivel],
    );
  }
}

export async function listFlavors({ sortField = 'nome', limit }) {
  const allowedSortFields = new Set(['nome', 'created_date', 'updated_date', 'quantidade_disponivel']);
  const descending = sortField.startsWith('-');
  const rawField = descending ? sortField.slice(1) : sortField;
  const effectiveSortField = allowedSortFields.has(rawField) ? rawField : 'nome';
  const values = [];
  const limitValue = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : null;
  if (limitValue) {
    values.push(limitValue);
  }

  const { rows } = await pool.query(
    `
      SELECT *
      FROM flavors
      ORDER BY ${effectiveSortField} ${descending ? 'DESC' : 'ASC'}
      ${limitValue ? `LIMIT $${values.length}` : ''}
    `,
    values,
  );

  return rows.map(serializeFlavor);
}

export async function createFlavor(payload) {
  const { rows } = await pool.query(
    `
      INSERT INTO flavors (id, nome, descricao, disponivel, quantidade_disponivel)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [
      randomUUID(),
      payload.nome,
      payload.descricao ?? null,
      payload.disponivel ?? true,
      Number(payload.quantidade_disponivel ?? 0),
    ],
  );

  return serializeFlavor(rows[0]);
}

export async function updateFlavor(id, updates) {
  const fields = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(updates, 'nome')) {
    values.push(updates.nome);
    fields.push(`nome = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'descricao')) {
    values.push(updates.descricao ?? null);
    fields.push(`descricao = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'disponivel')) {
    values.push(Boolean(updates.disponivel));
    fields.push(`disponivel = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'quantidade_disponivel')) {
    values.push(Number(updates.quantidade_disponivel ?? 0));
    fields.push(`quantidade_disponivel = $${values.length}`);
  }

  values.push(id);

  const { rows } = await pool.query(
    `
      UPDATE flavors
      SET ${fields.join(', ')}, updated_date = NOW()
      WHERE id = $${values.length}
      RETURNING *
    `,
    values,
  );

  if (rows.length === 0) {
    throw new Error(`Sabor ${id} não encontrado.`);
  }

  return serializeFlavor(rows[0]);
}

export async function deleteFlavor(id) {
  const { rowCount } = await pool.query('DELETE FROM flavors WHERE id = $1', [id]);
  if (rowCount === 0) {
    throw new Error(`Sabor ${id} não encontrado.`);
  }
}

export async function listOrders({ filters = {}, sortField = 'created_date', limit }) {
  const query = buildOrderListQuery({ filters, sortField, limit });
  const { rows } = await pool.query(query.text, query.values);
  const itemsByOrderId = await fetchOrderItemsByOrderIds(pool, rows.map((row) => row.id));

  return rows.map((row) => serializeOrder(row, itemsByOrderId.get(row.id) || []));
}

export async function createOrder(payload) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderId = randomUUID();
    const nextStatus = payload.status ?? 'pendente';
    const items = payload.itens ?? [];

    await adjustFlavorStocks(client, 'pendente', [], nextStatus, items);

    const { rows } = await client.query(
      `
        INSERT INTO orders (
          id,
          numero_pedido,
          nome_cliente,
          customer_photo_id,
          delivery_status,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        orderId,
        Number(payload.numero_pedido),
        payload.nome_cliente,
        payload.customer_photo_id ?? null,
        payload.delivery_status ?? null,
        nextStatus,
      ],
    );

    await replaceOrderItems(client, orderId, items);

    await client.query('COMMIT');
    return serializeOrder(rows[0], items);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateOrder(id, updates) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (orderRows.length === 0) {
      throw new Error(`Pedido ${id} não encontrado.`);
    }

    const currentOrder = orderRows[0];
    const { rows: currentItems } = await client.query(
      'SELECT sabor_id, sabor_nome, quantidade, status_item FROM order_items WHERE order_id = $1 ORDER BY created_at ASC',
      [id],
    );

    const nextOrder = {
      ...currentOrder,
      ...updates,
      status: updates.status ?? currentOrder.status,
      delivery_status: Object.prototype.hasOwnProperty.call(updates, 'delivery_status')
        ? updates.delivery_status
        : currentOrder.delivery_status,
      customer_photo_id: Object.prototype.hasOwnProperty.call(updates, 'customer_photo_id')
        ? updates.customer_photo_id
        : currentOrder.customer_photo_id,
    };

    const nextItems = updates.itens ?? currentItems;

    await adjustFlavorStocks(client, currentOrder.status, currentItems, nextOrder.status, nextItems);

    const fields = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(updates, 'numero_pedido')) {
      values.push(Number(updates.numero_pedido));
      fields.push(`numero_pedido = $${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'nome_cliente')) {
      values.push(updates.nome_cliente);
      fields.push(`nome_cliente = $${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'customer_photo_id')) {
      values.push(updates.customer_photo_id ?? null);
      fields.push(`customer_photo_id = $${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'delivery_status')) {
      values.push(updates.delivery_status ?? null);
      fields.push(`delivery_status = $${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      values.push(updates.status);
      fields.push(`status = $${values.length}`);
    }

    let updatedOrderRow = currentOrder;
    if (fields.length > 0) {
      values.push(id);
      const { rows } = await client.query(
        `
          UPDATE orders
          SET ${fields.join(', ')}, updated_date = NOW()
          WHERE id = $${values.length}
          RETURNING *
        `,
        values,
      );
      updatedOrderRow = rows[0];
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'itens')) {
      await replaceOrderItems(client, id, nextItems);
    }

    await client.query('COMMIT');
    return serializeOrder(updatedOrderRow, nextItems);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteOrder(id) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (orderRows.length === 0) {
      throw new Error(`Pedido ${id} não encontrado.`);
    }

    const { rows: currentItems } = await client.query(
      'SELECT sabor_id, sabor_nome, quantidade, status_item FROM order_items WHERE order_id = $1 ORDER BY created_at ASC',
      [id],
    );

    await adjustFlavorStocks(client, orderRows[0].status, currentItems, 'cancelado', []);
    await client.query('DELETE FROM orders WHERE id = $1', [id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function saveOrderPhoto({ buffer, mimeType }) {
  const { rows } = await pool.query(
    `
      INSERT INTO order_photos (id, mime_type, size_bytes, blob)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [randomUUID(), mimeType, buffer.length, buffer],
  );

  return rows[0].id;
}

export async function getOrderPhoto(photoId) {
  const { rows } = await pool.query(
    'SELECT id, mime_type, size_bytes, blob FROM order_photos WHERE id = $1',
    [photoId],
  );

  return rows[0] ?? null;
}

export async function deleteOrderPhoto(photoId) {
  await pool.query('DELETE FROM order_photos WHERE id = $1', [photoId]);
}

export async function closePool() {
  await pool.end();
}