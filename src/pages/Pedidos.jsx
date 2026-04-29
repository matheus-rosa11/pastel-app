import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pastelApp } from '@/api/pastelAppClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, Plus, Minus, RefreshCcw, ShoppingBag, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { deleteOrderPhoto, getOrderPhotoBlob, saveOrderPhoto } from '@/lib/orderPhotoStore';

function PedidoPhotoPreview({ photoId, alt }) {
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

  return <img src={photoUrl} alt={alt} className="mx-auto mb-4 h-36 w-36 rounded-2xl object-cover border border-border shadow-md" />;
}

function ConfirmacaoPedido({ pedido, onClose }) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="bg-card rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl mb-4">🥟</div>
        <PedidoPhotoPreview photoId={pedido.customer_photo_id} alt={t('orders.camera.previewAlt', { name: pedido.nome_cliente })} />
        <h2 className="text-2xl font-black text-primary mb-1">{t('orders.confirmation.title')}</h2>
        <p className="text-muted-foreground font-semibold mb-4">{t('orders.confirmation.keepNumber', { name: pedido.nome_cliente })}</p>
        <div className="bg-primary/10 rounded-xl py-4 px-6 mb-6">
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{t('orders.confirmation.yourNumber')}</p>
          <p className="text-5xl font-black text-primary">{String(pedido.numero_pedido).padStart(3, '0')}</p>
          <p className="text-lg font-bold text-foreground mt-1">{pedido.nome_cliente}</p>
        </div>
        <Button onClick={onClose} className="w-full bg-primary hover:bg-primary/90 font-bold text-lg py-6">
          {t('common.close')}
        </Button>
      </motion.div>
    </motion.div>
  );
}

