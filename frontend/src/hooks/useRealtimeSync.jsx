import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_EVENTS_URL } from '@/api/pastelAppClient';

const ORDER_QUERY_KEYS = [
  ['pedidos'],
  ['pedidos-numeracao'],
  ['pedidos-dashboard'],
  ['pedidos-edicao'],
  ['pedidos-entregador'],
  ['pedidos-fritagem'],
  ['pedidos-historico'],
  ['pedidos-reservas'],
];

const FLAVOR_QUERY_KEYS = [
  ['sabores'],
  ['sabores-dashboard'],
];

export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return undefined;
    }

    const invalidateKeys = (keys) => {
      keys.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });
    };

    const eventSource = new EventSource(API_EVENTS_URL);

    const handleOrdersChanged = () => {
      invalidateKeys(ORDER_QUERY_KEYS);
      invalidateKeys(FLAVOR_QUERY_KEYS);
    };

    const handleFlavorsChanged = () => {
      invalidateKeys(FLAVOR_QUERY_KEYS);
    };

    eventSource.addEventListener('orders-changed', handleOrdersChanged);
    eventSource.addEventListener('flavors-changed', handleFlavorsChanged);

    return () => {
      eventSource.removeEventListener('orders-changed', handleOrdersChanged);
      eventSource.removeEventListener('flavors-changed', handleFlavorsChanged);
      eventSource.close();
    };
  }, [queryClient]);
}