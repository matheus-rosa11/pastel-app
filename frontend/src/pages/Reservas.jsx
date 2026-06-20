import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pastelApp } from '@/api/pastelAppClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookmarkCheck, Flame, Minus, Plus, Ticket, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function formatOrderNumber(orderNumber) {
  return String(orderNumber || 0).padStart(3, '0');
}

export default function Reservas() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [reservedBy, setReservedBy] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);

  const { data: flavors = [] } = useQuery({
    queryKey: ['sabores'],
    queryFn: () => pastelApp.entities.Sabor.list('nome'),
  });

  const { data: reservations = [] } = useQuery({
    queryKey: ['pedidos-reservas'],
    queryFn: () => pastelApp.entities.Pedido.filter({ order_kind: 'reserva' }, '-created_date', 300),
    refetchInterval: 10000,
  });

  const { data: numberingOrders = [] } = useQuery({
    queryKey: ['pedidos-numeracao'],
    queryFn: () => pastelApp.entities.Pedido.list('-created_date', 500),
  });

  const createReservation = useMutation({
    mutationFn: (payload) => pastelApp.entities.Pedido.create(payload),
    onSuccess: () => {
      qc.invalidateQueries(['pedidos-reservas']);
      qc.invalidateQueries(['sabores']);
      qc.invalidateQueries(['pedidos-numeracao']);
      qc.invalidateQueries(['pedidos-dashboard']);
      setReservedBy('');
      setSelectedItems([]);
    },
  });

  const cancelReservation = useMutation({
    mutationFn: (orderId) => pastelApp.entities.Pedido.update(orderId, { status: 'cancelado' }),
    onSuccess: () => {
      qc.invalidateQueries(['pedidos-reservas']);
      qc.invalidateQueries(['sabores']);
      qc.invalidateQueries(['pedidos-dashboard']);
      qc.invalidateQueries(['pedidos-fritagem']);
      qc.invalidateQueries(['pedidos-historico']);
    },
  });

  const fryReservation = useMutation({
    mutationFn: (orderId) => pastelApp.entities.Pedido.update(orderId, { status: 'pendente', delivery_status: null }),
    onSuccess: () => {
      qc.invalidateQueries(['pedidos-reservas']);
      qc.invalidateQueries(['pedidos-fritagem']);
      qc.invalidateQueries(['pedidos-historico']);
    },
  });

  const availableFlavors = useMemo(
    () => flavors.filter((flavor) => flavor.disponivel),
    [flavors]
  );

  const getQuantity = (flavorId) => selectedItems.find((item) => item.sabor_id === flavorId)?.quantidade || 0;

  const nextOrderNumber = () => {
    if (numberingOrders.length === 0) {
      return 1;
    }

    const maxNumber = Math.max(...numberingOrders.map((order) => order.numero_pedido || 0));
    return (maxNumber % 999) + 1;
  };

  const changeQuantity = (flavor, delta) => {
    setSelectedItems((previous) => {
      const existing = previous.find((item) => item.sabor_id === flavor.id);
      const availableQuantity = flavor.quantidade_disponivel ?? 0;

      if (!existing && delta > 0) {
        if (availableQuantity < 1) {
          return previous;
        }

        return [
          ...previous,
          {
            sabor_id: flavor.id,
            sabor_nome: flavor.nome,
            quantidade: 1,
            status_item: 'ativo',
          },
        ];
      }

      if (!existing) {
        return previous;
      }

      const nextQuantity = existing.quantidade + delta;
      if (nextQuantity <= 0) {
        return previous.filter((item) => item.sabor_id !== flavor.id);
      }

      if (delta > 0 && nextQuantity > availableQuantity) {
        return previous;
      }

      return previous.map((item) => (
        item.sabor_id === flavor.id
          ? { ...item, quantidade: nextQuantity }
          : item
      ));
    });
  };

  const totalPastels = selectedItems.reduce((sum, item) => sum + item.quantidade, 0);

  const submitReservation = (event) => {
    event.preventDefault();

    if (!reservedBy.trim() || selectedItems.length === 0) {
      return;
    }

    createReservation.mutate({
      nome_cliente: reservedBy.trim(),
      itens: selectedItems,
      numero_pedido: nextOrderNumber(),
      status: 'reservado',
      order_kind: 'reserva',
      delivery_status: null,
      customer_photo_id: null,
    });
  };

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <BookmarkCheck className="text-primary" size={28} />
        <h1 className="text-2xl font-black text-foreground">{t('reservations.pageTitle')}</h1>
      </div>

      <form onSubmit={submitReservation} className="space-y-5">
        <div className="rounded-xl border border-border bg-card p-4 shadow-md">
          <label className="mb-2 block text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {t('reservations.customerName')}
          </label>
          <Input
            placeholder={t('reservations.customerNamePlaceholder')}
            value={reservedBy}
            onChange={(event) => setReservedBy(event.target.value)}
            className="text-lg font-semibold"
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-md">
          <label className="mb-3 block text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {t('reservations.chooseFlavors')}
          </label>

          {availableFlavors.length === 0 && (
            <p className="text-sm font-semibold text-muted-foreground">{t('orders.noAvailableFlavors')}</p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {availableFlavors.map((flavor) => {
              const quantity = getQuantity(flavor.id);
              const availableQuantity = flavor.quantidade_disponivel ?? 0;

              return (
                <div
                  key={flavor.id}
                  className={`flex flex-col rounded-lg border-2 p-3 transition-all ${
                    quantity > 0 ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{flavor.nome}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => changeQuantity(flavor, -1)}
                        disabled={quantity === 0}
                      >
                        <Minus size={13} />
                      </Button>
                      <span className={`w-6 text-center text-sm font-black ${quantity > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {quantity}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 border-primary text-primary"
                        onClick={() => changeQuantity(flavor, 1)}
                        disabled={quantity >= availableQuantity}
                      >
                        <Plus size={13} />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${availableQuantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {t('common.availableCount', { count: availableQuantity })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedItems.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-secondary p-4">
            <p className="mb-2 text-sm font-bold uppercase tracking-wide text-secondary-foreground">
              {t('reservations.summary')}
            </p>
            {selectedItems.map((item) => (
              <div key={item.sabor_id} className="flex justify-between text-sm font-semibold">
                <span>{item.sabor_nome}</span>
                <span className="font-black text-primary">{item.quantidade}x</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-primary/20 pt-2 font-black">
              <span>{t('common.total')}</span>
              <span className="text-primary">{t('common.pastelCount', { count: totalPastels })}</span>
            </div>
          </div>
        )}

        <Button
          type="submit"
          disabled={!reservedBy.trim() || selectedItems.length === 0 || createReservation.isPending}
          className="w-full gap-2 py-6 text-lg font-black"
        >
          <Ticket size={20} /> {t('reservations.submit')}
        </Button>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-foreground">{t('reservations.listTitle')}</h2>

        {reservations.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <p className="font-semibold text-muted-foreground">{t('reservations.empty')}</p>
          </div>
        )}

        <div className="space-y-3">
          {reservations.map((reservation) => {
            const isCancelled = reservation.status === 'cancelado';
            const isReserved = reservation.status === 'reservado';
            const isFrying = reservation.status === 'pendente';
            const isFinished = reservation.status === 'pronto';
            const activeItems = (reservation.itens || []).filter((item) => item.status_item !== 'cancelado');
            const totalItems = activeItems.reduce((sum, item) => sum + (item.quantidade || 0), 0);

            return (
              <div
                key={reservation.id}
                className={`rounded-xl border bg-card p-4 shadow-sm ${isCancelled ? 'border-border/70 opacity-70' : 'border-border'}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                      {t('reservations.orderLabel', { number: formatOrderNumber(reservation.numero_pedido) })}
                    </p>
                    <p className="mt-1 text-lg font-black text-foreground">{reservation.nome_cliente}</p>
                    <p className="text-sm font-semibold text-muted-foreground">
                      {t('common.pastelCount', { count: totalItems })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isReserved && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">
                        {t('reservations.activeLabel')}
                      </span>
                    )}
                    {isFrying && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-amber-700">
                        {t('reservations.fryingLabel')}
                      </span>
                    )}
                    {isFinished && (
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-700">
                        {t('reservations.finishedLabel')}
                      </span>
                    )}
                    {isCancelled && (
                      <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-red-600">
                        {t('reservations.cancelledLabel')}
                      </span>
                    )}
                    {isReserved && (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1 bg-amber-500 font-bold text-white hover:bg-amber-600"
                        onClick={() => fryReservation.mutate(reservation.id)}
                        disabled={fryReservation.isPending}
                      >
                        <Flame size={14} /> {t('reservations.fryAction')}
                      </Button>
                    )}
                    {isReserved && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1 text-destructive hover:text-destructive"
                        onClick={() => cancelReservation.mutate(reservation.id)}
                        disabled={cancelReservation.isPending || fryReservation.isPending}
                      >
                        <XCircle size={14} /> {t('reservations.cancelAction')}
                      </Button>
                    )}
                  </div>
                </div>

                {activeItems.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">
                    {activeItems.map((item, index) => (
                      <div key={`${reservation.id}-${item.sabor_id}-${index}`} className="flex items-center justify-between text-sm font-semibold">
                        <span>{item.sabor_nome}</span>
                        <span className="font-black text-primary">{item.quantidade}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
