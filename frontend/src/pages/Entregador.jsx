import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Bike, CheckCircle2, Expand, ImageOff, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { pastelApp } from '@/api/pastelAppClient';
import { Button } from '@/components/ui/button';
import { deleteOrderPhoto, getOrderPhotoBlob } from '@/lib/orderPhotoStore';
import { isPendingDelivery } from '@/lib/deliveryStatus';

function OrderPhoto({ photoId, alt, className }) {
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    let isMounted = true;
    let objectUrl = '';

    async function loadPhoto() {
      if (!photoId) {
        setPhotoUrl('');
        return;
      }

      const blob = await getOrderPhotoBlob(photoId);
      if (!isMounted || !blob) {
        return;
      }

      objectUrl = URL.createObjectURL(blob);
      setPhotoUrl(objectUrl);
    }

    loadPhoto();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [photoId]);

  if (!photoUrl) {
    return null;
  }

  return <img src={photoUrl} alt={alt} className={className} />;
}

function FullscreenPhotoModal({ pedido, onClose }) {
  const { t } = useTranslation();

  if (!pedido) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 p-4 flex items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="relative w-full max-w-5xl"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="absolute right-3 top-3 z-10 bg-black/60 text-white border-white/20 hover:bg-black/80 hover:text-white"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
        <OrderPhoto
          photoId={pedido.customer_photo_id}
          alt={pedido.nome_cliente}
          className="max-h-[85vh] w-full rounded-2xl object-contain"
        />
        <div className="mt-4 text-center text-white">
          <p className="text-2xl font-black">{t('delivery.orderLabel', { number: String(pedido.numero_pedido).padStart(3, '0') })}</p>
          <p className="text-lg font-semibold text-white/80">{pedido.nome_cliente}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConfirmDeliveryActionModal({ pedido, mode, onConfirm, onClose }) {
  const { t } = useTranslation();

  if (!pedido || !mode) {
    return null;
  }

  const isDelivered = mode === 'delivered';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 p-4 flex items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <AlertTriangle className="mx-auto mb-3 text-primary" size={36} />
        <h2 className="text-xl font-black text-foreground">{isDelivered ? t('delivery.confirmDelivered.title') : t('delivery.confirmNotDelivered.title')}</h2>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {t(isDelivered ? 'delivery.confirmDelivered.description' : 'delivery.confirmNotDelivered.description', {
            number: String(pedido.numero_pedido).padStart(3, '0'),
            name: pedido.nome_cliente,
          })}
        </p>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="button"
            className={`flex-1 font-bold ${isDelivered ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-slate-700 hover:bg-slate-800 text-white'}`}
            onClick={onConfirm}
          >
            {isDelivered ? t('delivery.confirmDelivered.confirm') : t('delivery.confirmNotDelivered.confirm')}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Entregador() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selectedPedido, setSelectedPedido] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos-entregador'],
    queryFn: () => pastelApp.entities.Pedido.filter({ status: 'pronto', order_kind: 'pedido' }, '-updated_date', 200),
    refetchInterval: 10000,
  });

  const atualizarEntrega = useMutation({
    mutationFn: async ({ id, deliveryStatus, photoId }) => {
      if (photoId) {
        await deleteOrderPhoto(photoId);
      }

      return pastelApp.entities.Pedido.update(id, {
        delivery_status: deliveryStatus,
        customer_photo_id: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries(['pedidos-entregador']);
      qc.invalidateQueries(['pedidos-historico']);
      setSelectedPedido(null);
      setPendingAction(null);
    },
  });

  const pedidosProntos = pedidos.filter((pedido) => isPendingDelivery(pedido));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bike className="text-primary" size={28} />
        <h1 className="text-2xl font-black text-foreground">{t('delivery.pageTitle')}</h1>
        <span className="ml-auto bg-primary text-primary-foreground text-sm font-black px-3 py-1 rounded-full">
          {t('delivery.readyCount', { count: pedidosProntos.length })}
        </span>
      </div>

      {pedidosProntos.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🛵</div>
          <p className="text-xl font-black text-muted-foreground">{t('delivery.emptyTitle')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('delivery.emptyDescription')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pedidosProntos.map((pedido, index) => (
            <motion.div
              key={pedido.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-md"
            >
              <div className="p-4 pb-3 border-b border-border bg-primary/5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">{t('delivery.orderLabel', { number: String(pedido.numero_pedido).padStart(3, '0') })}</p>
                <h2 className="mt-1 text-2xl font-black text-foreground leading-none">{pedido.nome_cliente}</h2>
                <p className="mt-2 text-sm font-semibold text-muted-foreground">{t('delivery.cardSubtitle')}</p>
              </div>

              <div className="p-4 space-y-4">
                {pedido.customer_photo_id ? (
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-2xl border border-border bg-muted/40 aspect-[4/5]">
                      <OrderPhoto
                        photoId={pedido.customer_photo_id}
                        alt={pedido.nome_cliente}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground font-semibold">{t('delivery.photoHint')}</p>
                    <Button type="button" className="w-full gap-2 font-bold" onClick={() => setSelectedPedido(pedido)}>
                      <Expand size={16} /> {t('delivery.openFullscreen')}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
                    <ImageOff className="mx-auto mb-3 text-muted-foreground" size={36} />
                    <p className="font-bold text-muted-foreground">{t('delivery.photoMissing')}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    className="flex-1 gap-2 font-bold bg-green-500 hover:bg-green-600 text-white"
                    onClick={() => setPendingAction({ pedido, mode: 'delivered' })}
                    disabled={atualizarEntrega.isPending}
                  >
                    <CheckCircle2 size={16} /> {t('delivery.markDelivered')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="px-3 text-xs font-bold text-muted-foreground"
                    onClick={() => setPendingAction({ pedido, mode: 'not_delivered' })}
                    disabled={atualizarEntrega.isPending}
                  >
                    {t('delivery.markNotDeliveredShort')}
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedPedido && (
          <FullscreenPhotoModal pedido={selectedPedido} onClose={() => setSelectedPedido(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pendingAction && (
          <ConfirmDeliveryActionModal
            pedido={pendingAction.pedido}
            mode={pendingAction.mode}
            onClose={() => setPendingAction(null)}
            onConfirm={() => atualizarEntrega.mutate({
              id: pendingAction.pedido.id,
              deliveryStatus: pendingAction.mode,
              photoId: pendingAction.pedido.customer_photo_id,
            })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}