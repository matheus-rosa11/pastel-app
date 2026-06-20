import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { seedFlavors } from './seedFlavors.js';

const { Pool } = pg;

const PREPARATION_HISTORY_SAMPLE_SIZE = 5;
const MINIMUM_PREPARATION_MINUTES = 10;
const FIXED_ESTIMATE_BUFFER_MINUTES = 5;

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
    order_kind: orderRow.order_kind || 'pedido',
    created_date: nowIso(orderRow.created_date),
    queued_at: nowIso(orderRow.queued_at),
    preparation_minutes: orderRow.preparation_minutes == null ? null : Number(orderRow.preparation_minutes),
    considered_preparation_minutes: orderRow.considered_preparation_minutes == null
      ? null
      : Number(orderRow.considered_preparation_minutes),
    pronto_at: nowIso(orderRow.pronto_at),
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

function countActiveItems(status, items = []) {
  let total = 0;

  if (status === 'cancelado') {
    return total;
  }

  for (const item of items) {
    if (normalizeItemStatus(item.status_item) === 'cancelado') {
      continue;
    }

    total += Number(item.quantidade || 0);
  }

  return total;
}

function calculatePreparationMetrics(queuedAt, prontoAt) {
  const queuedAtMs = new Date(queuedAt).getTime();
  const prontoAtMs = new Date(prontoAt).getTime();

  if (!Number.isFinite(queuedAtMs) || !Number.isFinite(prontoAtMs) || prontoAtMs < queuedAtMs) {
    return {
      preparationMinutes: null,
      consideredPreparationMinutes: null,
    };
  }

  const preparationMinutes = Math.max(0, Math.ceil((prontoAtMs - queuedAtMs) / 60000));

  return {
    preparationMinutes,
    consideredPreparationMinutes: Math.max(MINIMUM_PREPARATION_MINUTES, preparationMinutes),
  };
}

