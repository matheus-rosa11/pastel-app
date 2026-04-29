const STORAGE_PREFIX = 'pastelapp_local';

/** @typedef {'Pedido' | 'Sabor'} EntityName */
/** @typedef {Record<string, unknown>} EntityRecord */

const seedFlavors = [
  { nome: 'Carne', descricao: 'Carne moida temperada', quantidade_disponivel: 30, disponivel: true },
  { nome: 'Queijo', descricao: 'Mussarela derretida', quantidade_disponivel: 24, disponivel: true },
  { nome: 'Pizza', descricao: 'Mussarela, tomate e oregano', quantidade_disponivel: 20, disponivel: true },
  { nome: 'Frango com Catupiry', descricao: 'Frango desfiado com catupiry', quantidade_disponivel: 28, disponivel: true },
  { nome: 'Calabresa com Queijo', descricao: 'Calabresa acebolada com mussarela', quantidade_disponivel: 22, disponivel: true },
  { nome: 'Palmito', descricao: 'Palmito cremoso temperado', quantidade_disponivel: 16, disponivel: true },
  { nome: 'Milho com Bacon', descricao: 'Milho verde com bacon crocante', quantidade_disponivel: 18, disponivel: true },
  { nome: 'Chocolate', descricao: 'Chocolate ao leite cremoso', quantidade_disponivel: 18, disponivel: true },
  { nome: 'Banana com Canela', descricao: 'Banana caramelizada com canela', quantidade_disponivel: 14, disponivel: true },
  { nome: 'Romeu e Julieta', descricao: 'Queijo com goiabada', quantidade_disponivel: 12, disponivel: true },
];

const entityConfig = {
  Pedido: {
    storageKey: `${STORAGE_PREFIX}_pedidos`,
    defaultValues: {
      status: 'pendente',
      itens: [],
    },
  },
  Sabor: {
    storageKey: `${STORAGE_PREFIX}_sabores`,
    defaultValues: {
      disponivel: true,
      quantidade_disponivel: 0,
    },
  },
};

const localUser = {
  id: 'local-admin',
  name: 'Administrador Local',
  email: 'local@pastelapp.dev',
  role: 'admin',
};

function ensureBrowser() {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Local storage is not available in this environment.');
  }
}

/** @returns {EntityRecord[]} */
function createSeedFlavorRecords() {
  const now = new Date().toISOString();

  return seedFlavors.map((flavor) => ({
    ...entityConfig.Sabor.defaultValues,
    ...flavor,
    id: makeId('Sabor'),
    created_date: now,
    updated_date: now,
  }));
}

/** @param {EntityName} entityName */
function readCollection(entityName) {
  ensureBrowser();
  const { storageKey } = entityConfig[entityName];
  const raw = window.localStorage.getItem(storageKey);

  const seedIfNeeded = () => {
    if (entityName !== 'Sabor') {
      return [];
    }

    const seededRecords = createSeedFlavorRecords();
    writeCollection(entityName, seededRecords);
    return seededRecords;
  };

  if (!raw) {
    return seedIfNeeded();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return seedIfNeeded();
    }

    if (parsed.length === 0) {
      return seedIfNeeded();
    }

    return parsed;
  } catch {
    return seedIfNeeded();
  }
}

/**
 * @param {EntityName} entityName
 * @param {EntityRecord[]} records
 */
function writeCollection(entityName, records) {
  ensureBrowser();
  const { storageKey } = entityConfig[entityName];
  window.localStorage.setItem(storageKey, JSON.stringify(records));
}

/** @param {EntityName} entityName */
function makeId(entityName) {
  const normalizedName = entityName.toLowerCase();
  return `${normalizedName}_${crypto.randomUUID()}`;
}

/**
 * @param {EntityRecord[]} records
 * @param {string | undefined} sortField
 */
function sortRecords(records, sortField) {
  if (!sortField) {
    return [...records];
  }

  const descending = sortField.startsWith('-');
  const fieldName = descending ? sortField.slice(1) : sortField;

  return [...records].sort((left, right) => {
    const leftValue = left?.[fieldName];
    const rightValue = right?.[fieldName];

    if (leftValue == null && rightValue == null) {
      return 0;
    }
    if (leftValue == null) {
      return descending ? 1 : -1;
    }
    if (rightValue == null) {
      return descending ? -1 : 1;
    }

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return descending ? rightValue - leftValue : leftValue - rightValue;
    }

    const leftDate = Date.parse(String(leftValue));
    const rightDate = Date.parse(String(rightValue));
    if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) {
      return descending ? rightDate - leftDate : leftDate - rightDate;
    }

    const compareResult = String(leftValue).localeCompare(String(rightValue), 'pt-BR', {
      numeric: true,
      sensitivity: 'base',
    });

    return descending ? compareResult * -1 : compareResult;
  });
}

/**
 * @param {EntityRecord[]} records
 * @param {number | undefined} limit
 */
function limitRecords(records, limit) {
  if (typeof limit !== 'number' || Number.isNaN(limit) || limit <= 0) {
    return records;
  }

  return records.slice(0, limit);
}

/** @param {EntityName} entityName */
function createEntityApi(entityName) {
  const config = entityConfig[entityName];

  return {
    async list(sortField, limit) {
      const records = readCollection(entityName);
      return limitRecords(sortRecords(records, sortField), limit);
    },

    async filter(filters, sortField, limit) {
      const effectiveFilters = filters ?? {};
      const records = readCollection(entityName).filter((record) =>
        Object.entries(effectiveFilters).every(([key, value]) => record?.[key] === value)
      );

      return limitRecords(sortRecords(records, sortField), limit);
    },

    async create(payload) {
      const now = new Date().toISOString();
      const record = {
        ...config.defaultValues,
        ...payload,
        id: makeId(entityName),
        created_date: now,
        updated_date: now,
      };

      const records = readCollection(entityName);
      records.push(record);
      writeCollection(entityName, records);
      return record;
    },

    async update(id, updates) {
      let updatedRecord = null;
      const records = readCollection(entityName).map((record) => {
        if (record.id !== id) {
          return record;
        }

        updatedRecord = {
          ...record,
          ...updates,
          id: record.id,
          created_date: record.created_date,
          updated_date: new Date().toISOString(),
        };

        return updatedRecord;
      });

      if (!updatedRecord) {
        throw new Error(`${entityName} ${id} not found.`);
      }

      writeCollection(entityName, records);
      return updatedRecord;
    },

    async delete(id) {
      const records = readCollection(entityName);
      const remainingRecords = records.filter((record) => record.id !== id);

      if (remainingRecords.length === records.length) {
        throw new Error(`${entityName} ${id} not found.`);
      }

      writeCollection(entityName, remainingRecords);
      return { success: true };
    },
  };
}

export const pastelApp = {
  auth: {
    async me() {
      return localUser;
    },
    logout(redirectUrl = '/') {
      if (typeof window !== 'undefined') {
        window.location.href = redirectUrl;
      }
    },
    redirectToLogin(redirectUrl = '/') {
      if (typeof window !== 'undefined') {
        window.location.href = redirectUrl;
      }
    },
  },
  entities: {
    Pedido: createEntityApi('Pedido'),
    Sabor: createEntityApi('Sabor'),
  },
};