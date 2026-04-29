export function getDeliveryStatus(pedido) {
  if (pedido?.status !== 'pronto') {
    return null;
  }

  return pedido.delivery_status || 'pending_delivery';
}

export function isPendingDelivery(pedido) {
  return getDeliveryStatus(pedido) === 'pending_delivery';
}