async function estimateOrderTotalMinutes(client, items = []) {
  const activeItemCount = countActiveItems('pendente', items);

  if (activeItemCount <= 0) {
    return MINIMUM_PREPARATION_MINUTES + FIXED_ESTIMATE_BUFFER_MINUTES;
  }

  const { rows } = await client.query(
    `
      WITH recent_ready_orders AS (
        SELECT id, considered_preparation_minutes
        FROM orders
        WHERE considered_preparation_minutes IS NOT NULL
          AND status <> 'cancelado'
        ORDER BY pronto_at DESC NULLS LAST
        LIMIT $1
      ),
      recent_order_item_counts AS (
        SELECT
          order_id,
          SUM(CASE WHEN status_item = 'cancelado' THEN 0 ELSE quantidade END)::int AS active_item_count
        FROM order_items
        WHERE order_id IN (SELECT id FROM recent_ready_orders)
        GROUP BY order_id
      ),
      recent_order_totals AS (
        SELECT
          SUM(recent_ready_orders.considered_preparation_minutes)::numeric AS total_minutes,
          SUM(recent_order_item_counts.active_item_count)::numeric AS total_items
        FROM recent_ready_orders
        INNER JOIN recent_order_item_counts
          ON recent_order_item_counts.order_id = recent_ready_orders.id
        WHERE recent_order_item_counts.active_item_count > 0
      )
      SELECT total_minutes / NULLIF(total_items, 0) AS average_minutes_per_item
      FROM recent_order_totals
    `,
    [PREPARATION_HISTORY_SAMPLE_SIZE],
  );

  const averageMinutesPerItem = Number(rows[0]?.average_minutes_per_item || 0);
  const estimatedPreparationMinutes = averageMinutesPerItem > 0 ? averageMinutesPerItem * activeItemCount : 0;
  const boundedPreparationMinutes = Math.max(MINIMUM_PREPARATION_MINUTES, estimatedPreparationMinutes);

  return Math.ceil(boundedPreparationMinutes + FIXED_ESTIMATE_BUFFER_MINUTES);
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
  const allowedSortFields = new Set(['created_date', 'updated_date', 'numero_pedido', 'nome_cliente', 'status', 'order_kind']);
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
      order_kind TEXT NOT NULL DEFAULT 'pedido',
      customer_photo_id TEXT REFERENCES order_photos(id) ON DELETE SET NULL,
      delivery_status TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      queued_at TIMESTAMPTZ,
      preparation_minutes INTEGER,
      considered_preparation_minutes INTEGER,
      pronto_at TIMESTAMPTZ,
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

  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ');
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_kind TEXT NOT NULL DEFAULT 'pedido'");
  await pool.query("UPDATE orders SET order_kind = 'pedido' WHERE order_kind IS NULL");
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS preparation_minutes INTEGER');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS considered_preparation_minutes INTEGER');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS pronto_at TIMESTAMPTZ');
  await pool.query('UPDATE orders SET queued_at = created_date WHERE queued_at IS NULL');
  await pool.query(`
    UPDATE orders
    SET
      preparation_minutes = GREATEST(0, CEIL(EXTRACT(EPOCH FROM (pronto_at - queued_at)) / 60.0)::int),
      considered_preparation_minutes = GREATEST(
        $1,
        GREATEST(0, CEIL(EXTRACT(EPOCH FROM (pronto_at - queued_at)) / 60.0)::int)
      )
    WHERE queued_at IS NOT NULL
      AND pronto_at IS NOT NULL
      AND (preparation_minutes IS NULL OR considered_preparation_minutes IS NULL)
  `, [MINIMUM_PREPARATION_MINUTES]);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_orders_queued_at ON orders (queued_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_orders_pronto_at ON orders (pronto_at)');

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
    const nextOrderKind = payload.order_kind === 'reserva' ? 'reserva' : 'pedido';
    const items = payload.itens ?? [];
    const queuedAt = nextStatus === 'pendente' && nextOrderKind === 'pedido' ? new Date() : null;

    await adjustFlavorStocks(client, 'pendente', [], nextStatus, items);

    const { rows } = await client.query(
      `
        INSERT INTO orders (
          id,
          numero_pedido,
          nome_cliente,
          order_kind,
          customer_photo_id,
          delivery_status,
          status,
          queued_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [
        orderId,
        Number(payload.numero_pedido),
        payload.nome_cliente,
        nextOrderKind,
        payload.customer_photo_id ?? null,
        payload.delivery_status ?? null,
        nextStatus,
        queuedAt,
      ],
    );

    await replaceOrderItems(client, orderId, items);

    const estimated_total_minutes = nextOrderKind === 'pedido'
      ? await estimateOrderTotalMinutes(client, items)
      : null;

    await client.query('COMMIT');
    return {
      ...serializeOrder(rows[0], items),
      estimated_total_minutes,
    };
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
      queued_at: currentOrder.queued_at,
      preparation_minutes: currentOrder.preparation_minutes,
      considered_preparation_minutes: currentOrder.considered_preparation_minutes,
      pronto_at: currentOrder.pronto_at,
      order_kind: currentOrder.order_kind || 'pedido',
      delivery_status: Object.prototype.hasOwnProperty.call(updates, 'delivery_status')
        ? updates.delivery_status
        : currentOrder.delivery_status,
      customer_photo_id: Object.prototype.hasOwnProperty.call(updates, 'customer_photo_id')
        ? updates.customer_photo_id
        : currentOrder.customer_photo_id,
    };

    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      if (updates.status === 'pendente') {
        nextOrder.queued_at = currentOrder.status === 'pendente' && currentOrder.queued_at
          ? currentOrder.queued_at
          : new Date();
        nextOrder.preparation_minutes = null;
        nextOrder.considered_preparation_minutes = null;
      }

      if (updates.status === 'pronto') {
        nextOrder.pronto_at = currentOrder.status === 'pronto' && currentOrder.pronto_at
          ? currentOrder.pronto_at
          : new Date();

        const preparationMetrics = calculatePreparationMetrics(nextOrder.queued_at, nextOrder.pronto_at);
        nextOrder.preparation_minutes = preparationMetrics.preparationMinutes;
        nextOrder.considered_preparation_minutes = preparationMetrics.consideredPreparationMinutes;
      } else {
        nextOrder.pronto_at = null;
      }
    }

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
    if (Object.prototype.hasOwnProperty.call(updates, 'order_kind')) {
      values.push(updates.order_kind === 'reserva' ? 'reserva' : 'pedido');
      fields.push(`order_kind = $${values.length}`);
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
      values.push(nextOrder.queued_at);
      fields.push(`queued_at = $${values.length}`);
      values.push(nextOrder.preparation_minutes);
      fields.push(`preparation_minutes = $${values.length}`);
      values.push(nextOrder.considered_preparation_minutes);
      fields.push(`considered_preparation_minutes = $${values.length}`);
      values.push(nextOrder.pronto_at);
      fields.push(`pronto_at = $${values.length}`);
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

export async function resetDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM order_items');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM order_photos');
    await client.query('DELETE FROM flavors');

    for (const flavor of seedFlavors) {
      await client.query(
        `
          INSERT INTO flavors (id, nome, descricao, disponivel, quantidade_disponivel)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [randomUUID(), flavor.nome, flavor.descricao, flavor.disponivel, flavor.quantidade_disponivel],
      );
    }

    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}