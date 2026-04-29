const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export async function saveOrderPhoto(blob) {
  const formData = new FormData();
  formData.append('photo', blob, 'customer-photo.jpg');

  const response = await fetch(`${API_BASE_URL}/order-photos`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload photo.');
  }

  const payload = await response.json();
  return payload.id;
}

export async function getOrderPhotoBlob(photoId) {
  if (!photoId) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/order-photos/${photoId}`);
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to load photo.');
  }

  return response.blob();
}

export async function deleteOrderPhoto(photoId) {
  if (!photoId) {
    return;
  }

  await fetch(`${API_BASE_URL}/order-photos/${photoId}`, {
    method: 'DELETE',
  });
}