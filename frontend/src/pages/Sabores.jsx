import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pastelApp } from '@/api/pastelAppClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export default function Sabores() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [form, setForm] = useState({ nome: '', descricao: '', quantidade_disponivel: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const { data: sabores = [] } = useQuery({
    queryKey: ['sabores'],
    queryFn: () => pastelApp.entities.Sabor.list('-created_date'),
  });

  const criar = useMutation({
    mutationFn: (data) => pastelApp.entities.Sabor.create(data),
    onSuccess: () => { qc.invalidateQueries(['sabores']); setForm({ nome: '', descricao: '', quantidade_disponivel: '' }); },
  });

  const atualizar = useMutation({
    mutationFn: ({ id, data }) => pastelApp.entities.Sabor.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['sabores']); setEditingId(null); },
  });

  const deletar = useMutation({
    mutationFn: (id) => pastelApp.entities.Sabor.delete(id),
    onSuccess: () => qc.invalidateQueries(['sabores']),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    criar.mutate({
      ...form,
      quantidade_disponivel: parseInt(form.quantidade_disponivel) || 0,
      disponivel: true,
    });
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditForm({
      nome: s.nome,
      descricao: s.descricao || '',
      disponivel: s.disponivel,
      quantidade_disponivel: s.quantidade_disponivel ?? 0,
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-foreground">{t('flavors.pageTitle')}</h1>

      {/* Formulário */}
      <form onSubmit={handleSubmit} className="bg-card rounded-xl shadow-md p-4 space-y-3 border border-border">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder={t('flavors.form.namePlaceholder')}
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="flex-1 font-semibold"
          />
          <Input
            placeholder={t('flavors.form.descriptionPlaceholder')}
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            className="flex-1"
          />
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">{t('flavors.form.availableQuantity')}</label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={form.quantidade_disponivel}
              onChange={(e) => setForm({ ...form, quantidade_disponivel: e.target.value })}
              className="w-full sm:w-36"
            />
          </div>
          <Button type="submit" className="bg-primary hover:bg-primary/90 font-bold gap-2 whitespace-nowrap w-full sm:w-auto">
            <Plus size={16} /> {t('common.add')}
          </Button>
        </div>
      </form>

      {/* Lista */}
      <div className="space-y-3">
        <AnimatePresence>
          {sabores.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-card rounded-xl shadow-sm border border-border p-4"
            >
              {editingId === s.id ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} className="flex-1 font-semibold" />
                    <Input value={editForm.descricao} onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })} className="flex-1" placeholder={t('flavors.form.description')} />
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">{t('flavors.form.availableQuantityShort')}</label>
                      <Input
                        type="number"
                        min="0"
                        value={editForm.quantidade_disponivel}
                        onChange={(e) => setEditForm({ ...editForm, quantidade_disponivel: parseInt(e.target.value) || 0 })}
                        className="w-28"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={editForm.disponivel} onCheckedChange={(v) => setEditForm({ ...editForm, disponivel: v })} />
                      <span className="text-sm font-semibold">{editForm.disponivel ? t('common.available') : t('common.unavailable')}</span>
                    </div>
                    <div className="flex gap-2 ml-auto">
                      <Button size="icon" className="bg-green-500 hover:bg-green-600 text-white" onClick={() => atualizar.mutate({ id: s.id, data: editForm })}><Check size={16} /></Button>
                      <Button size="icon" variant="outline" onClick={() => setEditingId(null)}><X size={16} /></Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">{s.nome}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.disponivel ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {s.disponivel ? t('common.available') : t('common.unavailable')}
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {t('flavors.list.units', { count: s.quantidade_disponivel ?? 0 })}
                      </span>
                    </div>
                    {s.descricao && <p className="text-sm text-muted-foreground mt-0.5">{s.descricao}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="icon" variant="outline" onClick={() => startEdit(s)}><Pencil size={15} /></Button>
                    <Button size="icon" variant="outline" className="text-destructive hover:text-destructive" onClick={() => deletar.mutate(s.id)}><Trash2 size={15} /></Button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {sabores.length === 0 && (
          <div className="text-center py-12 text-muted-foreground font-semibold">{t('flavors.empty')}</div>
        )}
      </div>
    </div>
  );
}