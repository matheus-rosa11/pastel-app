import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pastelApp } from '@/api/pastelAppClient';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronRight, Clock3, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

function truncateCustomerName(name, maxLength = 15) {
  if (!name) {
    return '';
  }

  return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name;
}

function formatQueueTimer(queuedAt, nowMs) {
  const queuedAtMs = new Date(queuedAt).getTime();

  if (!Number.isFinite(queuedAtMs)) {
    return '00:00:00';
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - queuedAtMs) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function Fritagem() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expandedFlavors, setExpandedFlavors] = useState(new Set());

  const toggleFlavor = (saborNome) => {
    setExpandedFlavors((prev) => {
      const next = new Set(prev);
      if (next.has(saborNome)) {
        next.delete(saborNome);
      } else {
        next.add(saborNome);
      }
      return next;
    });
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos-fritagem'],
    queryFn: () => pastelApp.entities.Pedido.filter({ status: 'pendente' }, 'created_date', 200),
    refetchInterval: 1000,
  });

  const marcarPronto = useMutation({
    mutationFn: (id) => pastelApp.entities.Pedido.update(id, { status: 'pronto', delivery_status: 'pending_delivery' }),
    onSuccess: () => {
      qc.invalidateQueries(['pedidos-fritagem']);
      qc.invalidateQueries(['pedidos-historico']);
      qc.invalidateQueries(['pedidos-entregador']);
    },
  });

  // Expande todos os itens em linhas individuais, mantendo ordem de criação do pedido
  // Itens cancelados aparecem taxados, adicionados aparecem com label
  const linhas = pedidos.flatMap((pedido) =>
    (pedido.itens || []).flatMap((item) =>
      Array.from({ length: item.quantidade }, (_, idx) => ({
        key: `${pedido.id}-${item.sabor_id}-${item.status_item || 'ativo'}-${idx}`,
        pedidoId: pedido.id,
        numeroPedido: String(pedido.numero_pedido).padStart(3, '0'),
        nomeCliente: pedido.nome_cliente,
        saborNome: item.sabor_nome,
        statusItem: item.status_item || 'ativo',
      }))
    )
  );

  // Conta apenas os ativos/adicionados para o badge de total
  const totalAtivos = linhas.filter((l) => l.statusItem !== 'cancelado').length;

  const pedidosOrdenados = [...pedidos].sort(
    (a, b) => new Date(a.created_date) - new Date(b.created_date)
  );

  const pedidoFlavorRows = pedidosOrdenados.flatMap((pedido) => {
    const flavorMap = new Map();
    linhas
      .filter((l) => l.pedidoId === pedido.id)
      .forEach((linha) => {
        if (!flavorMap.has(linha.saborNome)) {
          flavorMap.set(linha.saborNome, { saborNome: linha.saborNome, linhas: [] });
        }
        flavorMap.get(linha.saborNome).linhas.push(linha);
      });
    const flavors = Array.from(flavorMap.values());
    return flavors.map((g, idx) => ({
      ...g,
      pedidoId: pedido.id,
      numeroPedido: String(pedido.numero_pedido).padStart(3, '0'),
      nomeCliente: pedido.nome_cliente,
      isLastOfOrder: idx === flavors.length - 1,
      expandKey: `${pedido.id}-${g.saborNome}`,
    }));
  });

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
        <Flame className="text-accent" size={28} />
        <h1 className="text-2xl font-black text-foreground">{t('frying.pageTitle')}</h1>
        {totalAtivos > 0 && (
          <span className="ml-auto bg-primary text-primary-foreground text-sm font-black px-3 py-1 rounded-full">
            {t('common.pastelCount', { count: totalAtivos })}
          </span>
        )}
      </div>

      {linhas.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">✅</div>
          <p className="text-xl font-black text-muted-foreground">{t('frying.emptyTitle')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('frying.emptyDescription')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tabela de pastéis */}
          <div className="bg-card rounded-xl shadow-md border border-border overflow-hidden">
            <div className="bg-primary/10 grid grid-cols-[1fr_auto] px-4 py-2 border-b border-border">
              <span className="font-black text-xs uppercase tracking-widest text-primary">{t('common.flavor')}</span>
              <span className="font-black text-xs uppercase tracking-widest text-primary text-right">{t('common.order')}</span>
            </div>
            {pedidoFlavorRows.map((group, groupIndex) => {
              const activeCount = group.linhas.filter((l) => l.statusItem !== 'cancelado').length;
              const cancelledCount = group.linhas.filter((l) => l.statusItem === 'cancelado').length;
              const addedCount = group.linhas.filter((l) => l.statusItem === 'adicionado').length;
              const isExpanded = expandedFlavors.has(group.expandKey);
              return (
                <div
                  key={group.expandKey}
                  className={`border-b ${
                    group.isLastOfOrder ? 'border-b-2 border-orange-400/90' : 'border-border'
                  } last:border-0`}
                >
                  <button
                    type="button"
                    onClick={() => toggleFlavor(group.expandKey)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-primary/5 transition-colors ${groupIndex % 2 === 0 ? 'bg-card' : 'bg-muted/40'}`}
                  >
                    <span className="font-semibold text-sm text-foreground truncate">{group.saborNome}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-semibold text-sm text-foreground">{t('common.pastelCount', { count: activeCount })}</span>
                      {cancelledCount > 0 && (
                        <span className="text-xs font-black text-red-500">(-{cancelledCount})</span>
                      )}
                      {addedCount > 0 && (
                        <span className="text-xs font-black text-green-600">(+{addedCount})</span>
                      )}
                      <span className="font-black text-sm text-primary">{group.numeroPedido}</span>
                      <ChevronRight
                        size={16}
                        className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border/50">
                      {group.linhas.map((linha, lineIndex) => {
                        const cancelado = linha.statusItem === 'cancelado';
                        const adicionado = linha.statusItem === 'adicionado';
                        return (
                          <div
                            key={linha.key}
                            className={`grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr] pl-8 pr-4 py-2.5 border-b border-border/60 last:border-0 ${cancelado ? 'opacity-50' : ''} ${lineIndex % 2 === 0 ? 'bg-muted/20' : 'bg-muted/40'}`}
                          >
                            <span className={`font-semibold text-sm ${cancelado ? 'line-through text-muted-foreground' : ''}`}>
                              {linha.saborNome}
                              {cancelado && <span className="ml-1 text-xs font-bold text-red-500" style={{ textDecoration: 'none' }}>({t('common.cancelled').toLowerCase()})</span>}
                              {adicionado && <span className="ml-1 text-xs font-bold text-primary">({t('common.added').toLowerCase()})</span>}
                            </span>
                            <div className="text-right">
                              <span className="font-black text-primary">{linha.numeroPedido}</span>
                              <span className="block text-[11px] text-muted-foreground font-semibold sm:hidden">
                                {truncateCustomerName(linha.nomeCliente)}
                              </span>
                              <span className="text-xs text-muted-foreground font-semibold ml-1 hidden sm:inline">– {linha.nomeCliente}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Botões de conclusão por pedido */}
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">{t('frying.markReady')}</h2>
            <div className="flex flex-col gap-2">
              <AnimatePresence>
                {pedidosOrdenados.map((pedido) => {
                  const totalItens = (pedido.itens || [])
                    .filter((i) => i.status_item !== 'cancelado')
                    .reduce((s, i) => s + i.quantidade, 0);
                  const queueTimer = formatQueueTimer(pedido.queued_at || pedido.created_date, nowMs);
                  return (
                    <motion.div
                      key={pedido.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: 50 }}
                      className="flex items-center justify-between bg-card rounded-xl border border-border px-4 py-3 shadow-sm"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-black text-primary text-lg">{String(pedido.numero_pedido).padStart(3, '0')}</span>
                          <span className="font-bold text-foreground">{pedido.nome_cliente}</span>
                          <span className="text-xs text-muted-foreground font-semibold">{t('common.pastelCount', { count: totalItens })}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-700">
                            <Clock3 size={12} />
                            <span>{queueTimer}</span>
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-green-500 hover:bg-green-600 text-white font-bold gap-1"
                        onClick={() => marcarPronto.mutate(pedido.id)}
                        disabled={marcarPronto.isPending}
                      >
                        <CheckCircle2 size={15} /> {t('common.ready')}
                      </Button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}