export default function Pedidos() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [nomeCliente, setNomeCliente] = useState('');
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [confirmacao, setConfirmacao] = useState(null);
  const [pedidoPendente, setPedidoPendente] = useState(null);
  const [isCaptureFlowOpen, setIsCaptureFlowOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedPhotoBlob, setCapturedPhotoBlob] = useState(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const { data: sabores = [] } = useQuery({
    queryKey: ['sabores'],
    queryFn: () => pastelApp.entities.Sabor.list('nome'),
  });

  const { data: pedidos = [] } = useQuery({
    queryKey: ['pedidos'],
    queryFn: () => pastelApp.entities.Pedido.list('-created_date', 100),
  });

  const criarPedido = useMutation({
    mutationFn: async ({ pedido, customerPhotoBlob }) => {
      let customerPhotoId = null;

      try {
        if (customerPhotoBlob) {
          customerPhotoId = await saveOrderPhoto(customerPhotoBlob);
        }

        const novo = await pastelApp.entities.Pedido.create({
          ...pedido,
          customer_photo_id: customerPhotoId,
        });

        for (const item of pedido.itens) {
          const sabor = sabores.find((s) => s.id === item.sabor_id);
          if (sabor) {
            const novaQtd = Math.max(0, (sabor.quantidade_disponivel ?? 0) - item.quantidade);
            await pastelApp.entities.Sabor.update(sabor.id, { quantidade_disponivel: novaQtd });
          }
        }

        return novo;
      } catch (error) {
        if (customerPhotoId) {
          await deleteOrderPhoto(customerPhotoId);
        }
        throw error;
      }
    },
    onSuccess: (novo) => {
      qc.invalidateQueries(['pedidos']);
      qc.invalidateQueries(['sabores']);
      stopCamera();
      setIsCaptureFlowOpen(false);
      setPedidoPendente(null);
      setConfirmacao(novo);
      setNomeCliente('');
      setItensSelecionados([]);
      setCapturedPhotoBlob(null);
      setCapturedPhotoUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }
        return '';
      });
      setCameraError('');
    },
  });

  useEffect(() => {
    if (!isCameraOpen || !videoRef.current || !streamRef.current) {
      return;
    }

    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {
      setCameraError(t('orders.camera.errorStart'));
    });
  }, [isCameraOpen, t]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
      if (capturedPhotoUrl) {
        URL.revokeObjectURL(capturedPhotoUrl);
      }
    };
  }, [capturedPhotoUrl]);

  useEffect(() => {
    if (!isCaptureFlowOpen) {
      return;
    }

    if (!capturedPhotoBlob && !isCameraOpen) {
      void abrirCamera();
    }
  }, [capturedPhotoBlob, isCameraOpen, isCaptureFlowOpen]);

  const saborDisponiveis = sabores.filter((s) => s.disponivel);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraOpen(false);
  };

  const limparFotoCapturada = () => {
    setCapturedPhotoBlob(null);
    updateCapturedPhotoUrl('');
  };

  const fecharFluxoCaptura = () => {
    stopCamera();
    limparFotoCapturada();
    setCameraError('');
    setPedidoPendente(null);
    setIsCaptureFlowOpen(false);
  };

  const updateCapturedPhotoUrl = (nextUrl) => {
    setCapturedPhotoUrl((currentUrl) => {
      if (currentUrl && currentUrl !== nextUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      return nextUrl;
    });
  };

  const getCameraErrorMessage = (error) => {
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
      return t('orders.camera.errorPermission');
    }

    if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
      return t('orders.camera.errorDevice');
    }

    return t('orders.camera.errorStart');
  };

  const abrirCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t('orders.camera.errorUnsupported'));
      return;
    }

    setCameraError('');
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });

      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch (error) {
      setCameraError(getCameraErrorMessage(error));
    }
  };

  const capturarFoto = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError(t('orders.camera.errorUnavailable'));
      return;
    }

    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / video.videoWidth, maxDimension / video.videoHeight);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError(t('orders.camera.errorUnavailable'));
      return;
    }

    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.82);
    });

    if (!blob) {
      setCameraError(t('orders.camera.errorUnavailable'));
      return;
    }

    setCapturedPhotoBlob(blob);
    updateCapturedPhotoUrl(URL.createObjectURL(blob));
    stopCamera();
  };

  const removerFoto = () => {
    limparFotoCapturada();
    setCameraError('');
    stopCamera();
    void abrirCamera();
  };

  const alterarQtd = (sabor, delta) => {
    setItensSelecionados((prev) => {
      const existe = prev.find((i) => i.sabor_id === sabor.id);
      const dispQtd = sabor.quantidade_disponivel ?? 0;
      if (!existe && delta > 0) {
        if (dispQtd < 1) return prev;
        return [...prev, { sabor_id: sabor.id, sabor_nome: sabor.nome, quantidade: 1, status_item: 'ativo' }];
      }
      if (existe) {
        const novaQtd = existe.quantidade + delta;
        if (novaQtd <= 0) return prev.filter((i) => i.sabor_id !== sabor.id);
        if (delta > 0 && novaQtd > dispQtd) return prev; // não excede disponível
        return prev.map((i) => i.sabor_id === sabor.id ? { ...i, quantidade: novaQtd } : i);
      }
      return prev;
    });
  };

  const getQtd = (saborId) => itensSelecionados.find((i) => i.sabor_id === saborId)?.quantidade || 0;

  const proximoNumero = () => {
    if (pedidos.length === 0) return 1;
    const max = Math.max(...pedidos.map((p) => p.numero_pedido || 0));
    return (max % 999) + 1;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nomeCliente.trim() || itensSelecionados.length === 0) return;

    limparFotoCapturada();
    setCameraError('');
    setPedidoPendente({
      nome_cliente: nomeCliente.trim(),
      itens: itensSelecionados,
      numero_pedido: proximoNumero(),
      status: 'pendente',
    });
    setIsCaptureFlowOpen(true);
  };

  const confirmarPedidoComFoto = () => {
    if (!pedidoPendente || !capturedPhotoBlob) {
      return;
    }

    criarPedido.mutate({
      pedido: pedidoPendente,
      customerPhotoBlob: capturedPhotoBlob,
    });
  };

  const confirmarPedidoSemFoto = () => {
    if (!pedidoPendente) {
      return;
    }

    criarPedido.mutate({
      pedido: pedidoPendente,
      customerPhotoBlob: null,
    });
  };

  const totalPasteis = itensSelecionados.reduce((s, i) => s + i.quantidade, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-foreground">{t('orders.pageTitle')}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Nome do cliente */}
        <div className="bg-card rounded-xl shadow-md border border-border p-4">
          <label className="block font-bold text-sm text-muted-foreground mb-2 uppercase tracking-wide">{t('orders.customerName')}</label>
          <Input
            placeholder={t('orders.customerNamePlaceholder')}
            value={nomeCliente}
            onChange={(e) => setNomeCliente(e.target.value)}
            className="text-lg font-semibold"
          />
        </div>

        {/* Seleção de sabores */}
        <div className="bg-card rounded-xl shadow-md border border-border p-4">
          <label className="block font-bold text-sm text-muted-foreground mb-3 uppercase tracking-wide">{t('orders.chooseFlavors')}</label>
          {saborDisponiveis.length === 0 && (
            <p className="text-muted-foreground text-sm font-semibold">{t('orders.noAvailableFlavors')}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {saborDisponiveis.map((s) => {
              const qtd = getQtd(s.id);
              const dispQtd = s.quantidade_disponivel ?? 0;
              return (
                <div key={s.id} className={`flex flex-col p-3 rounded-lg border-2 transition-all ${qtd > 0 ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{s.nome}</span>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => alterarQtd(s, -1)} disabled={qtd === 0}>
                        <Minus size={13} />
                      </Button>
                      <span className={`w-6 text-center font-black text-sm ${qtd > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{qtd}</span>
                      <Button type="button" size="icon" variant="outline" className="h-7 w-7 border-primary text-primary" onClick={() => alterarQtd(s, 1)} disabled={qtd >= (s.quantidade_disponivel ?? 0)}>
                        <Plus size={13} />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${dispQtd > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {t('common.availableCount', { count: dispQtd })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumo */}
        {itensSelecionados.length > 0 && (
          <div className="bg-secondary rounded-xl p-4 border border-primary/20">
            <p className="font-bold text-secondary-foreground text-sm mb-2 uppercase tracking-wide">{t('orders.summary')}</p>
            {itensSelecionados.map((i) => (
              <div key={i.sabor_id} className="flex justify-between text-sm font-semibold">
                <span>{i.sabor_nome}</span>
                <span className="text-primary font-black">{i.quantidade}x</span>
              </div>
            ))}
            <div className="border-t border-primary/20 mt-2 pt-2 flex justify-between font-black">
              <span>{t('common.total')}</span>
              <span className="text-primary">{t('common.pastelCount', { count: totalPasteis })}</span>
            </div>
          </div>
        )}

        <Button
          type="submit"
          disabled={!nomeCliente.trim() || itensSelecionados.length === 0 || criarPedido.isPending}
          className="w-full bg-primary hover:bg-primary/90 font-black text-lg py-6 gap-2"
        >
          <ShoppingBag size={20} /> {t('orders.submit')}
        </Button>
      </form>

      <AnimatePresence>
        {isCaptureFlowOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 p-4 flex items-center justify-center"
            onClick={fecharFluxoCaptura}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4">
                <h2 className="text-xl font-black text-foreground">{t('orders.camera.captureBeforeSubmitTitle')}</h2>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">{t('orders.camera.captureBeforeSubmitDescription')}</p>
              </div>

              <div className="space-y-4">
                {capturedPhotoUrl && !isCameraOpen && (
                  <div className="space-y-3">
                    <img
                      src={capturedPhotoUrl}
                      alt={t('orders.camera.previewAlt', { name: nomeCliente || t('orders.camera.customerFallback') })}
                      className="h-64 w-full rounded-xl object-cover border border-border"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="gap-2" onClick={abrirCamera}>
                        <RefreshCcw size={16} /> {t('orders.camera.retake')}
                      </Button>
                      <Button type="button" variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={removerFoto}>
                        <Trash2 size={16} /> {t('orders.camera.remove')}
                      </Button>
                    </div>
                  </div>
                )}

                {isCameraOpen && (
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-xl border border-border bg-black">
                      <video ref={videoRef} autoPlay playsInline muted className="h-72 w-full object-cover" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" className="gap-2" onClick={capturarFoto}>
                        <Camera size={16} /> {t('orders.camera.capture')}
                      </Button>
                    </div>
                  </div>
                )}

                {cameraError && (
                  <p className="text-sm font-semibold text-destructive">{cameraError}</p>
                )}
              </div>

              <div className="mt-5 flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={fecharFluxoCaptura}>
                  {t('common.cancel')}
                </Button>
                {cameraError && !capturedPhotoBlob && !isCameraOpen && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 font-bold"
                    onClick={confirmarPedidoSemFoto}
                    disabled={criarPedido.isPending}
                  >
                    {t('orders.camera.submitWithoutPhotoFallback')}
                  </Button>
                )}
                <Button
                  type="button"
                  className="flex-1 font-bold"
                  onClick={confirmarPedidoComFoto}
                  disabled={!capturedPhotoBlob || criarPedido.isPending}
                >
                  {t('orders.camera.confirmAndSubmit')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {confirmacao && (
          <ConfirmacaoPedido pedido={confirmacao} onClose={() => setConfirmacao(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}