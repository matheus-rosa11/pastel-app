import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pastelApp } from '@/api/pastelAppClient';
import { Button } from '@/components/ui/button';
import { Plus, Minus, Pencil, XCircle, Check, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

function ConfirmCancelar({ pedido, onConfirm, onCancel }) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.85 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.85 }}
        className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center"
      >
        <AlertTriangle className="text-destructive mx-auto mb-3" size={40} />
        <h2 className="text-xl font-black mb-1">{t('editing.cancelModal.title')}</h2>
        <p className="text-muted-foreground font-semibold mb-6">
          {t('common.order')} <span className="text-primary font-black">{String(pedido.numero_pedido).padStart(3, '0')}</span> – {pedido.nome_cliente}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel}>{t('common.back')}</Button>
          <Button className="flex-1 bg-destructive hover:bg-destructive/90 text-white font-bold" onClick={onConfirm}>{t('editing.cancelModal.confirm')}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function EdicaoPedido() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [editandoId, setEditandoId] = useState(null);
  // editQtds: { [saborId]: quantidade } — apenas os ativos/adicionados (quantidade atual desejada)
  const [editQtds, setEditQtds] = useState({});
  const [confirmarCancelar, setConfirmarCancelar] = useState(null);

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos-edicao'],
    queryFn: () => pastelApp.entities.Pedido.filter({ status: 'pendente' }, 'created_date', 200),
  });

  const { data: sabores = [] } = useQuery({
    queryKey: ['sabores'],
    queryFn: () => pastelApp.entities.Sabor.list('nome'),
  });

  const atualizar = useMutation({
    mutationFn: async ({ pedido, novoItens }) => {
      // Calcular diferença de estoque por sabor
      // itens originais ativos (antes da edição)
      const itensOriginaisAtivos = (pedido.itens || []).filter(
        (i) => i.status_item !== 'cancelado'
      );
      const qtdOriginal = {};
      for (const i of itensOriginaisAtivos) {
        qtdOriginal[i.sabor_id] = (qtdOriginal[i.sabor_id] || 0) + i.quantidade;
      }
      // nova quantidade por sabor (apenas ativos/adicionados)
      const qtdNova = {};
      for (const i of novoItens) {
        if (i.status_item !== 'cancelado') {
          qtdNova[i.sabor_id] = (qtdNova[i.sabor_id] || 0) + i.quantidade;
        }
      }
      // Ajustar estoque: diferença = original - nova (positivo = devolver, negativo = consumir)
      const todosSaborIds = new Set([...Object.keys(qtdOriginal), ...Object.keys(qtdNova)]);
      for (const saborId of todosSaborIds) {
        const orig = qtdOriginal[saborId] || 0;
        const nova = qtdNova[saborId] || 0;
        const diff = orig - nova; // positivo = devolver ao estoque
        if (diff !== 0) {
          const sabor = sabores.find((s) => s.id === saborId);
          if (sabor) {
            const novaQtdDisp = Math.max(0, (sabor.quantidade_disponivel ?? 0) + diff);
            await pastelApp.entities.Sabor.update(saborId, { quantidade_disponivel: novaQtdDisp });
          }
        }
      }
      await pastelApp.entities.Pedido.update(pedido.id, { itens: novoItens });
    },
    onSuccess: () => {
      qc.invalidateQueries(['pedidos-edicao']);
      qc.invalidateQueries(['pedidos-fritagem']);
      qc.invalidateQueries(['pedidos-historico']);
      qc.invalidateQueries(['sabores']);
      setEditandoId(null);
    },
  });

  const cancelar = useMutation({
    mutationFn: async (pedido) => {
      await pastelApp.entities.Pedido.update(pedido.id, { status: 'cancelado' });
      // Devolver quantidades aos sabores (apenas itens que não foram cancelados individualmente)
      for (const item of pedido.itens || []) {
        if (item.status_item === 'cancelado') continue;
        const sabor = sabores.find((s) => s.id === item.sabor_id);
        if (sabor) {
          const novaQtd = (sabor.quantidade_disponivel ?? 0) + item.quantidade;
          await pastelApp.entities.Sabor.update(sabor.id, { quantidade_disponivel: novaQtd });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(['pedidos-edicao']);
      qc.invalidateQueries(['pedidos-fritagem']);
      qc.invalidateQueries(['pedidos-historico']);
      qc.invalidateQueries(['sabores']);
      setConfirmarCancelar(null);
    },
  });

  const startEdit = (pedido) => {
    setEditandoId(pedido.id);
    // Montar mapa de quantidades atuais (ativos + adicionados, ignorar cancelados)
    const qtds = {};
    for (const item of pedido.itens || []) {
      if (item.status_item !== 'cancelado') {
        qtds[item.sabor_id] = (qtds[item.sabor_id] || 0) + item.quantidade;
      }
    }
    setEditQtds(qtds);
  };

  const alterarQtd = (saborId, delta, sabor) => {
    setEditQtds((prev) => {
      const atual = prev[saborId] || 0;
      const dispAtual = sabor.quantidade_disponivel ?? 0;
      // Limite máximo = disponível + o que já está no pedido (pois o que está no pedido já foi consumido)
      const pedido = pedidos.find((p) => p.id === editandoId);
      const qtdNoPedido = (pedido?.itens || [])
        .filter((i) => i.sabor_id === saborId && i.status_item !== 'cancelado')
        .reduce((s, i) => s + i.quantidade, 0);
      const maxPermitido = dispAtual + qtdNoPedido;
      const nova = atual + delta;
      if (nova < 0) return prev;
      if (delta > 0 && atual >= maxPermitido) return prev; // não pode exceder disponível
      if (nova === 0) {
        const novoState = { ...prev };
        delete novoState[saborId];
        return novoState;
      }
      return { ...prev, [saborId]: nova };
    });
  };

  const salvarEdicao = (pedido) => {
    const itensOriginais = pedido.itens || [];

    // Para cada sabor no pedido original (não cancelados), calcular o que mudou
    // Estratégia: preservar itens originais com seus status_item, ajustando quantidades
    // e marcando como cancelado se removidos, adicionando novos com status 'adicionado'

    const novoItens = [];

    // Processar itens originais
    const saboresOriginais = new Set();
    for (const item of itensOriginais) {
      if (item.status_item === 'cancelado') {
        // Mantém cancelado
        novoItens.push({ ...item });
        continue;
      }
      saboresOriginais.add(item.sabor_id);
      const qtdNova = editQtds[item.sabor_id] || 0;
      if (qtdNova === 0) {
        // Foi removido — marca como cancelado
        novoItens.push({ ...item, status_item: 'cancelado' });
      } else if (qtdNova < item.quantidade) {
        // Quantidade reduzida: cancelar a diferença, manter restante como ativo
        const diff = item.quantidade - qtdNova;
        novoItens.push({ ...item, quantidade: qtdNova, status_item: item.status_item || 'ativo' });
        novoItens.push({ ...item, quantidade: diff, status_item: 'cancelado' });
      } else if (qtdNova > item.quantidade) {
        // Quantidade aumentada: manter original + adicionar diferença como 'adicionado'
        const diff = qtdNova - item.quantidade;
        novoItens.push({ ...item, status_item: item.status_item || 'ativo' });
        novoItens.push({ ...item, quantidade: diff, status_item: 'adicionado' });
      } else {
        // Mesma quantidade
        novoItens.push({ ...item, status_item: item.status_item || 'ativo' });
      }
    }

    // Novos sabores (não existiam no pedido original)
    for (const [saborId, qtd] of Object.entries(editQtds)) {
      if (!saboresOriginais.has(saborId) && qtd > 0) {
        const sabor = sabores.find((s) => s.id === saborId);
        novoItens.push({
          sabor_id: saborId,
          sabor_nome: sabor?.nome || saborId,
          quantidade: qtd,
          status_item: 'adicionado',
        });
      }
    }

    atualizar.mutate({ pedido, novoItens });
  };

  const saborDisponiveis = sabores.filter((s) => s.disponivel);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-foreground">{t('editing.pageTitle')}</h1>

      {pedidos.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-xl font-black text-muted-foreground">{t('editing.empty')}</p>
        </div>
      )}

      <div className="space-y-4">
        <AnimatePresence>
          {pedidos.map((pedido) => (
            <motion.div
              key={pedido.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-card rounded-xl border border-border shadow-md overflow-hidden"
            >
              {/* Cabeçalho */}
              <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-border">
                <div>
                  <span className="font-black text-primary text-lg">{String(pedido.numero_pedido).padStart(3, '0')}</span>
                  <span className="font-bold text-foreground ml-2">{pedido.nome_cliente}</span>
                </div>
                {editandoId !== pedido.id && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1 font-bold" onClick={() => startEdit(pedido)}>
                      <Pencil size={14} /> {t('common.edit')}
                    </Button>
                    <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-white font-bold gap-1" onClick={() => setConfirmarCancelar(pedido)}>
                      <XCircle size={14} /> {t('common.cancel')}
                    </Button>
                  </div>
                )}
              </div>

              {/* Modo visualização */}
              {editandoId !== pedido.id && (
                <div className="px-4 py-3 space-y-1">
                  {(pedido.itens || []).filter(i => i.status_item !== 'cancelado').map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm font-semibold">
                      <span>{item.sabor_nome}{item.status_item === 'adicionado' && <span className="text-xs text-primary ml-1">({t('common.added').toLowerCase()})</span>}</span>
                      <span className="text-primary font-black">{item.quantidade}x</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Modo edição */}
              {editandoId === pedido.id && (
                <div className="p-4 space-y-4">
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-wide">{t('editing.adjustFlavors')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {saborDisponiveis.map((s) => {
                      const qtdAtual = editQtds[s.id] || 0;
                      // Quantidade que já estava no pedido (não cancelados)
                      const qtdNoPedido = (pedido.itens || [])
                        .filter((i) => i.sabor_id === s.id && i.status_item !== 'cancelado')
                        .reduce((sum, i) => sum + i.quantidade, 0);
                      const dispAtual = s.quantidade_disponivel ?? 0;
                      const maxPermitido = dispAtual + qtdNoPedido;
                      const podeAumentar = qtdAtual < maxPermitido;

                      return (
                        <div key={s.id} className={`flex flex-col p-2.5 rounded-lg border-2 ${qtdAtual > 0 ? 'border-primary bg-primary/5' : 'border-border'}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">{s.nome}</span>
                            <div className="flex items-center gap-2">
                              <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => alterarQtd(s.id, -1, s)} disabled={qtdAtual === 0}>
                                <Minus size={13} />
                              </Button>
                              <span className={`w-6 text-center font-black text-sm ${qtdAtual > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{qtdAtual}</span>
                              <Button type="button" size="icon" variant="outline" className="h-7 w-7 border-primary text-primary" onClick={() => alterarQtd(s.id, 1, s)} disabled={!podeAumentar}>
                                <Plus size={13} />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${dispAtual > 0 || qtdNoPedido > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                              {t('common.availableCount', { count: dispAtual })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" className="gap-1 font-bold" onClick={() => setEditandoId(null)}>
                      <X size={14} /> {t('editing.cancelEditing')}
                    </Button>
                    <Button className="bg-green-500 hover:bg-green-600 text-white font-bold gap-1" onClick={() => salvarEdicao(pedido)}>
                      <Check size={14} /> {t('common.save')}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {confirmarCancelar && (
          <ConfirmCancelar
            pedido={confirmarCancelar}
            onConfirm={() => cancelar.mutate(confirmarCancelar)}
            onCancel={() => setConfirmarCancelar(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}