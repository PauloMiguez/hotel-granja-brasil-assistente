import React, { useState, useEffect, useCallback, useMemo } from 'react';

const WORKER_URL = 'https://intrega-ia.paulo-migueoli.workers.dev';

interface Message { role: string; content: string; timestamp?: string; }
interface Conversation {
  id: string; total_messages: number; last_updated: string; source: string; messages?: Message[];
}
interface TrackingStats {
  consultas: number; sucesso: number; vazias: number; carrinho: number;
  orcamento: number; whatsapp: number; abandono: number;
  reservas?: number; perdas?: number;
}
interface TrackingEvent {
  event: string; timestamp: any; sessionId: string; data: any;
}
interface SessaoAgrupada {
  sessionId: string;
  eventos: TrackingEvent[];
  eventDates: Set<string>;
  lastTimestampMs: number;
  valorCotado: number;
  ultimoEvento: TrackingEvent | null;
  statusFinal: 'confirmada' | 'perdida' | 'pendente';
}
interface OcupacaoDiaria {
  data: string; livres: number; ocupadas: number; ocupacao: number;
  porCategoria: { SUP: number; SEN: number; MAS: number };
}

// ========= NORMALIZAÇÃO DE DATA =========
const normalizeDate = (rawTimestamp: any): Date | null => {
  if (!rawTimestamp || rawTimestamp === 'Data Indisponivel') return null;
  if (rawTimestamp instanceof Date) return isNaN(rawTimestamp.getTime()) ? null : rawTimestamp;
  if (typeof rawTimestamp === 'string' || typeof rawTimestamp === 'number') {
    const d = new Date(rawTimestamp);
    if (!isNaN(d.getTime())) return d;
    if (typeof rawTimestamp === 'string') {
      const num = Number(rawTimestamp);
      if (!isNaN(num)) {
        const d2 = new Date(num);
        if (!isNaN(d2.getTime())) return d2;
      }
    }
  }
  if (rawTimestamp.timestampValue) {
    const d = new Date(rawTimestamp.timestampValue);
    if (!isNaN(d.getTime())) return d;
  }
  const seconds = rawTimestamp._seconds ?? rawTimestamp.seconds;
  if (seconds !== undefined) {
    const d = new Date(seconds * 1000);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
};

const getDateFromEvent = (ev: TrackingEvent): Date | null => {
  const parsed = normalizeDate(ev.timestamp);
  if (parsed) return parsed;
  if (ev.sessionId) {
    const parts = ev.sessionId.split('_');
    if (parts.length >= 2) {
      const ms = Number(parts[1]);
      if (!isNaN(ms) && ms > 0) {
        const d = new Date(ms);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  return null;
};

const getBrasiliaDateStr = (rawInput: any): { dateStr: string; ms: number } | null => {
  const d = rawInput instanceof Date ? rawInput : normalizeDate(rawInput);
  if (!d) return null;
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = dtf.formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return { dateStr: `${year}-${month}-${day}`, ms: d.getTime() };
};

const dedupeEvents = (events: TrackingEvent[]): TrackingEvent[] => {
  const seen = new Set<string>();
  return events.filter((ev) => {
    const key = `${ev.sessionId}|${ev.event}|${JSON.stringify(ev.data ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const EVENTOS_IGNORADOS = ['teste_final', 'diagnostico', 'teste'];

// ========= AGRUPAMENTO DE SESSÕES =========
const agruparSessoes = (eventos: TrackingEvent[]): SessaoAgrupada[] => {
  const validos = eventos.filter(ev => !EVENTOS_IGNORADOS.includes(ev.event));
  const map: Record<string, TrackingEvent[]> = {};
  validos.forEach(ev => {
    const sid = ev.sessionId || 'sessao-sem-id';
    (map[sid] ??= []).push(ev);
  });

  return Object.entries(map).map(([sessionId, eventos]) => {
    const ordenados = [...eventos].sort((a, b) => {
      const msA = getDateFromEvent(a)?.getTime() || 0;
      const msB = getDateFromEvent(b)?.getTime() || 0;
      return msA - msB;
    });
    const eventDates = new Set<string>();
    ordenados.forEach(ev => {
      const info = getBrasiliaDateStr(getDateFromEvent(ev));
      if (info) eventDates.add(info.dateStr);
    });

    const ultimo = ordenados[ordenados.length - 1];
    const lastTimestampMs = getBrasiliaDateStr(getDateFromEvent(ultimo))?.ms || 0;

    const orc = ordenados.find(e => e.event === 'orcamento_visualizado');
    const whats = ordenados.find(e => e.event === 'whatsapp_enviado');
    const valorCotado = Number(orc?.data?.total || whats?.data?.total || 0);

    const conf = ordenados.find(e => e.event === 'reserva_confirmada');
    const perd = ordenados.find(e => e.event === 'reserva_perdida');

    let statusFinal: 'confirmada' | 'perdida' | 'pendente' = 'pendente';
    if (conf && perd) {
      const msC = getDateFromEvent(conf)?.getTime() || 0;
      const msP = getDateFromEvent(perd)?.getTime() || 0;
      statusFinal = msC >= msP ? 'confirmada' : 'perdida';
    } else if (conf) statusFinal = 'confirmada';
    else if (perd) statusFinal = 'perdida';

    return {
      sessionId, eventos: ordenados, eventDates, lastTimestampMs,
      valorCotado, ultimoEvento: ultimo, statusFinal,
    };
  });
};

// ========= LEAD SCORE =========
const calcularLeadScore = (s: SessaoAgrupada, ticketMedio: number): number => {
  const etapas = ['consulta_iniciada', 'consulta_sucesso', 'carrinho_adicionado', 'orcamento_visualizado', 'whatsapp_enviado'];
  const ultimo = s.ultimoEvento;
  const idxUltimo = ultimo ? etapas.indexOf(ultimo.event) : -1;
  const etapasPct = idxUltimo >= 0 ? (idxUltimo + 1) / etapas.length : 0;
  const valorPct = ticketMedio > 0 ? Math.min(s.valorCotado / ticketMedio, 1) : 0;

  const consulta = s.eventos.find(e => e.event === 'consulta_iniciada');
  const noites = consulta?.data?.checkin && consulta?.data?.checkout
    ? Math.max(1, Math.round((new Date(consulta.data.checkout).getTime() - new Date(consulta.data.checkin).getTime()) / 86400000))
    : 1;
  const noitesPct = Math.min(noites / 5, 1);
  const viuOrcamento = s.eventos.some(e => e.event === 'orcamento_visualizado') ? 1 : 0;

  const dias = (Date.now() - s.lastTimestampMs) / 86400000;
  const recencia = Math.max(0, 1 - dias / 14);
  const temCrianca = (consulta?.data?.criancas || 0) > 0 ? 1 : 0;

  return Math.round(
    40 * etapasPct + 20 * valorPct + 15 * noitesPct +
    10 * viuOrcamento + 10 * recencia + 5 * temCrianca
  );
};

// ========= ABANDONO POR FAIXA DE VALOR =========
const analisarAbandonoPorValor = (sessoes: SessaoAgrupada[]) => {
  const bins = [
    { min: 0, max: 500, label: 'R$ 0–500' },
    { min: 500, max: 800, label: 'R$ 500–800' },
    { min: 800, max: 1100, label: 'R$ 800–1.100' },
    { min: 1100, max: 1500, label: 'R$ 1.100–1.500' },
    { min: 1500, max: Infinity, label: 'R$ 1.500+' },
  ];

  return bins.map(bin => {
    const relevantes = sessoes.filter(s => {
      const orc = s.eventos.find(e => e.event === 'orcamento_visualizado');
      if (!orc) return false;
      const v = Number(orc.data?.total || 0);
      return v >= bin.min && v < bin.max;
    });

    const comWhats = relevantes.filter(s => s.eventos.some(e => e.event === 'whatsapp_enviado')).length;
    const confirmadas = relevantes.filter(s => s.statusFinal === 'confirmada').length;
    const perdidas = relevantes.filter(s => s.statusFinal === 'perdida').length;

    return {
      ...bin,
      total: relevantes.length,
      taxaWhats: relevantes.length ? Math.round(comWhats / relevantes.length * 100) : 0,
      taxaFech: relevantes.length ? Math.round(confirmadas / relevantes.length * 100) : 0,
      taxaPerda: relevantes.length ? Math.round(perdidas / relevantes.length * 100) : 0,
    };
  }).filter(b => b.total > 0);
};

// ========= LEAD TIME =========
const analisarLeadTime = (sessoes: SessaoAgrupada[]) => {
  const bins = [
    { min: 0, max: 7, label: '0–7 dias' },
    { min: 7, max: 30, label: '8–30 dias' },
    { min: 30, max: 90, label: '31–90 dias' },
    { min: 90, max: Infinity, label: '90+ dias' },
  ];

  return bins.map(bin => {
    const noBin = sessoes.filter(s => {
      const c = s.eventos.find(e => e.event === 'consulta_iniciada');
      if (!c?.data?.checkin) return false;
      const checkin = new Date(c.data.checkin);
      const busca = getDateFromEvent(c);
      if (!busca || isNaN(checkin.getTime())) return false;
      const dias = (checkin.getTime() - busca.getTime()) / 86400000;
      return dias >= bin.min && dias < bin.max;
    });

    const comWhats = noBin.filter(s => s.eventos.some(e => e.event === 'whatsapp_enviado')).length;
    const confirmadas = noBin.filter(s => s.statusFinal === 'confirmada').length;

    return {
      faixa: bin.label,
      buscas: noBin.length,
      taxaWhats: noBin.length ? Math.round(comWhats / noBin.length * 100) : 0,
      taxaFech: noBin.length ? Math.round(confirmadas / noBin.length * 100) : 0,
    };
  }).filter(b => b.buscas > 0);
};

// ========= FILA DE RECUPERAÇÃO =========
const gerarFilaRecuperacao = (sessoes: SessaoAgrupada[], ticketMedio: number) => {
  const agora = Date.now();
  return sessoes
    .filter(s => {
      const temWhats = s.eventos.some(e => e.event === 'whatsapp_enviado');
      const temOrc = s.eventos.some(e => e.event === 'orcamento_visualizado');
      return s.statusFinal === 'pendente' && (temOrc || temWhats);
    })
    .map(s => {
      const horas = Math.round((agora - s.lastTimestampMs) / 3600000);
      const temWhats = s.eventos.some(e => e.event === 'whatsapp_enviado');
      const acao = temWhats
        ? 'Follow-up comercial — confirmar se fechou'
        : horas < 24
          ? 'Enviar WhatsApp ativo — viu orçamento e não engajou'
          : 'Régua de reativação';
      return {
        sessionId: s.sessionId, score: calcularLeadScore(s, ticketMedio),
        valor: s.valorCotado, horas, acao, temWhats,
      };
    })
    .sort((a, b) => b.score - a.score);
};

// ========= STATS DERIVADOS DAS SESSÕES ÚNICAS =========
const calcularStatsDerivados = (sessoes: SessaoAgrupada[]): TrackingStats => {
  const s: TrackingStats = {
    consultas: 0, sucesso: 0, vazias: 0, carrinho: 0,
    orcamento: 0, whatsapp: 0, abandono: 0, reservas: 0, perdas: 0,
  };
  sessoes.forEach(sessao => {
    const evs = sessao.eventos;
    if (evs.some(e => e.event === 'consulta_iniciada')) s.consultas++;
    if (evs.some(e => e.event === 'consulta_sucesso')) s.sucesso++;
    if (evs.some(e => e.event === 'consulta_vazia')) s.vazias++;
    if (evs.some(e => e.event === 'carrinho_adicionado')) s.carrinho++;
    if (evs.some(e => e.event === 'orcamento_visualizado')) s.orcamento++;
    if (evs.some(e => e.event === 'whatsapp_enviado')) s.whatsapp++;
    if (evs.some(e => e.event === 'abandono')) s.abandono++;
    if (sessao.statusFinal === 'confirmada') s.reservas = (s.reservas || 0) + 1;
    if (sessao.statusFinal === 'perdida') s.perdas = (s.perdas || 0) + 1;
  });
  return s;
};

// ========= COMPONENTE PRINCIPAL =========
export const AdminPanel: React.FC = () => {
  const [filtered, setFiltered] = useState<Conversation[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [stats, setStats] = useState({ total: 0, msgs: 0, today: 0, avg: 0 });
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [convMessages, setConvMessages] = useState<Message[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);

  const todayBrasilia = getBrasiliaDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(
    todayBrasilia ? todayBrasilia.dateStr : new Date().toISOString().split('T')[0]
  );
  const [heatmapMonth, setHeatmapMonth] = useState<string>('');

  const [viewMode, setViewMode] = useState<'lista' | 'kanban'>('lista');

  const [reservaModal, setReservaModal] = useState<{
    sessionId: string; acao: 'confirmar' | 'perder'; valor: number;
  } | null>(null);
  const [reservaForm, setReservaForm] = useState({
    valor: '', categoria: 'SEN', canal: 'whatsapp', motivo: 'preco',
  });
  const [salvandoStatus, setSalvandoStatus] = useState(false);

  const [ocupacao, setOcupacao] = useState<OcupacaoDiaria[]>([]);
  const [loadingOcupacao, setLoadingOcupacao] = useState(false);
  const [ocupacaoRange, setOcupacaoRange] = useState<{ start: string; end: string } | null>(null);

  // ========= FETCH CONVERSAS =========
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${WORKER_URL}/conversas`);
      const data = await res.json();
      if (data.success) {
        const convs = parseConversations(data.data || []);
        setFiltered(convs);
        updateStats(convs);
      }
    } catch (e) {
      console.error(e);
      setError('Erro ao carregar conversas');
    }
  };

  const handleViewConversation = async (convId: string) => {
    setSelectedConvId(convId);
    setLoadingConv(true);
    const conv = filtered.find(c => c.id === convId);
    if (conv && conv.messages?.length) {
      setConvMessages(conv.messages);
      setLoadingConv(false);
      return;
    }
    try {
      const res = await fetch(`${WORKER_URL}/conversa?id=${encodeURIComponent(convId)}`);
      const data = await res.json();
      if (data.success && data.data) {
        const fields = data.data.fields || {};
        let messages: Message[] = [];
        if (fields.messages?.arrayValue?.values) {
          messages = fields.messages.arrayValue.values
            .map((v: any) => {
              const mf = v.mapValue?.fields || {};
              return {
                role: mf.role?.stringValue || 'unknown',
                content: mf.content?.stringValue || '',
                timestamp: mf.timestamp?.timestampValue || '',
              };
            })
            .filter((m: Message) => Boolean(m.content));
        }
        setConvMessages(messages);
      } else setConvMessages([]);
    } catch (e) { setConvMessages([]); }
    finally { setLoadingConv(false); }
  };

  // ========= FETCH TRACKING (apenas eventos) =========
  const fetchTrackingStats = useCallback(async () => {
    try {
      const res = await fetch(`${WORKER_URL}/tracking-stats`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.events) {
          setTrackingEvents(dedupeEvents(data.events));
          return;
        }
      }
      const localData = getLocalTrackingStats();
      if (localData) {
        setTrackingEvents(dedupeEvents(localData.events));
      }
    } catch (e) {
      console.warn('Erro ao buscar tracking do servidor:', e);
      const localData = getLocalTrackingStats();
      if (localData) {
        setTrackingEvents(dedupeEvents(localData.events));
      }
    }
  }, []);

  // ========= FETCH OCUPAÇÃO =========
  const fetchOcupacao = useCallback(async (start: Date, end: Date) => {
    setLoadingOcupacao(true);
    try {
      const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const s = fmt(start);
      const e = fmt(end);
      setOcupacaoRange({ start: s, end: e });
      const res = await fetch(`${WORKER_URL}/ocupacao?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`);
      const data = await res.json();
      if (data.success) setOcupacao(data.diarias || []);
    } catch (e) {
      console.warn('Erro ao buscar ocupação:', e);
    } finally {
      setLoadingOcupacao(false);
    }
  }, []);

  const parseConversations = (docs: any[]): Conversation[] => docs
    .map((doc: any) => {
      const f = doc.fields || {};
      const id = f.conversation_id?.stringValue || doc.name?.split('/').pop() || 'N/A';
      const msgs = Number(f.metadata?.mapValue?.fields?.total_messages?.integerValue) || 0;
      const updatedField = f.metadata?.mapValue?.fields?.last_updated;
      let updated = '';
      if (updatedField) {
        if (updatedField.timestampValue) updated = updatedField.timestampValue;
        else if (updatedField.stringValue) updated = updatedField.stringValue;
        else updated = updatedField.toString?.() || '';
      }
      const source = f.metadata?.mapValue?.fields?.source?.stringValue || 'chat_web';
      let messages: Message[] = [];
      if (f.messages?.arrayValue?.values) {
        messages = f.messages.arrayValue.values.map((v: any) => {
          const mf = v.mapValue?.fields || {};
          return {
            role: mf.role?.stringValue || 'unknown',
            content: mf.content?.stringValue || '',
            timestamp: mf.timestamp?.timestampValue || '',
          };
        }).filter((m: Message) => Boolean(m.content));
      }
      return { id, total_messages: msgs, last_updated: updated, source, messages };
    })
    .filter(c => c.id !== 'N/A');

  const updateStats = (convs: Conversation[]) => {
    const total = convs.length;
    const msgs = convs.reduce((s, c) => s + (Number(c.total_messages) || 0), 0);
    const todayStr = getBrasiliaDateStr(new Date());
    const today = todayStr ? todayStr.dateStr : new Date().toISOString().split('T')[0];
    const todayConvs = convs.filter(c => getBrasiliaDateStr(c.last_updated)?.dateStr === today).length;
    setStats({ total, msgs, today: todayConvs, avg: total > 0 ? msgs / total : 0 });
  };

  const getLocalTrackingStats = () => {
    try {
      const data = localStorage.getItem('tracking_history');
      if (!data) return null;
      const history = JSON.parse(data);
      if (!Array.isArray(history)) return null;
      return { events: history.slice(-200).reverse() };
    } catch { return null; }
  };

  // ========= POST /track para marcar reserva =========
  const marcarReserva = async (
    sessionId: string,
    tipo: 'confirmada' | 'perdida',
    dados: { valor?: number; categoria?: string; canal?: string; motivo?: string; valorCotado?: number }
  ) => {
    setSalvandoStatus(true);
    try {
      const evento = tipo === 'confirmada' ? 'reserva_confirmada' : 'reserva_perdida';
      const payload = {
        sessionId,
        event: evento,
        timestamp: new Date().toISOString(),
        data: {
          referencia_sessao: sessionId,
          ...(tipo === 'confirmada'
            ? { valor_final: dados.valor, categoria: dados.categoria, canal: dados.canal, valor_cotado: dados.valorCotado }
            : { motivo: dados.motivo, valor_cotado: dados.valorCotado }),
        },
      };
      const res = await fetch(`${WORKER_URL}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      await fetchTrackingStats();
      setReservaModal(null);
    } catch (e) {
      alert('Erro ao salvar status da reserva. Tente novamente.');
      console.error(e);
    } finally {
      setSalvandoStatus(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchConversations(), fetchTrackingStats()]);
      setLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    const hoje = new Date();
    const fim = new Date();
    fim.setDate(fim.getDate() + 60);
    fetchOcupacao(hoje, fim);
  }, [fetchOcupacao]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const hoje = new Date();
    const fim = new Date();
    fim.setDate(fim.getDate() + 60);
    await Promise.all([
      fetchConversations(),
      fetchTrackingStats(),
      fetchOcupacao(hoje, fim),
    ]);
    setIsRefreshing(false);
  };

  // ========= EXPORT CSV =========
  const exportCSV = () => {
    const headers = ['Sessao', 'Evento', 'Timestamp', 'Detalhes'];
    const rows = trackingEvents
      .filter(ev => !EVENTOS_IGNORADOS.includes(ev.event))
      .map(ev => {
        let detail = '';
        if (ev.event === 'consulta_iniciada' && ev.data) {
          detail = `Check-in: ${ev.data.checkin || '-'} | ${ev.data.checkout || '-'} | ${ev.data.adultos || 0} adulto(s)`;
          if (ev.data.criancas) detail += ` + ${ev.data.criancas} criança(s)`;
        } else if (ev.event === 'carrinho_adicionado' && ev.data) {
          detail = `${ev.data.quantidade || 0} quarto(s)`;
        } else if (ev.event === 'whatsapp_enviado' && ev.data) {
          detail = `R$ ${ev.data.total || 0}`;
        } else if (ev.event === 'reserva_confirmada' && ev.data) {
          detail = `R$ ${ev.data.valor_final || 0} | ${ev.data.categoria || '-'} | ${ev.data.canal || '-'}`;
        } else if (ev.event === 'reserva_perdida' && ev.data) {
          detail = `Motivo: ${ev.data.motivo || '-'} | Cotado: R$ ${ev.data.valor_cotado || 0}`;
        } else if (ev.data?.context) {
          detail = ev.data.context;
        }
        const parsedDate = getDateFromEvent(ev);
        const dateFormatted = parsedDate
          ? parsedDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          : 'Data Indisponivel';
        return [ev.sessionId, ev.event, dateFormatted, `"${detail.replace(/"/g, '""')}"`];
      });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tracking_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ========= MÉTRICAS DERIVADAS =========
  const sessoes = useMemo(() => agruparSessoes(trackingEvents), [trackingEvents]);

  // 🔥 STATS DERIVADOS (estáveis, sem oscilação)
  const trackingStats = useMemo(() => calcularStatsDerivados(sessoes), [sessoes]);

  const ticketMedio = useMemo(() => {
    const confirmadas = sessoes.filter(s => s.statusFinal === 'confirmada');
    if (!confirmadas.length) return 0;
    const total = confirmadas.reduce((acc, s) => {
      const conf = s.eventos.find(e => e.event === 'reserva_confirmada');
      return acc + Number(conf?.data?.valor_final || 0);
    }, 0);
    return total / confirmadas.length;
  }, [sessoes]);

  const kpisFechamento = useMemo(() => {
    const whats = sessoes.filter(s => s.eventos.some(e => e.event === 'whatsapp_enviado'));
    const confirmadas = sessoes.filter(s => s.statusFinal === 'confirmada');
    const perdidas = sessoes.filter(s => s.statusFinal === 'perdida');
    const receita = confirmadas.reduce((acc, s) => {
      const c = s.eventos.find(e => e.event === 'reserva_confirmada');
      return acc + Number(c?.data?.valor_final || 0);
    }, 0);
    const ciclos: number[] = [];
    confirmadas.forEach(s => {
      const first = s.eventos[0];
      const last = s.eventos.find(e => e.event === 'reserva_confirmada');
      const msF = getDateFromEvent(first)?.getTime() || 0;
      const msL = getDateFromEvent(last!)?.getTime() || 0;
      if (msF && msL) ciclos.push((msL - msF) / 86400000);
    });
    const cicloMedio = ciclos.length ? ciclos.reduce((a, b) => a + b, 0) / ciclos.length : 0;
    return {
      whats: whats.length,
      confirmadas: confirmadas.length,
      perdidas: perdidas.length,
      taxa: whats.length ? Math.round(confirmadas.length / whats.length * 100) : 0,
      receita,
      cicloMedio,
    };
  }, [sessoes]);

  const abandonoPorValor = useMemo(() => analisarAbandonoPorValor(sessoes), [sessoes]);
  const leadTimeData = useMemo(() => analisarLeadTime(sessoes), [sessoes]);
  const filaRecuperacao = useMemo(() => gerarFilaRecuperacao(sessoes, ticketMedio), [sessoes, ticketMedio]);

  const pendenciasAntigas = useMemo(() => {
    const agora = Date.now();
    return sessoes.filter(s => {
      const temWhats = s.eventos.some(e => e.event === 'whatsapp_enviado');
      const horas = (agora - s.lastTimestampMs) / 3600000;
      return temWhats && s.statusFinal === 'pendente' && horas > 48;
    });
  }, [sessoes]);

  // ========= RENDER =========
  if (loading) return <div className="text-center p-8">Carregando...</div>;
  if (error) return <div className="text-red-600 p-8">{error}</div>;

  const conversionRate = trackingStats.consultas > 0
    ? ((trackingStats.whatsapp / trackingStats.consultas) * 100).toFixed(0)
    : 0;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <header className="bg-[#1e293b] text-white p-4 rounded-lg mb-4 flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-2xl font-bold">🏨 Painel Administrativo</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-white/20 px-4 py-2 rounded hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRefreshing ? '🔄 Atualizando...' : '🔄 Atualizar'}
          </button>
          <button onClick={exportCSV} className="bg-white/20 px-4 py-2 rounded hover:bg-white/30">
            📥 CSV
          </button>
        </div>
      </header>

      {pendenciasAntigas.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded-r-lg flex justify-between items-center flex-wrap gap-2">
          <span className="text-sm text-amber-900">
            ⚠️ <strong>{pendenciasAntigas.length}</strong> sessão(ões) com WhatsApp enviado há mais de 48h sem status de reserva.
          </span>
          <button
            onClick={() => {
              const el = document.getElementById('fila-recuperacao');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded hover:bg-amber-600"
          >
            Ver fila
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Conversas" value={stats.total} />
        <StatCard label="Mensagens" value={stats.msgs.toLocaleString()} />
        <StatCard label="Hoje" value={stats.today} />
        <StatCard label="Média" value={stats.avg.toFixed(1)} suffix=" msg/conv" />
      </div>

      <h2 className="text-xl font-semibold text-[#1e293b] border-b pb-2 mb-4">💰 Resultado Comercial</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
          <div className="text-2xl font-bold text-emerald-700">{kpisFechamento.confirmadas}</div>
          <div className="text-xs text-gray-600">Reservas confirmadas</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-rose-500">
          <div className="text-2xl font-bold text-rose-700">{kpisFechamento.perdidas}</div>
          <div className="text-xs text-gray-600">Reservas perdidas</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
          <div className="text-2xl font-bold text-indigo-700">{kpisFechamento.taxa}%</div>
          <div className="text-xs text-gray-600">Taxa de fechamento</div>
          <div className="text-[10px] text-slate-400">WhatsApp → Reserva</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <div className="text-2xl font-bold text-yellow-700">{formatCurrency(ticketMedio)}</div>
          <div className="text-xs text-gray-600">Ticket médio</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-700">
          <div className="text-2xl font-bold text-emerald-700">{formatCurrency(kpisFechamento.receita)}</div>
          <div className="text-xs text-gray-600">Receita total</div>
          <div className="text-[10px] text-slate-400">Ciclo médio: {kpisFechamento.cicloMedio.toFixed(1)}d</div>
        </div>
      </div>

      <h2 className="text-xl font-semibold text-[#1e293b] border-b pb-2 mb-4">📈 Funil de Conversão</h2>
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Taxa de conversão (consulta → WhatsApp)</span>
          <span className="text-lg font-bold text-[#1e293b]">{conversionRate}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-[#1e293b] h-2.5 rounded-full" style={{ width: `${Math.min(Number(conversionRate), 100)}%` }}></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-9 gap-3 mt-4">
          <TrackingCard label="Consultas" value={trackingStats.consultas} />
          <TrackingCard label="Sucesso" value={trackingStats.sucesso} />
          <TrackingCard label="Sem Disp." value={trackingStats.vazias} />
          <TrackingCard label="Carrinho" value={trackingStats.carrinho} />
          <TrackingCard label="Orçamento" value={trackingStats.orcamento} color="gold" />
          <TrackingCard label="WhatsApp" value={trackingStats.whatsapp} color="gold" />
          <TrackingCard label="Abandonos" value={trackingStats.abandono} color="red" />
          <TrackingCard label="Reservas" value={trackingStats.reservas || 0} color="green" />
          <TrackingCard label="Perdas" value={trackingStats.perdas || 0} color="red" />
        </div>
      </div>

      <h2 className="text-xl font-semibold text-[#1e293b] border-b pb-2 mb-4">📊 Demanda × Ocupação × Preço</h2>
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        {loadingOcupacao ? (
          <div className="text-center py-6 text-slate-500 text-sm">Carregando dados de ocupação...</div>
        ) : ocupacao.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            Não foi possível carregar dados de ocupação da API.
            {ocupacaoRange && <span className="block text-xs mt-1">Range: {ocupacaoRange.start} → {ocupacaoRange.end}</span>}
          </div>
        ) : (
          <OcupacaoTable ocupacao={ocupacao} sessoes={sessoes} />
        )}
      </div>

      {leadTimeData.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-[#1e293b] border-b pb-2 mb-4">⏱️ Análise por Antecedência</h2>
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="px-3 py-2 text-left">Faixa (check-in − busca)</th>
                  <th className="px-3 py-2 text-center">Buscas</th>
                  <th className="px-3 py-2 text-center">Conversão WhatsApp</th>
                  <th className="px-3 py-2 text-center">Taxa de Fechamento</th>
                </tr>
              </thead>
              <tbody>
                {leadTimeData.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium">{row.faixa}</td>
                    <td className="px-3 py-2 text-center">{row.buscas}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-indigo-700 font-semibold">{row.taxaWhats}%</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-emerald-700 font-semibold">{row.taxaFech}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-3">
              Leads com maior antecedência tendem a comparar mais. Leads próximos ao check-in decidem por urgência.
            </p>
          </div>
        </>
      )}

      {abandonoPorValor.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-[#1e293b] border-b pb-2 mb-4">💸 Abandono por Faixa de Preço</h2>
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="space-y-3">
              {abandonoPorValor.map((bin, i) => {
                const maxTotal = Math.max(...abandonoPorValor.map(b => b.total), 1);
                const widthTotal = (bin.total / maxTotal) * 100;
                const abandono = bin.total ? Math.round((1 - bin.taxaFech / 100) * 100) : 0;
                const cor = abandono >= 70 ? 'bg-red-600' : abandono >= 50 ? 'bg-orange-500' : abandono >= 30 ? 'bg-amber-400' : 'bg-emerald-500';
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{bin.label}</span>
                      <span className="text-slate-500">
                        {bin.total} sessões · {bin.taxaFech}% fecharam · {abandono}% perderam
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3">
                      <div className={`h-3 rounded-full ${cor}`} style={{ width: `${widthTotal}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-4">
              Barras longas em vermelho indicam teto empírico de preço. Se a faixa {abandonoPorValor.find(b => b.taxaFech < 20)?.label || 'superior'} tem abandono acima de 70%, considere ajustar para baixo.
            </p>
          </div>
        </>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-semibold text-[#1e293b] border-b pb-2 mb-4">📊 Mapa de Calor de Buscas</h2>
        {(() => {
          const consultas = trackingEvents.filter(ev => ev.event === 'consulta_iniciada' && ev.data?.checkin);
          if (consultas.length === 0) {
            return (
              <div className="bg-white rounded-lg shadow p-6 text-center text-slate-500">
                Nenhuma consulta de disponibilidade registrada ainda.
              </div>
            );
          }
          const freqMap: Record<string, { checkin: string; checkout: string; adultos: number; criancas: number; count: number }> = {};
          consultas.forEach(ev => {
            const { checkin, checkout, adultos = 0, criancas = 0 } = ev.data;
            if (!checkin) return;
            if (!freqMap[checkin]) freqMap[checkin] = { checkin, checkout, adultos, criancas, count: 0 };
            freqMap[checkin].count += 1;
          });
          const freqArray = Object.values(freqMap).sort((a, b) => b.count - a.count);
          const allDates = consultas.map(ev => ev.data.checkin).filter(Boolean);
          const monthCount: Record<string, number> = {};
          allDates.forEach((d: string) => {
            const parts = d.split('-');
            if (parts.length === 3) {
              const k = `${parts[0]}-${parts[1]}`;
              monthCount[k] = (monthCount[k] || 0) + 1;
            }
          });
          let busiestMonth = '';
          let maxCount = 0;
          for (const [m, c] of Object.entries(monthCount)) {
            if (c > maxCount) { maxCount = c; busiestMonth = m; }
          }
          if (!busiestMonth) {
            const now = new Date();
            busiestMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          }
          const monthNamesFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
          const monthKeysSet = new Set(Object.keys(monthCount));
          if (heatmapMonth && /^\d{4}-\d{2}$/.test(heatmapMonth)) monthKeysSet.add(heatmapMonth);
          const availableMonths = Array.from(monthKeysSet).sort().reverse();
          const displayedMonth = heatmapMonth && monthKeysSet.has(heatmapMonth) ? heatmapMonth : busiestMonth;
          const [year, month] = displayedMonth.split('-').map(Number);
          const firstDay = new Date(year, month - 1, 1).getDay();
          const daysInMonth = new Date(year, month, 0).getDate();
          const dayFreq: Record<number, number> = {};
          consultas.forEach(ev => {
            const d = ev.data.checkin;
            if (!d) return;
            const [y, m, day] = d.split('-').map(Number);
            if (y === year && m === month) dayFreq[day] = (dayFreq[day] || 0) + 1;
          });
          const maxFreq = Math.max(...Object.values(dayFreq), 1);
          const getColor = (freq: number) => {
            if (freq === 0) return 'bg-slate-100';
            const i = Math.min(1, freq / maxFreq);
            if (i <= 0.2) return 'bg-yellow-100';
            if (i <= 0.4) return 'bg-yellow-300';
            if (i <= 0.6) return 'bg-orange-300';
            if (i <= 0.8) return 'bg-orange-500 text-white';
            return 'bg-red-600 text-white';
          };
          const monthName = monthNamesFull[month - 1];
          return (
            <div className="bg-white rounded-lg shadow p-4 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-indigo-50 p-3 rounded-lg text-center">
                  <div className="text-2xl font-bold text-indigo-700">{consultas.length}</div>
                  <div className="text-xs text-indigo-600">Total de buscas</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg text-center">
                  <div className="text-2xl font-bold text-emerald-700">{freqArray.length}</div>
                  <div className="text-xs text-emerald-600">Datas únicas</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg text-center">
                  <div className="text-2xl font-bold text-amber-700">{freqArray[0]?.count || 0}</div>
                  <div className="text-xs text-amber-600">Pico de buscas (dia)</div>
                </div>
                <div className="bg-rose-50 p-3 rounded-lg text-center">
                  <div className="text-2xl font-bold text-rose-700">{monthName}</div>
                  <div className="text-xs text-rose-600">Mês mais quente</div>
                </div>
              </div>

              <div>
                <h3 className="text-md font-semibold text-slate-700 mb-2">📋 Tabela de Frequência por Data de Check‑in</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="px-4 py-2 text-left">Check‑in</th>
                        <th className="px-4 py-2 text-left">Check‑out</th>
                        <th className="px-4 py-2 text-left">Hóspedes</th>
                        <th className="px-4 py-2 text-center">Frequência</th>
                        <th className="px-4 py-2 text-left">Intensidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {freqArray.slice(0, 15).map((item, idx) => {
                        const max = freqArray[0]?.count || 1;
                        const width = (item.count / max) * 100;
                        return (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium">{item.checkin}</td>
                            <td className="px-4 py-2">{item.checkout || '-'}</td>
                            <td className="px-4 py-2">{item.adultos} adulto(s){item.criancas ? ` + ${item.criancas} criança(s)` : ''}</td>
                            <td className="px-4 py-2 text-center font-bold">{item.count}</td>
                            <td className="px-4 py-2">
                              <div className="w-full bg-slate-200 rounded-full h-2.5">
                                <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${Math.min(width, 100)}%` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <h3 className="text-md font-semibold text-slate-700">🗓️ Mapa de Calor – {monthName} de {year}</h3>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-medium">Mês:</label>
                    <select
                      value={displayedMonth}
                      onChange={(e) => setHeatmapMonth(e.target.value)}
                      className="text-xs bg-white border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700 shadow-sm"
                    >
                      {availableMonths.map(ym => {
                        const [y, m] = ym.split('-').map(Number);
                        const count = monthCount[ym] || 0;
                        return (
                          <option key={ym} value={ym}>
                            {monthNamesFull[m - 1]} de {y} · {count} busca{count === 1 ? '' : 's'}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500 mb-1">
                    <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: firstDay }).map((_, idx) => (
                      <div key={`e-${idx}`} className="aspect-square bg-slate-50 rounded" />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, day) => {
                      const dayNum = day + 1;
                      const freq = dayFreq[dayNum] || 0;
                      const colorClass = getColor(freq);
                      return (
                        <div key={dayNum} className={`aspect-square flex items-center justify-center text-xs rounded font-medium transition-all ${colorClass}`}>
                          {dayNum}
                          {freq > 0 && <span className="ml-0.5 text-[10px] opacity-70">({freq})</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div id="fila-recuperacao" className="mb-8">
        <h2 className="text-xl font-semibold text-[#1e293b] border-b pb-2 mb-4">
          🔔 Fila de Recuperação
          {filaRecuperacao.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">({filaRecuperacao.length})</span>
          )}
        </h2>
        {filaRecuperacao.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-slate-500 text-sm">
            Nenhuma sessão pendente de follow-up. 🎉
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Sessão</th>
                  <th className="px-3 py-2 text-center">Score</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-center">Horas</th>
                  <th className="px-3 py-2 text-left">Ação sugerida</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filaRecuperacao.slice(0, 20).map(item => {
                  const scoreColor = item.score >= 70 ? 'text-red-700 bg-red-50' : item.score >= 50 ? 'text-amber-700 bg-amber-50' : 'text-slate-700 bg-slate-50';
                  return (
                    <tr key={item.sessionId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs">{item.sessionId.substring(0, 18)}...</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${scoreColor}`}>{item.score}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.valor)}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{item.horas}h</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{item.acao}</td>
                      <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setReservaModal({ sessionId: item.sessionId, acao: 'confirmar', valor: item.valor });
                            setReservaForm({ valor: String(item.valor || ''), categoria: 'SEN', canal: 'whatsapp', motivo: 'preco' });
                          }}
                          className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700"
                        >
                          ✅
                        </button>
                        <button
                          onClick={() => {
                            setReservaModal({ sessionId: item.sessionId, acao: 'perder', valor: item.valor });
                            setReservaForm({ valor: String(item.valor || ''), categoria: 'SEN', canal: 'whatsapp', motivo: 'preco' });
                          }}
                          className="text-xs bg-rose-600 text-white px-2 py-1 rounded hover:bg-rose-700"
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-2 mb-4 gap-2">
        <h2 className="text-xl font-semibold text-[#1e293b]">🧑‍💻 Jornadas dos Clientes</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md overflow-hidden border border-slate-300">
            <button
              onClick={() => setViewMode('lista')}
              className={`text-xs px-3 py-1.5 transition-colors ${viewMode === 'lista' ? 'bg-[#1e293b] text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
            >
              📄 Lista
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`text-xs px-3 py-1.5 transition-colors ${viewMode === 'kanban' ? 'bg-[#1e293b] text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
            >
              📊 Kanban
            </button>
          </div>
          <label className="text-xs text-slate-500 font-medium">Data:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 shadow-sm"
          />
          {selectedDate && (
            <button
              onClick={() => setSelectedDate('')}
              className="text-xs text-slate-400 hover:text-slate-600 bg-slate-100 px-2 py-1.5 rounded-md"
            >
              Ver Todas
            </button>
          )}
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <KanbanView
          sessoes={sessoes}
          ticketMedio={ticketMedio}
          onMarcarConfirmada={(sid, valor) => {
            setReservaModal({ sessionId: sid, acao: 'confirmar', valor });
            setReservaForm({ valor: String(valor || ''), categoria: 'SEN', canal: 'whatsapp', motivo: 'preco' });
          }}
          onMarcarPerdida={(sid, valor) => {
            setReservaModal({ sessionId: sid, acao: 'perder', valor });
            setReservaForm({ valor: String(valor || ''), categoria: 'SEN', canal: 'whatsapp', motivo: 'preco' });
          }}
        />
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          {(() => {
            const JOURNEY_STEPS = [
              { key: 'consulta_iniciada', label: 'Consulta', icon: '🔍' },
              { key: 'consulta_sucesso', label: 'Sucesso', icon: '✅' },
              { key: 'carrinho_adicionado', label: 'Carrinho', icon: '🛒' },
              { key: 'orcamento_visualizado', label: 'Orçamento', icon: '📋' },
              { key: 'whatsapp_enviado', label: 'WhatsApp', icon: '💬' },
            ];
            const filteredSessions = sessoes.filter(s => !selectedDate || s.eventDates.has(selectedDate));
            const sortedSessions = [...filteredSessions].sort((a, b) => b.lastTimestampMs - a.lastTimestampMs);

            if (sortedSessions.length === 0) {
              return (
                <div className="text-gray-500 text-center py-12">
                  <div className="text-3xl mb-2">📅</div>
                  Nenhuma jornada registrada para {selectedDate ? selectedDate.split('-').reverse().join('/') : 'o período'}.
                </div>
              );
            }
            const totalSessions = sortedSessions.length;
            const confirmadasCount = sortedSessions.filter(s => s.statusFinal === 'confirmada').length;
            const perdidasCount = sortedSessions.filter(s => s.statusFinal === 'perdida').length;

            return (
              <>
                <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-200 text-xs text-slate-600 flex flex-wrap gap-4 items-center justify-between">
                  <div>
                    Exibindo <strong>{totalSessions}</strong> sessão(ões){' '}
                    {selectedDate ? `para o dia ${selectedDate.split('-').reverse().join('/')}` : 'no total'}.
                  </div>
                  <div className="flex gap-3">
                    <span className="text-emerald-700 font-medium">✅ {confirmadasCount} Confirmadas</span>
                    <span className="text-rose-700 font-medium">❌ {perdidasCount} Perdidas</span>
                    <span className="text-blue-700 font-medium">🔄 {totalSessions - confirmadasCount - perdidasCount} Pendentes</span>
                  </div>
                </div>

                <div className="divide-y divide-gray-100">
                  {sortedSessions.map(sessao => {
                    const { sessionId, eventos, lastTimestampMs, statusFinal } = sessao;
                    const shortId = sessionId.length > 20 ? `${sessionId.substring(0, 10)}...` : sessionId;
                    const score = calcularLeadScore(sessao, ticketMedio);

                    let status = '🔄 Pendente';
                    let statusColor = 'bg-blue-50 text-blue-700 border-blue-200';
                    if (statusFinal === 'confirmada') {
                      status = '✅ Reserva Confirmada';
                      statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    } else if (statusFinal === 'perdida') {
                      status = '❌ Não Fechou';
                      statusColor = 'bg-rose-50 text-rose-700 border-rose-200';
                    } else if (eventos.some(e => e.event === 'whatsapp_enviado')) {
                      status = '💬 Aguardando fechamento';
                      statusColor = 'bg-amber-50 text-amber-700 border-amber-200';
                    } else if (eventos.some(e => e.event === 'carrinho_adicionado')) {
                      status = '🛒 No carrinho';
                      statusColor = 'bg-purple-50 text-purple-700 border-purple-200';
                    }

                    const lastTimeStr = lastTimestampMs
                      ? new Date(lastTimestampMs).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                      : '';
                    const consulta = eventos.find(e => e.event === 'consulta_iniciada');
                    const d = consulta?.data;

                    return (
                      <div key={sessionId} className="p-5 hover:bg-slate-50/50 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                              {shortId}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColor}`}>
                              {status}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${score >= 70 ? 'bg-red-100 text-red-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                              Score {score}
                            </span>
                            {d && (
                              <span className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                📅 {d.checkin || '-'} até {d.checkout || '-'} • 👥 {d.adultos || 0}a
                                {d.criancas ? ` + ${d.criancas}c` : ''}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-slate-400">{lastTimeStr}</span>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-3">
                          <div className="flex items-center justify-between relative">
                            {JOURNEY_STEPS.map((step, idx) => {
                              const isCompleted = eventos.some(e => e.event === step.key);
                              return (
                                <React.Fragment key={step.key}>
                                  <div className="flex flex-col items-center z-10">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${isCompleted ? 'bg-indigo-600 text-white shadow-sm ring-4 ring-indigo-50' : 'bg-slate-200 text-slate-400'}`}>
                                      {step.icon}
                                    </div>
                                    <span className={`text-[11px] mt-1 font-medium ${isCompleted ? 'text-slate-800' : 'text-slate-400'}`}>
                                      {step.label}
                                    </span>
                                  </div>
                                  {idx < JOURNEY_STEPS.length - 1 && (
                                    <div className="flex-1 h-[2px] mx-2 -mt-4 bg-slate-200">
                                      <div className={`h-full transition-all ${eventos.some(e => e.event === JOURNEY_STEPS[idx + 1]?.key) ? 'bg-indigo-600' : 'bg-transparent'}`} />
                                    </div>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>

                        <div className="pl-2 border-l-2 border-slate-100 space-y-1.5 ml-2 mb-3">
                          {eventos.map((ev, idx) => {
                            const evDate = normalizeDate(ev.timestamp);
                            const eventTime = evDate
                              ? evDate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
                              : '';
                            let detail = '';
                            switch (ev.event) {
                              case 'consulta_iniciada': detail = `Busca para ${ev.data?.adultos || 0} adulto(s)`; break;
                              case 'consulta_sucesso': detail = `${ev.data?.quartos || 0} quarto(s) disponível(is)`; break;
                              case 'consulta_vazia': detail = 'Nenhum quarto disponível'; break;
                              case 'carrinho_adicionado': detail = `${ev.data?.quantidade || 0} item(ns)`; break;
                              case 'orcamento_visualizado': detail = `Valor: ${formatCurrency(Number(ev.data?.total || 0))}`; break;
                              case 'whatsapp_enviado': detail = `Contato por ${ev.data?.cliente || 'Cliente'} (${formatCurrency(Number(ev.data?.total || 0))})`; break;
                              case 'reserva_confirmada': detail = `R$ ${ev.data?.valor_final || 0} · ${ev.data?.categoria || '-'} · ${ev.data?.canal || '-'}`; break;
                              case 'reserva_perdida': detail = `Motivo: ${ev.data?.motivo || '-'}`; break;
                              case 'abandono': detail = `Na etapa: ${ev.data?.stage || 'desconhecida'}`; break;
                              default: detail = typeof ev.data === 'string' ? ev.data : JSON.stringify(ev.data || {});
                            }
                            return (
                              <div key={idx} className="flex items-center justify-between text-xs text-slate-600 hover:text-slate-900">
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                  <span className="font-semibold capitalize text-slate-700">{ev.event.replace(/_/g, ' ')}:</span>
                                  <span className="text-slate-500">{detail}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">{eventTime}</span>
                              </div>
                            );
                          })}
                        </div>

                        {eventos.some(e => e.event === 'whatsapp_enviado') && statusFinal === 'pendente' && (
                          <div className="flex gap-2 pt-2 border-t border-slate-100">
                            <button
                              onClick={() => {
                                setReservaModal({ sessionId, acao: 'confirmar', valor: sessao.valorCotado });
                                setReservaForm({ valor: String(sessao.valorCotado || ''), categoria: 'SEN', canal: 'whatsapp', motivo: 'preco' });
                              }}
                              className="flex-1 bg-emerald-600 text-white px-3 py-2 rounded text-xs font-medium hover:bg-emerald-700"
                            >
                              ✅ Marcar Reserva Confirmada
                            </button>
                            <button
                              onClick={() => {
                                setReservaModal({ sessionId, acao: 'perder', valor: sessao.valorCotado });
                                setReservaForm({ valor: String(sessao.valorCotado || ''), categoria: 'SEN', canal: 'whatsapp', motivo: 'preco' });
                              }}
                              className="flex-1 bg-rose-600 text-white px-3 py-2 rounded text-xs font-medium hover:bg-rose-700"
                            >
                              ❌ Não Fechou
                            </button>
                          </div>
                        )}

                        {statusFinal !== 'pendente' && (
                          <div className="pt-2 border-t border-slate-100 flex gap-2">
                            <button
                              onClick={() => {
                                setReservaModal({ sessionId, acao: statusFinal === 'confirmada' ? 'perder' : 'confirmar', valor: sessao.valorCotado });
                                setReservaForm({ valor: String(sessao.valorCotado || ''), categoria: 'SEN', canal: 'whatsapp', motivo: 'preco' });
                              }}
                              className="text-xs text-slate-500 hover:text-slate-800 underline"
                            >
                              Alterar status
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      )}

      <h2 className="text-xl font-semibold text-[#1e293b] border-b pb-2 mb-4">📋 Conversas</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="grid grid-cols-5 bg-gray-100 p-3 font-semibold text-sm">
          <span>ID</span><span>Mensagens</span><span>Última Atualização</span><span>Origem</span><span>Ações</span>
        </div>
        {filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(conv => {
          const parsedConvDate = normalizeDate(conv.last_updated);
          const formattedDate = parsedConvDate
            ? parsedConvDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : 'Data não disponível';
          return (
            <div key={conv.id} className="grid grid-cols-5 p-3 border-b hover:bg-gray-50 items-center text-sm">
              <span className="font-mono text-xs text-[#1e293b] truncate">{conv.id.substring(0, 20)}...</span>
              <span>{conv.total_messages}</span>
              <span className="text-gray-600 text-xs">{formattedDate}</span>
              <span>{conv.source}</span>
              <button
                onClick={() => handleViewConversation(conv.id)}
                className="bg-[#1e293b] text-white px-2 py-1 rounded text-xs hover:bg-[#2d3a4f]"
              >
                Ver Conversa
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length > pageSize && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 border rounded disabled:opacity-50">◀</button>
          <span className="px-3 py-1">{currentPage} de {Math.ceil(filtered.length / pageSize)}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(Math.ceil(filtered.length / pageSize), p + 1))}
            disabled={currentPage === Math.ceil(filtered.length / pageSize)}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >▶</button>
        </div>
      )}

      {selectedConvId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-100">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-sm">Conversa Detalhada</h3>
                <p className="font-mono text-xs text-slate-300 truncate max-w-md">{selectedConvId}</p>
              </div>
              <button onClick={() => setSelectedConvId(null)} className="text-slate-400 hover:text-white p-1 rounded-lg text-lg leading-none">✕</button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-slate-50 min-h-[300px]">
              {loadingConv ? (
                <div className="flex justify-center items-center h-48 text-slate-500 text-sm">Carregando mensagens...</div>
              ) : convMessages.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">Nenhuma mensagem encontrada.</div>
              ) : (
                convMessages.map((msg, idx) => {
                  const isUser = msg.role === 'user' || msg.role === 'cliente';
                  const parsedMsgDate = normalizeDate(msg.timestamp);
                  return (
                    <div key={idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ${isUser ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'}`}>
                        <div className="font-semibold text-[10px] mb-1 opacity-75">{isUser ? '👤 Cliente' : '🤖 Assistente'}</div>
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      </div>
                      {parsedMsgDate && (
                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                          {parsedMsgDate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-3 bg-white border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedConvId(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-4 py-2 rounded-lg font-medium">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {reservaModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
            <div className={`p-4 text-white ${reservaModal.acao === 'confirmar' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <h3 className="font-semibold text-base">
                {reservaModal.acao === 'confirmar' ? '✅ Confirmar Reserva' : '❌ Marcar como Perdida'}
              </h3>
              <p className="font-mono text-xs text-white/80 truncate mt-0.5">{reservaModal.sessionId}</p>
            </div>
            <div className="p-4 space-y-3">
              {reservaModal.acao === 'confirmar' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Valor final (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={reservaForm.valor}
                      onChange={e => setReservaForm(f => ({ ...f, valor: e.target.value }))}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
                    <select
                      value={reservaForm.categoria}
                      onChange={e => setReservaForm(f => ({ ...f, categoria: e.target.value }))}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                    >
                      <option value="SUP">Apartamento Superior</option>
                      <option value="SEN">Suíte Sênior</option>
                      <option value="MAS">Suíte Master (Cobertura)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Canal</label>
                    <select
                      value={reservaForm.canal}
                      onChange={e => setReservaForm(f => ({ ...f, canal: e.target.value }))}
                      className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="telefone">Telefone</option>
                      <option value="email">E-mail</option>
                    </select>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Motivo da perda</label>
                  <select
                    value={reservaForm.motivo}
                    onChange={e => setReservaForm(f => ({ ...f, motivo: e.target.value }))}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  >
                    <option value="preco">Preço alto</option>
                    <option value="data">Data indisponível</option>
                    <option value="categoria">Categoria inadequada</option>
                    <option value="sumiu">Cliente sumiu</option>
                    <option value="concorrente">Fechou com concorrente</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setReservaModal(null)}
                  disabled={salvandoStatus}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (reservaModal.acao === 'confirmar') {
                      marcarReserva(reservaModal.sessionId, 'confirmada', {
                        valor: Number(reservaForm.valor) || 0,
                        categoria: reservaForm.categoria,
                        canal: reservaForm.canal,
                        valorCotado: reservaModal.valor,
                      });
                    } else {
                      marcarReserva(reservaModal.sessionId, 'perdida', {
                        motivo: reservaForm.motivo,
                        valorCotado: reservaModal.valor,
                      });
                    }
                  }}
                  disabled={salvandoStatus}
                  className={`flex-1 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50 ${reservaModal.acao === 'confirmar' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                >
                  {salvandoStatus ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ========= SUBCOMPONENTES =========

const KanbanView: React.FC<{
  sessoes: SessaoAgrupada[];
  ticketMedio: number;
  onMarcarConfirmada: (sid: string, valor: number) => void;
  onMarcarPerdida: (sid: string, valor: number) => void;
}> = ({ sessoes, ticketMedio, onMarcarConfirmada, onMarcarPerdida }) => {
  const etapas = [
    { key: 'consulta_iniciada', label: 'Buscou', icon: '🔍' },
    { key: 'consulta_sucesso', label: 'Viu quartos', icon: '✅' },
    { key: 'carrinho_adicionado', label: 'Carrinho', icon: '🛒' },
    { key: 'orcamento_visualizado', label: 'Orçamento', icon: '📋' },
    { key: 'whatsapp_enviado', label: 'WhatsApp', icon: '💬' },
  ];

  const porEtapa = (idx: number) => sessoes.filter(s => {
    if (s.statusFinal !== 'pendente') return false;
    const etapasDaSessao = s.eventos.map(e => e.event);
    const ultimaEtapa = etapas.map(e => e.key).filter(k => etapasDaSessao.includes(k)).pop();
    return ultimaEtapa === etapas[idx].key;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
      {etapas.map((etapa, idx) => {
        const cards = porEtapa(idx).sort((a, b) => calcularLeadScore(b, ticketMedio) - calcularLeadScore(a, ticketMedio));
        return (
          <div key={etapa.key} className="bg-slate-50 rounded-lg p-2 border border-slate-200 min-h-[200px]">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold text-slate-700">{etapa.icon} {etapa.label}</span>
              <span className="text-xs font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full">{cards.length}</span>
            </div>
            <div className="space-y-2">
              {cards.slice(0, 8).map(s => {
                const score = calcularLeadScore(s, ticketMedio);
                const consulta = s.eventos.find(e => e.event === 'consulta_iniciada');
                return (
                  <div key={s.sessionId} className="bg-white rounded p-2 shadow-sm border border-slate-100 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[10px] text-slate-500">{s.sessionId.substring(0, 10)}...</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${score >= 70 ? 'bg-red-100 text-red-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {score}
                      </span>
                    </div>
                    {consulta?.data?.checkin && (
                      <div className="text-[10px] text-slate-500 mb-1">
                        {consulta.data.checkin} · {consulta.data.adultos}a{consulta.data.criancas ? `+${consulta.data.criancas}c` : ''}
                      </div>
                    )}
                    {s.valorCotado > 0 && (
                      <div className="text-[11px] font-semibold text-emerald-700 mb-1">{formatCurrency(s.valorCotado)}</div>
                    )}
                    {etapa.key === 'whatsapp_enviado' && (
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={() => onMarcarConfirmada(s.sessionId, s.valorCotado)}
                          className="flex-1 bg-emerald-600 text-white px-1 py-0.5 rounded text-[10px] hover:bg-emerald-700"
                          title="Confirmar reserva"
                        >✅</button>
                        <button
                          onClick={() => onMarcarPerdida(s.sessionId, s.valorCotado)}
                          className="flex-1 bg-rose-600 text-white px-1 py-0.5 rounded text-[10px] hover:bg-rose-700"
                          title="Não fechou"
                        >❌</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {cards.length > 8 && (
                <div className="text-[10px] text-slate-400 text-center">+ {cards.length - 8} mais</div>
              )}
              {cards.length === 0 && (
                <div className="text-[10px] text-slate-400 text-center py-4">Vazio</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const OcupacaoTable: React.FC<{
  ocupacao: OcupacaoDiaria[];
  sessoes: SessaoAgrupada[];
}> = ({ ocupacao, sessoes }) => {
  const buscasPorData: Record<string, number> = {};
  sessoes.forEach(s => {
    const c = s.eventos.find(e => e.event === 'consulta_iniciada');
    const checkin = c?.data?.checkin;
    if (checkin) buscasPorData[checkin] = (buscasPorData[checkin] || 0) + 1;
  });

  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-700">📅 Próximos 60 dias — Demanda vs Ocupação</h3>
        <div className="text-xs text-slate-500">Total: 18 unidades (6 SUP · 6 SEN · 6 MAS)</div>
      </div>
      <div className="overflow-x-auto max-h-[420px]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-100 text-slate-700">
            <tr>
              <th className="px-2 py-2 text-left">Data</th>
              <th className="px-2 py-2 text-center">Buscas</th>
              <th className="px-2 py-2 text-center">SUP</th>
              <th className="px-2 py-2 text-center">SEN</th>
              <th className="px-2 py-2 text-center">MAS</th>
              <th className="px-2 py-2 text-center">Ocupação</th>
              <th className="px-2 py-2 text-left">Barra</th>
              <th className="px-2 py-2 text-left">Sinal</th>
            </tr>
          </thead>
          <tbody>
            {ocupacao.map((d, i) => {
              const [dd, mm, yyyy] = d.data.split('/');
              const isoDate = `${yyyy}-${mm}-${dd}`;
              const buscas = buscasPorData[isoDate] || 0;
              const pct = Math.round(d.ocupacao * 100);
              const corBarra = pct >= 80 ? 'bg-red-600' : pct >= 60 ? 'bg-orange-500' : pct >= 40 ? 'bg-amber-400' : 'bg-emerald-500';

              let sinal = '';
              let sinalCor = '';
              if (buscas >= 3 && pct < 40) { sinal = '🔴 Subir preço'; sinalCor = 'text-red-700'; }
              else if (buscas >= 3 && pct >= 60) { sinal = '🟡 Já no caminho'; sinalCor = 'text-amber-700'; }
              else if (buscas <= 1 && pct < 30) { sinal = '🔵 Promover'; sinalCor = 'text-blue-700'; }
              else if (buscas <= 1 && pct >= 70) { sinal = '⚪ Manter'; sinalCor = 'text-slate-500'; }
              else { sinal = '·'; sinalCor = 'text-slate-400'; }

              const isHoje = isoDate === hojeStr;

              return (
                <tr key={i} className={`border-b border-slate-100 ${isHoje ? 'bg-indigo-50' : ''}`}>
                  <td className="px-2 py-1.5 font-mono">{d.data}</td>
                  <td className="px-2 py-1.5 text-center font-semibold">{buscas || '·'}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500">{d.porCategoria.SUP}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500">{d.porCategoria.SEN}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500">{d.porCategoria.MAS}</td>
                  <td className="px-2 py-1.5 text-center font-bold">{pct}%</td>
                  <td className="px-2 py-1.5 w-32">
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${corBarra}`} style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td className={`px-2 py-1.5 text-xs font-medium ${sinalCor}`}>{sinal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        <strong>Sinal:</strong> 🔴 buscas altas + ocupação baixa → oportunidade de subir · 🔵 buscas baixas + ocupação baixa → promoção · ⚪ ocupação alta → manter.
      </p>
    </div>
  );
};

// ========= COMPONENTES AUXILIARES =========
const StatCard: React.FC<{ label: string; value: number | string; suffix?: string }> = ({ label, value, suffix = '' }) => (
  <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#1e293b]">
    <div className="text-2xl font-bold text-[#1e293b]">{value}{suffix}</div>
    <div className="text-sm text-gray-600">{label}</div>
  </div>
);

const TrackingCard: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => {
  const borderColor =
    color === 'gold' ? 'border-t-yellow-500'
    : color === 'red' ? 'border-t-red-500'
    : color === 'green' ? 'border-t-emerald-500'
    : 'border-t-[#1e293b]';
  return (
    <div className={`bg-white p-3 rounded-lg shadow text-center border-t-4 ${borderColor}`}>
      <div className="text-2xl font-bold text-[#1e293b]">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
};