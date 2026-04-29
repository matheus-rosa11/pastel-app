const localUser = {
  id: 'local-admin',
  name: 'Administrador Local',
  email: 'local@pastelapp.dev',
  role: 'admin',
};

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

async function apiRequest(path, { method = 'GET', body, headers, isFormData = false } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: isFormData ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body == null ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (!response.ok) {
    let message = 'Request failed.';
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function buildQuery(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

function createEntityApi(entityName) {
  const route = entityName === 'Pedido' ? '/orders' : '/flavors';

  return {
    async list(sortField, limit) {
      return apiRequest(`${route}${buildQuery({ sort: sortField, limit })}`);
    },

    async filter(filters, sortField, limit) {
      return apiRequest(`${route}${buildQuery({ ...filters, sort: sortField, limit })}`);
    },

    async create(payload) {
      return apiRequest(route, { method: 'POST', body: payload });
    },

    async update(id, updates) {
      return apiRequest(`${route}/${id}`, { method: 'PATCH', body: updates });
    },

    async delete(id) {
      await apiRequest(`${route}/${id}`, { method: 'DELETE' });
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