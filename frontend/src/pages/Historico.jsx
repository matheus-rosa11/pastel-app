import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pastelApp } from '@/api/pastelAppClient';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CheckCircle2, Clock, Clock3, XCircle, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDeliveryStatus } from '@/lib/deliveryStatus';

function getPreparationDurationLabel(t, pedido) {
  if (pedido.preparation_minutes == null) {
    return null;
  }

  return t('history.preparationTime', { count: pedido.preparation_minutes });
}

export default function Historico() {
  const qc = useQueryClient();
  const { t } = useTranslation();

  const getPedidoItemCounts = (pedido) =>
    (pedido.itens || []).reduce(
      (totals, item) => {
        const quantity = item.quantidade || 0;

        if ((item.status_item || 'ativo') === 'cancelado') {
          totals.cancelled += quantity;
          return totals;
        }

        totals.active += quantity;
        return totals;
      },
      { active: 0, cancelled: 0 }
    );

  const formatPedidoCount = ({ active, cancelled }) => {
    const activeLabel = t('common.pastelCount', { count: active });

    if (cancelled === 0) {
      return activeLabel;
    }

    return `${activeLabel}, ${t('common.cancelledCount', { count: cancelled })}`;
  };

  const statusConfig = {
    pendente: { label: t('status.pending'), class: 'bg-yellow-100 text-yellow-700', icon: Clock },
    pronto: { label: t('status.ready'), class: 'bg-green-100 text-green-700', icon: CheckCircle2 },
    cancelado: { label: t('status.cancelled'), class: 'bg-red-100 text-red-600', icon: XCircle },
  };

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos-historico'],
    queryFn: () => pastelApp.entities.Pedido.list('created_date', 500),
    refetchInterval: 15000,
  });

  const totalCounts = pedidos.reduce(
    (totals, pedido) => {
      const pedidoCounts = getPedidoItemCounts(pedido);

      totals.active += pedidoCounts.active;
      totals.cancelled += pedidoCounts.cancelled;
      return totals;
    },
    { active: 0, cancelled: 0 }
  );

  const marcarPronto = useMutation({
    mutationFn: (id) => pastelApp.entities.Pedido.update(id, { status: 'pronto', delivery_status: 'pending_delivery' }),
    onSuccess: () => {
      qc.invalidateQueries(['pedidos-historico']);
      qc.invalidateQueries(['pedidos-fritagem']);
      qc.invalidateQueries(['pedidos-entregador']);
    },
  });

  const deliveryStatusConfig = {
    pending_delivery: { label: t('delivery.status.pending'), class: 'bg-amber-100 text-amber-700' },
    delivered: { label: t('delivery.status.delivered'), class: 'bg-emerald-100 text-emerald-700' },
    not_delivered: { label: t('delivery.status.notDelivered'), class: 'bg-slate-200 text-slate-700' },
  };

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
        <History className="text-primary" size={26} />
        <h1 className="text-2xl font-black text-foreground">{t('history.pageTitle')}</h1>
        <span className="ml-auto bg-muted text-muted-foreground text-sm font-black px-3 py-1 rounded-full">
          {formatPedidoCount(totalCounts)}
        </span>
      </div>

      {/* Legenda de status */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <span key={key} className={`text-xs font-bold px-3 py-1 rounded-full ${cfg.class}`}>{cfg.label}</span>
        ))}
      </div>

      {pedidos.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-xl font-black text-muted-foreground">{t('history.empty')}</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-md border border-border overflow-hidden">
          <Accordion type="multiple" className="divide-y divide-border">
            {pedidos.map((pedido) => {
              const cfg = statusConfig[pedido.status] || statusConfig.pendente;
              const StatusIcon = cfg.icon;
              const deliveryStatus = getDeliveryStatus(pedido);
              const pedidoCounts = getPedidoItemCounts(pedido);
              const preparationDurationLabel = getPreparationDurationLabel(t, pedido);
              const linhasPedido = (pedido.itens || []).flatMap((item) =>
                Array.from({ length: item.quantidade }, (_, index) => ({
                  key: `${pedido.id}-${item.sabor_id ?? item.sabor_nome}-${item.status_item || 'ativo'}-${index}`,
                  saborNome: item.sabor_nome,
                  statusItem: item.status_item || 'ativo',
                }))
              );

              return (
                <AccordionItem
                  key={pedido.id}
                  value={pedido.id}
                  className={`${pedido.status === 'cancelado' ? 'opacity-60' : ''} border-b-0`}
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-lg text-primary">
                            {String(pedido.numero_pedido).padStart(3, '0')}
                          </span>
                          <span className="font-bold text-foreground truncate">{pedido.nome_cliente}</span>
                        </div>
                        <div className="mt-1 text-xs font-semibold text-muted-foreground">
                          <span>{formatPedidoCount(pedidoCounts)}</span>
                          {preparationDurationLabel && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-700">
                              <Clock3 size={11} />
                              <span>{preparationDurationLabel}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pr-2">
                        {pedido.order_kind === 'reserva' && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                            {t('status.reserved')}
                          </span>
                        )}
                        <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${cfg.class}`}>
                          <StatusIcon size={11} />
                          {cfg.label}
                        </span>
                        {deliveryStatus && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${deliveryStatusConfig[deliveryStatus].class}`}>
                            {deliveryStatusConfig[deliveryStatus].label}
                          </span>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="px-4 pb-4">
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
                        {t('history.itemsTitle')}
                      </div>
                      <div className="space-y-2">
                        {linhasPedido.map((linha) => {
                          const cancelado = linha.statusItem === 'cancelado';
                          const adicionado = linha.statusItem === 'adicionado';

                          return (
                          <div
                            key={linha.key}
                            className={`flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 border border-border ${
                              cancelado ? 'opacity-60' : ''
                            }`}
                          >
                            <span className={`font-semibold text-sm ${cancelado ? 'line-through text-muted-foreground' : ''}`}>
                              {linha.saborNome}
                            </span>
                            <div className="flex items-center gap-2">
                              {cancelado && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                                  {t('common.cancelled')}
                                </span>
                              )}
                              {adicionado && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                                  {t('common.added')}
                                </span>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}

      {/* Botões marcar pronto para pendentes */}
      {pedidos.some((p) => p.status === 'pendente') && (
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">{t('history.markReady')}</h2>
          <div className="flex flex-col gap-2">
            {pedidos
              .filter((p) => p.status === 'pendente' && p.order_kind === 'pedido')
              .map((pedido) => {
                const pedidoCounts = getPedidoItemCounts(pedido);
                return (
                  <div key={pedido.id} className="flex items-center justify-between bg-card rounded-xl border border-border px-4 py-3 shadow-sm">
                    <div>
                      <span className="font-black text-primary text-lg">{String(pedido.numero_pedido).padStart(3, '0')}</span>
                      <span className="font-bold text-foreground ml-2">{pedido.nome_cliente}</span>
                      <span className="ml-2 text-xs text-muted-foreground font-semibold">{formatPedidoCount(pedidoCounts)}</span>
                    </div>
                    <Button
                      size="sm"
                      className="bg-green-500 hover:bg-green-600 text-white font-bold gap-1"
                      onClick={() => marcarPronto.mutate(pedido.id)}
                      disabled={marcarPronto.isPending}
                    >
                      <CheckCircle2 size={15} /> {t('common.ready')}
                    </Button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}