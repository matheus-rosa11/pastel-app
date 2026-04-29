const DB_NAME = 'pastelapp_local_assets';
const STORE_NAME = 'orderPhotos';
const DB_VERSION = 1;

function ensureIndexedDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('IndexedDB is not available in this environment.');
  }
}

function openDatabase() {
  ensureIndexedDb();

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open photo database.'));
    };
  });
}

async function withStore(mode, runRequest) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = runRequest(store);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Photo store request failed.'));
    };

    transaction.oncomplete = () => {
      database.close();
    };

    transaction.onerror = () => {
      reject(transaction.error || new Error('Photo store transaction failed.'));
    };
  });
}

export async function saveOrderPhoto(blob) {
  const record = {
    id: `photo_${crypto.randomUUID()}`,
    blob,
    createdAt: new Date().toISOString(),
  };

  await withStore('readwrite', (store) => store.put(record));
  return record.id;
}

export async function getOrderPhotoBlob(photoId) {
  if (!photoId) {
    return null;
  }

  const record = await withStore('readonly', (store) => store.get(photoId));
  return record?.blob ?? null;
}

export async function deleteOrderPhoto(photoId) {
  if (!photoId) {
    return;
  }

  await withStore('readwrite', (store) => store.delete(photoId));
}