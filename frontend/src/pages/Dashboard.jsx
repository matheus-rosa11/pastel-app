import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bike,
  ClipboardList,
  Flame,
  LayoutDashboard,
  Package,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { pastelApp } from '@/api/pastelAppClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getDeliveryStatus } from '@/lib/deliveryStatus';

const LOW_STOCK_THRESHOLD = 5;

function isToday(dateValue) {
  if (!dateValue) {
    return false;
  }

  const date = new Date(dateValue);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  );
}

function getActiveItemQuantity(pedido, item) {
  if (pedido.status === 'cancelado' || item.status_item === 'cancelado') {
    return 0;
  }

  return item.quantidade || 0;
}

function getCancelledItemQuantity(pedido, item) {
  if (pedido.status === 'cancelado') {
    return item.quantidade || 0;
  }

  return item.status_item === 'cancelado' ? item.quantidade || 0 : 0;
}

function formatOrderNumber(numeroPedido) {
  return String(numeroPedido || 0).padStart(3, '0');
}

function getOrderBadge(t, pedido) {
  if (pedido.status === 'cancelado') {
    return {
      label: t('status.cancelled'),
      className: 'bg-red-100 text-red-600',
    };
  }

  const deliveryStatus = getDeliveryStatus(pedido);
  if (deliveryStatus === 'pending_delivery') {
    return {
      label: t('delivery.status.pending'),
      className: 'bg-amber-100 text-amber-700',
    };
  }

  if (deliveryStatus === 'delivered') {
    return {
      label: t('delivery.status.delivered'),
      className: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (deliveryStatus === 'not_delivered') {
    return {
      label: t('delivery.status.notDelivered'),
      className: 'bg-slate-200 text-slate-700',
    };
  }

  if (pedido.status === 'pronto') {
    return {
      label: t('status.ready'),
      className: 'bg-green-100 text-green-700',
    };
  }

  return {
    label: t('status.pending'),
    className: 'bg-yellow-100 text-yellow-700',
  };
}

function MetricCard({ icon: Icon, label, value, hint, tone = 'primary' }) {
  const toneClasses = {
    primary: 'bg-primary/12 text-primary',
    amber: 'bg-amber-100 text-amber-700',
    green: 'bg-emerald-100 text-emerald-700',
    slate: 'bg-slate-200 text-slate-700',
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-black text-foreground">{value}</p>
            {hint && <p className="mt-2 text-sm font-semibold text-muted-foreground">{hint}</p>}
          </div>
          <div className={`rounded-2xl p-3 ${toneClasses[tone] || toneClasses.primary}`}>
            <Icon size={22} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RankedList({ items, emptyLabel, renderMeta }) {
  if (items.length === 0) {
    return <p className="text-sm font-semibold text-muted-foreground">{emptyLabel}</p>;
  }

  const maxValue = items[0]?.value || 1;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-bold text-foreground">{item.label}</span>
            <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">{renderMeta(item)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max((item.value / maxValue) * 100, 8)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();

  const { data: pedidos = [], isLoading: isLoadingPedidos } = useQuery({
    queryKey: ['pedidos-dashboard'],
    queryFn: () => pastelApp.entities.Pedido.list('-updated_date', 500),
    refetchInterval: 15000,
  });

  const { data: sabores = [], isLoading: isLoadingSabores } = useQuery({
    queryKey: ['sabores-dashboard'],
    queryFn: () => pastelApp.entities.Sabor.list('nome', 500),
    refetchInterval: 30000,
  });

  if (isLoadingPedidos || isLoadingSabores) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalOrders = pedidos.length;
  const ordersToday = pedidos.filter((pedido) => isToday(pedido.created_date)).length;
  const pendingKitchen = pedidos.filter((pedido) => pedido.status === 'pendente').length;
  const readyOrders = pedidos.filter((pedido) => pedido.status === 'pronto').length;
  const cancelledOrders = pedidos.filter((pedido) => pedido.status === 'cancelado').length;
  const pendingDelivery = pedidos.filter((pedido) => getDeliveryStatus(pedido) === 'pending_delivery').length;
  const deliveredOrders = pedidos.filter((pedido) => getDeliveryStatus(pedido) === 'delivered').length;
  const notDeliveredOrders = pedidos.filter((pedido) => getDeliveryStatus(pedido) === 'not_delivered').length;
  const activePastels = pedidos.reduce(
    (sum, pedido) => sum + (pedido.itens || []).reduce((itemSum, item) => itemSum + getActiveItemQuantity(pedido, item), 0),
    0
  );
  const cancelledPastels = pedidos.reduce(
    (sum, pedido) => sum + (pedido.itens || []).reduce((itemSum, item) => itemSum + getCancelledItemQuantity(pedido, item), 0),
    0
  );

  const kitchenResolvedRate = totalOrders > 0 ? Math.round(((readyOrders + cancelledOrders) / totalOrders) * 100) : 0;
  const deliveryResolvedBase = readyOrders > 0 ? readyOrders : 0;
  const deliveryResolvedRate = deliveryResolvedBase > 0
    ? Math.round(((deliveredOrders + notDeliveredOrders) / deliveryResolvedBase) * 100)
    : 0;
  const availableFlavors = sabores.filter((sabor) => sabor.disponivel).length;
  const lowStockFlavors = sabores
    .filter((sabor) => {
      const quantity = sabor.quantidade_disponivel ?? 0;
      return sabor.disponivel && quantity > 0 && quantity <= LOW_STOCK_THRESHOLD;
    })
    .sort((left, right) => (left.quantidade_disponivel ?? 0) - (right.quantidade_disponivel ?? 0));
  const outOfStockFlavors = sabores.filter((sabor) => (sabor.quantidade_disponivel ?? 0) === 0);
  const sensitiveFlavors = [
    ...outOfStockFlavors
      .map((sabor) => ({
        ...sabor,
        stockTone: 'out',
      })),
    ...lowStockFlavors
      .filter((sabor) => (sabor.quantidade_disponivel ?? 0) > 0)
      .map((sabor) => ({
        ...sabor,
        stockTone: 'low',
      })),
  ];
  const menuAvailabilityRate = sabores.length > 0 ? Math.round((availableFlavors / sabores.length) * 100) : 0;

  const flavorMap = new Map();
  const customerMap = new Map();

  pedidos.forEach((pedido) => {
    const activeQuantity = (pedido.itens || []).reduce((sum, item) => sum + getActiveItemQuantity(pedido, item), 0);
    const customerKey = (pedido.nome_cliente || t('dashboard.fallbackCustomer')).trim();
    const existingCustomer = customerMap.get(customerKey) || {
      id: customerKey.toLowerCase(),
      label: customerKey,
      value: 0,
      orders: 0,
    };

    existingCustomer.value += activeQuantity;
    existingCustomer.orders += 1;
    customerMap.set(customerKey, existingCustomer);

    (pedido.itens || []).forEach((item) => {
      const quantity = getActiveItemQuantity(pedido, item);
      if (!quantity) {
        return;
      }

      const flavorKey = item.sabor_nome || t('dashboard.fallbackFlavor');
      const existingFlavor = flavorMap.get(flavorKey) || {
        id: flavorKey.toLowerCase(),
        label: flavorKey,
        value: 0,
      };

      existingFlavor.value += quantity;
      flavorMap.set(flavorKey, existingFlavor);
    });
  });

  const topFlavors = Array.from(flavorMap.values())
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);

  const topCustomers = Array.from(customerMap.values())
    .sort((left, right) => {
      if (right.value === left.value) {
        return right.orders - left.orders;
      }

      return right.value - left.value;
    })
    .slice(0, 5);

  const recentOrders = [...pedidos]
    .sort((left, right) => new Date(right.updated_date || right.created_date) - new Date(left.updated_date || left.created_date))
    .slice(0, 6);

  const attentionItems = [
    {
      id: 'pending-kitchen',
      label: t('dashboard.attention.pendingKitchen'),
      count: pendingKitchen,
      path: '/fritagem',
      icon: Flame,
      visible: pendingKitchen > 0,
    },
    {
      id: 'pending-delivery',
      label: t('dashboard.attention.pendingDelivery'),
      count: pendingDelivery,
      path: '/entregador',
      icon: Bike,
      visible: pendingDelivery > 0,
    },
    {
      id: 'low-stock',
      label: t('dashboard.attention.lowStock'),
      count: lowStockFlavors.length,
      path: '/sabores',
      icon: AlertTriangle,
      visible: lowStockFlavors.length > 0,
    },
    {
      id: 'out-of-stock',
      label: t('dashboard.attention.outOfStock'),
      count: outOfStockFlavors.length,
      path: '/sabores',
      icon: Package,
      visible: outOfStockFlavors.length > 0,
    },
  ].filter((item) => item.visible);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/15 via-background to-amber-50 px-5 py-6 shadow-sm sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary p-3 text-primary-foreground shadow-lg">
                <LayoutDashboard size={26} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground sm:text-3xl">{t('dashboard.pageTitle')}</h1>
                <p className="mt-1 max-w-2xl text-sm font-semibold text-muted-foreground sm:text-base">
                  {t('dashboard.subtitle')}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link to="/pedidos" className="rounded-xl border border-border bg-background px-3 py-2 text-center text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary">
              {t('dashboard.quickActions.orders')}
            </Link>
            <Link to="/fritagem" className="rounded-xl border border-border bg-background px-3 py-2 text-center text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary">
              {t('dashboard.quickActions.frying')}
            </Link>
            <Link to="/entregador" className="rounded-xl border border-border bg-background px-3 py-2 text-center text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary">
              {t('dashboard.quickActions.delivery')}
            </Link>
            <Link to="/sabores" className="rounded-xl border border-border bg-background px-3 py-2 text-center text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary">
              {t('dashboard.quickActions.flavors')}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={ClipboardList}
          label={t('dashboard.metrics.totalOrders')}
          value={totalOrders}
          hint={t('common.pastelCount', { count: activePastels })}
        />
        <MetricCard
          icon={TrendingUp}
          label={t('dashboard.metrics.ordersToday')}
          value={ordersToday}
          hint={t('dashboard.metrics.cancelledPastels', { count: cancelledPastels })}
          tone="green"
        />
        <MetricCard
          icon={Flame}
          label={t('dashboard.metrics.pendingKitchen')}
          value={pendingKitchen}
          hint={t('dashboard.metrics.kitchenResolvedHint', { value: kitchenResolvedRate })}
          tone="amber"
        />
        <MetricCard
          icon={Bike}
          label={t('dashboard.metrics.awaitingDelivery')}
          value={pendingDelivery}
          hint={t('dashboard.metrics.deliveryResolvedHint', { value: deliveryResolvedRate })}
          tone="amber"
        />
        <MetricCard
          icon={UtensilsCrossed}
          label={t('dashboard.metrics.availableFlavors')}
          value={availableFlavors}
          hint={t('dashboard.metrics.availableFlavorsHint', {
            active: availableFlavors,
            total: sabores.length || 0,
          })}
          tone="green"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t('dashboard.sections.operationsTitle')}</CardTitle>
            <CardDescription>{t('dashboard.sections.operationsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-foreground">{t('dashboard.labels.kitchenResolved')}</span>
                <span className="text-sm font-black text-primary">{kitchenResolvedRate}%</span>
              </div>
              <Progress value={kitchenResolvedRate} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-foreground">{t('dashboard.labels.deliveryResolved')}</span>
                <span className="text-sm font-black text-primary">{deliveryResolvedRate}%</span>
              </div>
              <Progress value={deliveryResolvedRate} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{t('dashboard.labels.delivered')}</p>
                <p className="mt-2 text-2xl font-black text-foreground">{deliveredOrders}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{t('dashboard.labels.notDelivered')}</p>
                <p className="mt-2 text-2xl font-black text-foreground">{notDeliveredOrders}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{t('dashboard.labels.cancelledOrders')}</p>
                <p className="mt-2 text-2xl font-black text-foreground">{cancelledOrders}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t('dashboard.sections.inventoryTitle')}</CardTitle>
            <CardDescription>{t('dashboard.sections.inventoryDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-foreground">{t('dashboard.labels.menuAvailability')}</span>
                <span className="text-sm font-black text-primary">{menuAvailabilityRate}%</span>
              </div>
              <Progress value={menuAvailabilityRate} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-muted/50 p-4 text-center">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{t('dashboard.labels.available')}</p>
                <p className="mt-2 text-2xl font-black text-foreground">{availableFlavors}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4 text-center">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{t('dashboard.labels.lowStock')}</p>
                <p className="mt-2 text-2xl font-black text-foreground">{lowStockFlavors.length}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4 text-center">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{t('dashboard.labels.outOfStock')}</p>
                <p className="mt-2 text-2xl font-black text-foreground">{outOfStockFlavors.length}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{t('dashboard.labels.lowStockFlavors')}</p>
              {sensitiveFlavors.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{t('dashboard.empty.lowStock')}</p>
              ) : (
                <div className="space-y-2">
                  {sensitiveFlavors.slice(0, 5).map((sabor) => (
                    <div key={sabor.id} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                      <div>
                        <span className="text-sm font-bold text-foreground">{sabor.nome}</span>
                        <div className="mt-1">
                          <span className={`text-[11px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                            sabor.stockTone === 'out'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {sabor.stockTone === 'out' ? t('dashboard.labels.outOfStock') : t('dashboard.labels.lowStock')}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                        {t('flavors.list.units', { count: sabor.quantidade_disponivel ?? 0 })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t('dashboard.sections.topFlavorsTitle')}</CardTitle>
            <CardDescription>{t('dashboard.sections.topFlavorsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedList
              items={topFlavors}
              emptyLabel={t('dashboard.empty.noOrders')}
              renderMeta={(item) => t('dashboard.metrics.unitsSold', { count: item.value })}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t('dashboard.sections.topCustomersTitle')}</CardTitle>
            <CardDescription>{t('dashboard.sections.topCustomersDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedList
              items={topCustomers}
              emptyLabel={t('dashboard.empty.noCustomers')}
              renderMeta={(item) => `${t('dashboard.metrics.orderCount', { count: item.orders })}, ${t('common.pastelCount', { count: item.value })}`}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t('dashboard.sections.attentionTitle')}</CardTitle>
            <CardDescription>{t('dashboard.sections.attentionDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {attentionItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-sm font-semibold text-muted-foreground">
                {t('dashboard.empty.attention')}
              </div>
            ) : (
              <div className="space-y-3">
                {attentionItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="rounded-xl bg-primary/10 p-2 text-primary">
                          <Icon size={18} />
                        </div>
                        <span className="text-sm font-bold text-foreground">{item.label}</span>
                      </div>
                      <span className="text-lg font-black text-primary">{item.count}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t('dashboard.sections.recentTitle')}</CardTitle>
            <CardDescription>{t('dashboard.sections.recentDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-sm font-semibold text-muted-foreground">{t('dashboard.empty.noOrders')}</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((pedido) => {
                  const badge = getOrderBadge(t, pedido);
                  const itemCount = (pedido.itens || []).reduce((sum, item) => sum + getActiveItemQuantity(pedido, item), 0);

                  return (
                    <div key={pedido.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-primary">{formatOrderNumber(pedido.numero_pedido)}</span>
                          <span className="font-bold text-foreground truncate">{pedido.nome_cliente}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-muted-foreground">
                          {t('common.pastelCount', { count: itemCount })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}