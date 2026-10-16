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
interface AlertaFlutuacao {
  data: string;
  dataBR: string;
  buscas: number;
  ocupacaoPct: number;
  livres: number;
  tipo: 'subir' | 'promover' | 'manter' | 'observar';
  sugestao: string;
  deltaPct: number;
  prioridade: number;
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
const calcularLeadScore = (s: SessaoAgrupada, adr: number): number => {
  const etapas = ['consulta_iniciada', 'consulta_sucesso', 'carrinho_adicionado', 'orcamento_visualizado', 'whatsapp_enviado'];
  const ultimo = s.ultimoEvento;
  const idxUltimo = ultimo ? etapas.indexOf(ultimo.event) : -1;
  const etapasPct = idxUltimo >= 0 ? (idxUltimo + 1) / etapas.length : 0;
  const valorPct = adr > 0 ? Math.min(s.valorCotado / adr, 1) : 0;

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

// ========= ABANDONO POR FAIXA DE VALOR (universo = carrinho) =========
const analisarAbandonoPorValor = (sessoes: SessaoAgrupada[]) => {
  const bins = [
    { min: 1, max: 500, label: 'R$ 1–500' },
    { min: 500, max: 800, label: 'R$ 500–800' },
    { min: 800, max: 1100, label: 'R$ 800–1.100' },
    { min: 1100, max: 1500, label: 'R$ 1.100–1.500' },
    { min: 1500, max: Infinity, label: 'R$ 1.500+' },
  ];

  const comCarrinho = sessoes.filter(s =>
    s.eventos.some(e => e.event === 'carrinho_adicionado')
  );
  const comValor = comCarrinho.filter(s => s.valorCotado > 0);
  const semValor = comCarrinho.filter(s => s.valorCotado === 0);

  const construirBin = (label: string, min: number, max: number, sessoesDoBin: SessaoAgrupada[]) => {
    const total = sessoesDoBin.length;
    const comWhats = sessoesDoBin.filter(s =>
      s.eventos.some(e => e.event === 'whatsapp_enviado')
    ).length;
    const abandonaram = total - comWhats;
    const confirmadas = sessoesDoBin.filter(s => s.statusFinal === 'confirmada').length;
    const perdidas = sessoesDoBin.filter(s => s.statusFinal === 'perdida').length;

    return {
      label, min, max, total, comWhats,
      taxaWhats: total ? Math.round((comWhats / total) * 100) : 0,
      abandonaram,
      taxaAbandono: total ? Math.round((abandonaram / total) * 100) : 0,
      confirmadas,
      taxaFech: total ? Math.round((confirmadas / total) * 100) : 0,
      perdidas,
      taxaPerda: total ? Math.round((perdidas / total) * 100) : 0,
    };
  };

  const resultado = bins
    .map(bin =>
      construirBin(
        bin.label, bin.min, bin.max,
        comValor.filter(s => s.valorCotado >= bin.min && s.valorCotado < bin.max),
      )
    )
    .filter(b => b.total > 0);

  if (semValor.length > 0) {
    resultado.push(construirBin('Sem orçamento visto', 0, 0, semValor));
  }
  return resultado;
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
const gerarFilaRecuperacao = (sessoes: SessaoAgrupada[], adr: number) => {
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
        sessionId: s.sessionId, score: calcularLeadScore(s, adr),
        valor: s.valorCotado, horas, acao, temWhats,
      };
    })
    .sort((a, b) => b.score - a.score);
};

// ========= STATS DERIVADOS =========
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

// ========= ALERTAS DINÂMICOS DE FLUTUAÇÃO =========
const gerarAlertasFlutuacao = (
  ocupacao: OcupacaoDiaria[],
  sessoes: SessaoAgrupada[],
): AlertaFlutuacao[] => {
  const buscasPorData: Record<string, number> = {};
  sessoes.forEach(s => {
    const c = s.eventos.find(e => e.event === 'consulta_iniciada');
    const checkin = c?.data?.checkin;
    if (checkin) buscasPorData[checkin] = (buscasPorData[checkin] || 0) + 1;
  });

  const alertas: AlertaFlutuacao[] = [];
  ocupacao.forEach(d => {
    const [dd, mm, yyyy] = d.data.split('/');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const buscas = buscasPorData[isoDate] || 0;
    const pct = Math.round(d.ocupacao * 100);
    const dataBR = `${dd}/${mm}`;

    let tipo: AlertaFlutuacao['tipo'] = 'observar';
    let sugestao = '';
    let deltaPct = 0;
    let prioridade = 0;

    if (buscas >= 4 && pct < 40) {
      tipo = 'subir'; deltaPct = 8; prioridade = 3;
      sugestao = `${buscas} buscas para apenas ${pct}% de ocupação. Demanda reprimida — subir BAR em ~${deltaPct}%.`;
    } else if (buscas >= 3 && pct < 40) {
      tipo = 'subir'; deltaPct = 5; prioridade = 2;
      sugestao = `${buscas} buscas para ${pct}% de ocupação. Subir BAR em ~${deltaPct}%.`;
    } else if (buscas <= 1 && pct < 30) {
      tipo = 'promover'; deltaPct = -10; prioridade = 2;
      sugestao = `Baixa demanda (${buscas} busca${buscas === 1 ? '' : 's'}) e ${pct}% de ocupação. Considerar flash sale ~${Math.abs(deltaPct)}% off.`;
    } else if (pct >= 70) {
      tipo = 'manter'; deltaPct = 0; prioridade = 1;
      sugestao = `Ocupação em ${pct}% (${d.livres} livre${d.livres === 1 ? '' : 's'}). Manter tarifa.`;
    }

    if (tipo !== 'observar') {
      alertas.push({
        data: isoDate, dataBR, buscas, ocupacaoPct: pct, livres: d.livres,
        tipo, sugestao, deltaPct, prioridade,
      });
    }
  });

  return alertas.sort((a, b) => {
    if (b.prioridade !== a.prioridade) return b.prioridade - a.prioridade;
    return a.data.localeCompare(b.data);
  });
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'demanda' | 'jornadas' | 'conversas'>('dashboard');

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

  // ========= FETCH TRACKING =========
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
  const trackingStats = useMemo(() => calcularStatsDerivados(sessoes), [sessoes]);

  // 🔥 ADR (Average Daily Rate) — receita por noite reservada
  const adr = useMemo(() => {
    const confirmadas = sessoes.filter(s => s.statusFinal === 'confirmada');
    if (!confirmadas.length) return 0;
    const valoresPorNoite: number[] = [];
    confirmadas.forEach(s => {
      const conf = s.eventos.find(e => e.event === 'reserva_confirmada');
      const valor = Number(conf?.data?.valor_final || 0);
      if (valor <= 0) return;
      const consulta = s.eventos.find(e => e.event === 'consulta_iniciada');
      const d = consulta?.data;
      let noites = 1;
      if (d?.checkin && d?.checkout) {
        const diff = (new Date(d.checkout).getTime() - new Date(d.checkin).getTime()) / 86400000;
        if (diff > 0) noites = diff;
      }
      valoresPorNoite.push(valor / noites);
    });
    return valoresPorNoite.length
      ? valoresPorNoite.reduce((a, b) => a + b, 0) / valoresPorNoite.length
      : 0;
  }, [sessoes]);

  // ADR Proxy: quando não há noites, usa média simples das reservas
  const adrProxy = useMemo(() => {
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
      if (msF && msL) {
        const diff = (msL - msF) / 86400000;
        if (diff > 0) ciclos.push(diff);
      }
    });
    const cicloMedio = ciclos.length ? ciclos.reduce((a, b) => a + b, 0) / ciclos.length : 0;
    return {
      whats: whats.length,
      confirmadas: confirmadas.length,
      perdidas: perdidas.length,
      taxa: whats.length ? Math.round(confirmadas.length / whats.length * 100) : 0,
      receita,
      cicloMedio,
      cicloAmostra: ciclos.length,
    };
  }, [sessoes]);

  const abandonoPorValor = useMemo(() => analisarAbandonoPorValor(sessoes), [sessoes]);
  const leadTimeData = useMemo(() => analisarLeadTime(sessoes), [sessoes]);
  const filaRecuperacao = useMemo(() => gerarFilaRecuperacao(sessoes, adrProxy), [sessoes, adrProxy]);
  const alertasFlutuacao = useMemo(
    () => gerarAlertasFlutuacao(ocupacao, sessoes),
    [ocupacao, sessoes]
  );

  const consultasPorSessao = useMemo(() => {
    const resultado: TrackingEvent[] = [];
    sessoes.forEach(s => {
      const cs = s.eventos.filter(e => e.event === 'consulta_iniciada' && e.data?.checkin);
      if (cs.length > 0) resultado.push(cs[cs.length - 1]);
    });
    return resultado;
  }, [sessoes]);

  const pendenciasAntigas = useMemo(() => {
    const agora = Date.now();
    return sessoes.filter(s => {
      const temWhats = s.eventos.some(e => e.event === 'whatsapp_enviado');
      const horas = (agora - s.lastTimestampMs) / 3600000;
      return temWhats && s.statusFinal === 'pendente' && horas > 48;
    });
  }, [sessoes]);

  if (loading) return <div className="text-center p-8">Carregando...</div>;
  if (error) return <div className="text-red-600 p-8">{error}</div>;

  const conversionRate = trackingStats.consultas > 0
    ? ((trackingStats.whatsapp / trackingStats.consultas) * 100).toFixed(0)
    : 0;

  const alertasAltaPrioridade = alertasFlutuacao.filter(a => a.prioridade >= 2).length;

  // ========= TAB DEFINITION =========
  const tabs: Array<{
    key: typeof activeTab;
    label: string;
    icon: string;
    badge?: number;
    badgeColor?: string;
  }> = [
    { key: 'dashboard', label: 'Dashboard Executivo', icon: '📊' },
    {
      key: 'demanda',
      label: 'Demanda & Tarifa',
      icon: '🌡️',
      badge: alertasAltaPrioridade > 0 ? alertasAltaPrioridade : undefined,
      badgeColor: 'bg-rose-500',
    },
    {
      key: 'jornadas',
      label: 'Jornadas & Pipeline',
      icon: '🧑‍💻',
      badge: filaRecuperacao.length > 0 ? filaRecuperacao.length : undefined,
      badgeColor: 'bg-amber-500',
    },
    { key: 'conversas', label: 'Conversas', icon: '💬' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <header className="bg-slate-900 text-white px-6 py-4 rounded-xl mb-6 flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🏨 Painel Administrativo</h1>
            <p className="text-xs text-slate-400 mt-0.5">Hotel Granja Brasil · Itaipava</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRefreshing ? '🔄 Atualizando...' : '🔄 Atualizar'}
            </button>
            <button
              onClick={exportCSV}
              className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              📥 CSV
            </button>
          </div>
        </header>

        {/* Banner de pendências */}
        {pendenciasAntigas.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 px-4 py-3 mb-6 rounded-xl flex justify-between items-center flex-wrap gap-2">
            <span className="text-sm text-amber-900">
              ⚠️ <strong>{pendenciasAntigas.length}</strong> sessão(ões) com WhatsApp enviado há mais de 48h sem status de reserva.
            </span>
            <button
              onClick={() => {
                setActiveTab('jornadas');
                setTimeout(() => {
                  const el = document.getElementById('fila-recuperacao');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
              }}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              Ver fila
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded-xl mb-6 p-1.5 flex gap-1 overflow-x-auto">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={`${tab.badgeColor} text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ============= TAB 1: DASHBOARD EXECUTIVO ============= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPIs de conversas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Conversas" value={stats.total} />
              <StatCard label="Mensagens" value={stats.msgs.toLocaleString()} />
              <StatCard label="Hoje" value={stats.today} />
              <StatCard label="Média" value={stats.avg.toFixed(1)} suffix=" msg/conv" />
            </div>

            {/* Revenue Alerts compacto */}
            {alertasFlutuacao.filter(a => a.prioridade >= 2).length > 0 && (
              <RevenueAlerts
                alertas={alertasFlutuacao}
                limit={3}
                title="⚡ Ações Imediatas de Tarifa"
                onVerTodas={() => setActiveTab('demanda')}
              />
            )}

            {/* KPIs comerciais */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">💰 Resultado Comercial</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <ExecCard
                  label="Reservas confirmadas"
                  value={kpisFechamento.confirmadas}
                  accent="emerald"
                  icon="✅"
                />
                <ExecCard
                  label="Reservas perdidas"
                  value={kpisFechamento.perdidas}
                  accent="rose"
                  icon="❌"
                />
                <ExecCard
                  label="Taxa de fechamento"
                  value={`${kpisFechamento.taxa}%`}
                  sub="WhatsApp → Reserva"
                  accent="indigo"
                  icon="📈"
                />
                <ExecCard
                  label="ADR (média/noite)"
                  value={formatCurrency(adr)}
                  sub={`Proxy ${formatCurrency(adrProxy)}`}
                  accent="amber"
                  icon="🏷️"
                />
                <ExecCard
                  label="Receita total"
                  value={formatCurrency(kpisFechamento.receita)}
                  sub={
                    kpisFechamento.cicloMedio > 0
                      ? `Ciclo médio: ${kpisFechamento.cicloMedio.toFixed(1)}d (${kpisFechamento.cicloAmostra})`
                      : 'Ciclo médio: —'
                  }
                  accent="emerald"
                  icon="💵"
                />
              </div>
            </div>

            {/* Funil */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">📈 Funil de Conversão</h2>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-slate-600">Taxa de conversão (consulta → WhatsApp)</span>
                  <span className="text-xl font-bold text-slate-900">{conversionRate}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5">
                  <div
                    className="bg-slate-900 h-2.5 rounded-full transition-all"
                    style={{ width: `${Math.min(Number(conversionRate), 100)}%` }}
                  ></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-9 gap-2 mt-5">
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
                <p className="text-[11px] text-slate-400 mt-4">
                  Contagens de <strong>sessões únicas</strong>. Consultas = sessões que iniciaram pelo menos 1 busca.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============= TAB 2: DEMANDA & TARIFA ============= */}
        {activeTab === 'demanda' && (
          <div className="space-y-6">
            {/* Alerta de tarifa completo */}
            {alertasFlutuacao.length > 0 && (
              <RevenueAlerts alertas={alertasFlutuacao} limit={12} title="⚡ Sugestões de Flutuação de Tarifa" />
            )}

            {/* Demanda x Ocupação */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">📅 Demanda × Ocupação × Preço</h2>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                {loadingOcupacao ? (
                  <div className="text-center py-8 text-slate-500 text-sm">Carregando dados de ocupação...</div>
                ) : ocupacao.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    Não foi possível carregar dados de ocupação da API.
                    {ocupacaoRange && (
                      <span className="block text-xs mt-1">Range: {ocupacaoRange.start} → {ocupacaoRange.end}</span>
                    )}
                  </div>
                ) : (
                  <OcupacaoTable ocupacao={ocupacao} sessoes={sessoes} />
                )}
              </div>
            </div>

            {/* Análise por Antecedência */}
            {leadTimeData.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">⏱️ Análise por Antecedência</h2>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wide">
                        <th className="px-3 py-2 text-left font-medium">Faixa (check-in − busca)</th>
                        <th className="px-3 py-2 text-center font-medium">Buscas</th>
                        <th className="px-3 py-2 text-center font-medium">Conv. WhatsApp</th>
                        <th className="px-3 py-2 text-center font-medium">Taxa de Fechamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadTimeData.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 font-medium text-slate-700">{row.faixa}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{row.buscas}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-indigo-600 font-semibold">{row.taxaWhats}%</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-emerald-600 font-semibold">{row.taxaFech}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-slate-400 mt-4">
                    Leads com maior antecedência tendem a comparar mais. Leads próximos ao check-in decidem por urgência.
                  </p>
                </div>
              </div>
            )}

            {/* Abandono do Carrinho */}
            {abandonoPorValor.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">
                  💸 Abandono do Carrinho por Faixa de Preço
                </h2>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="space-y-4">
                    {abandonoPorValor.map((bin, i) => {
                      const maxTotal = Math.max(...abandonoPorValor.map(b => b.total), 1);
                      const widthTotal = (bin.total / maxTotal) * 100;
                      const abandono = bin.taxaAbandono;
                      const cor =
                        abandono >= 70 ? 'bg-rose-500'
                        : abandono >= 50 ? 'bg-orange-500'
                        : abandono >= 30 ? 'bg-amber-400'
                        : 'bg-emerald-500';
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="font-medium text-slate-700">{bin.label}</span>
                            <span className="text-slate-500">
                              {bin.total} carrinho{bin.total === 1 ? '' : 's'} ·{' '}
                              <span className="text-indigo-600 font-semibold">{bin.taxaWhats}%</span> foram ao WhatsApp ·{' '}
                              <span className={abandono >= 50 ? 'text-rose-600 font-semibold' : 'text-slate-600 font-semibold'}>
                                {abandono}% abandonaram
                              </span>
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2.5">
                            <div className={`h-2.5 rounded-full ${cor} transition-all`} style={{ width: `${widthTotal}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 mt-5">
                    Universo: sessões que adicionaram uma acomodação ao carrinho. Abandono = não chegaram a enviar o pedido pelo WhatsApp. Faixa determinada pelo último valor visto (orçamento ou WhatsApp). Sessões que abandonaram antes de ver qualquer valor aparecem em "Sem orçamento visto".
                  </p>
                </div>
              </div>
            )}

            {/* Mapa de Calor */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">🗺️ Mapa de Calor de Buscas</h2>
              {(() => {
                const consultas = consultasPorSessao;
                if (consultas.length === 0) {
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">
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
                  if (freq === 0) return 'bg-slate-50';
                  const i = Math.min(1, freq / maxFreq);
                  if (i <= 0.2) return 'bg-yellow-100';
                  if (i <= 0.4) return 'bg-yellow-300';
                  if (i <= 0.6) return 'bg-orange-300';
                  if (i <= 0.8) return 'bg-orange-500 text-white';
                  return 'bg-rose-500 text-white';
                };
                const monthName = monthNamesFull[month - 1];
                return (
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <MiniStat label="Total de buscas" value={consultas.length} accent="indigo" />
                      <MiniStat label="Datas únicas" value={freqArray.length} accent="emerald" />
                      <MiniStat
                        label="Pico de buscas (dia)"
                        value={freqArray[0]?.count || 0}
                        sub={freqArray[0]?.checkin}
                        accent="amber"
                      />
                      <MiniStat label="Mês mais quente" value={monthName} accent="rose" />
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">📋 Top 15 — Frequência por Check-in</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wide">
                              <th className="px-3 py-2 text-left font-medium">Check-in</th>
                              <th className="px-3 py-2 text-left font-medium">Check-out</th>
                              <th className="px-3 py-2 text-left font-medium">Hóspedes</th>
                              <th className="px-3 py-2 text-center font-medium">Freq.</th>
                              <th className="px-3 py-2 text-left font-medium w-48">Intensidade</th>
                            </tr>
                          </thead>
                          <tbody>
                            {freqArray.slice(0, 15).map((item, idx) => {
                              const max = freqArray[0]?.count || 1;
                              const width = (item.count / max) * 100;
                              return (
                                <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                                  <td className="px-3 py-2 font-medium text-slate-700 font-mono text-xs">{item.checkin}</td>
                                  <td className="px-3 py-2 text-slate-600 font-mono text-xs">{item.checkout || '-'}</td>
                                  <td className="px-3 py-2 text-slate-600 text-xs">
                                    {item.adultos}a{item.criancas ? ` + ${item.criancas}c` : ''}
                                  </td>
                                  <td className="px-3 py-2 text-center font-bold text-slate-900">{item.count}</td>
                                  <td className="px-3 py-2">
                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                      <div
                                        className="bg-indigo-500 h-2 rounded-full transition-all"
                                        style={{ width: `${Math.min(width, 100)}%` }}
                                      />
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
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                        <h3 className="text-sm font-semibold text-slate-700">
                          🗓️ Mapa de Calor – {monthName} de {year}
                        </h3>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-500 font-medium">Mês:</label>
                          <select
                            value={displayedMonth}
                            onChange={(e) => setHeatmapMonth(e.target.value)}
                            className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-slate-700"
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
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500 mb-1.5">
                          <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {Array.from({ length: firstDay }).map((_, idx) => (
                            <div key={`e-${idx}`} className="aspect-square bg-transparent rounded" />
                          ))}
                          {Array.from({ length: daysInMonth }).map((_, day) => {
                            const dayNum = day + 1;
                            const freq = dayFreq[dayNum] || 0;
                            const colorClass = getColor(freq);
                            return (
                              <div
                                key={dayNum}
                                className={`aspect-square flex items-center justify-center text-xs rounded-lg font-medium transition-all ${colorClass}`}
                              >
                                {dayNum}
                                {freq > 0 && <span className="ml-0.5 text-[10px] opacity-70">({freq})</span>}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-4 text-[11px] text-slate-500">
                          <span>Baixa</span>
                          <div className="flex gap-0.5">
                            <div className="w-3.5 h-3.5 bg-yellow-100 rounded"></div>
                            <div className="w-3.5 h-3.5 bg-yellow-300 rounded"></div>
                            <div className="w-3.5 h-3.5 bg-orange-300 rounded"></div>
                            <div className="w-3.5 h-3.5 bg-orange-500 rounded"></div>
                            <div className="w-3.5 h-3.5 bg-rose-500 rounded"></div>
                          </div>
                          <span>Alta</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ============= TAB 3: JORNADAS & PIPELINE ============= */}
        {activeTab === 'jornadas' && (
          <div className="space-y-6">
            {/* Fila de Recuperação */}
            <div id="fila-recuperacao">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">
                🔔 Fila de Recuperação
                {filaRecuperacao.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-slate-500">({filaRecuperacao.length})</span>
                )}
              </h2>
              {filaRecuperacao.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">
                  Nenhuma sessão pendente de follow-up. 🎉
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-slate-500 text-xs uppercase tracking-wide">
                        <th className="px-4 py-2.5 text-left font-medium">Sessão</th>
                        <th className="px-4 py-2.5 text-center font-medium">Score</th>
                        <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                        <th className="px-4 py-2.5 text-center font-medium">Horas</th>
                        <th className="px-4 py-2.5 text-left font-medium">Ação sugerida</th>
                        <th className="px-4 py-2.5 text-right font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filaRecuperacao.slice(0, 20).map(item => {
                        const scoreColor =
                          item.score >= 70 ? 'text-rose-700 bg-rose-50'
                          : item.score >= 50 ? 'text-amber-700 bg-amber-50'
                          : 'text-slate-600 bg-slate-100';
                        return (
                          <tr key={item.sessionId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                              {item.sessionId.substring(0, 18)}...
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${scoreColor}`}>
                                {item.score}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                              {formatCurrency(item.valor)}
                            </td>
                            <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{item.horas}h</td>
                            <td className="px-4 py-2.5 text-xs text-slate-600">{item.acao}</td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              <button
                                onClick={() => {
                                  setReservaModal({ sessionId: item.sessionId, acao: 'confirmar', valor: item.valor });
                                  setReservaForm({ valor: String(item.valor || ''), categoria: 'SEN', canal: 'whatsapp', motivo: 'preco' });
                                }}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-md mr-1 transition-colors"
                                title="Confirmar reserva"
                              >
                                ✅
                              </button>
                              <button
                                onClick={() => {
                                  setReservaModal({ sessionId: item.sessionId, acao: 'perder', valor: item.valor });
                                  setReservaForm({ valor: String(item.valor || ''), categoria: 'SEN', canal: 'whatsapp', motivo: 'preco' });
                                }}
                                className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-md transition-colors"
                                title="Não fechou"
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

            {/* Jornadas */}
            <div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                <h2 className="text-lg font-semibold text-slate-900">🧑‍💻 Jornadas dos Clientes</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-lg overflow-hidden border border-slate-200 p-0.5 bg-slate-50">
                    <button
                      onClick={() => setViewMode('lista')}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                        viewMode === 'lista' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      📄 Lista
                    </button>
                    <button
                      onClick={() => setViewMode('kanban')}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                        viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      📊 Kanban
                    </button>
                  </div>
                  <label className="text-xs text-slate-500 font-medium">Data:</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-700"
                  />
                  {selectedDate && (
                    <button
                      onClick={() => setSelectedDate('')}
                      className="text-xs text-slate-400 hover:text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      Ver Todas
                    </button>
                  )}
                </div>
              </div>

              {viewMode === 'kanban' ? (
                <KanbanView
                  sessoes={sessoes}
                  adr={adrProxy}
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
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
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
                        <div className="text-slate-500 text-center py-12 text-sm">
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
                        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 text-xs text-slate-600 flex flex-wrap gap-4 items-center justify-between">
                          <div>
                            Exibindo <strong>{totalSessions}</strong> sessão(ões){' '}
                            {selectedDate ? `para o dia ${selectedDate.split('-').reverse().join('/')}` : 'no total'}.
                          </div>
                          <div className="flex gap-3">
                            <span className="text-emerald-700 font-medium">✅ {confirmadasCount} Confirmadas</span>
                            <span className="text-rose-700 font-medium">❌ {perdidasCount} Perdidas</span>
                            <span className="text-blue-700 font-medium">
                              🔄 {totalSessions - confirmadasCount - perdidasCount} Pendentes
                            </span>
                          </div>
                        </div>

                        <div className="divide-y divide-slate-100">
                          {sortedSessions.map(sessao => {
                            const { sessionId, eventos, lastTimestampMs, statusFinal } = sessao;
                            const shortId = sessionId.length > 20 ? `${sessionId.substring(0, 10)}...` : sessionId;
                            const score = calcularLeadScore(sessao, adrProxy);

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
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                        score >= 70 ? 'bg-rose-100 text-rose-700'
                                        : score >= 50 ? 'bg-amber-100 text-amber-700'
                                        : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
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
                                            <div
                                              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                                                isCompleted
                                                  ? 'bg-slate-900 text-white shadow-sm ring-4 ring-slate-100'
                                                  : 'bg-slate-200 text-slate-400'
                                              }`}
                                            >
                                              {step.icon}
                                            </div>
                                            <span
                                              className={`text-[11px] mt-1 font-medium ${
                                                isCompleted ? 'text-slate-800' : 'text-slate-400'
                                              }`}
                                            >
                                              {step.label}
                                            </span>
                                          </div>
                                          {idx < JOURNEY_STEPS.length - 1 && (
                                            <div className="flex-1 h-[2px] mx-2 -mt-4 bg-slate-200">
                                              <div
                                                className={`h-full transition-all ${
                                                  eventos.some(e => e.event === JOURNEY_STEPS[idx + 1]?.key)
                                                    ? 'bg-slate-900'
                                                    : 'bg-transparent'
                                                }`}
                                              />
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
                                      ? evDate.toLocaleTimeString('pt-BR', {
                                          timeZone: 'America/Sao_Paulo',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
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
                                      <div key={idx} className="flex items-center justify-between text-xs text-slate-600">
                                        <div className="flex items-center gap-2">
                                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                          <span className="font-semibold capitalize text-slate-700">
                                            {ev.event.replace(/_/g, ' ')}:
                                          </span>
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
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                                    >
                                      ✅ Marcar Reserva Confirmada
                                    </button>
                                    <button
                                      onClick={() => {
                                        setReservaModal({ sessionId, acao: 'perder', valor: sessao.valorCotado });
                                        setReservaForm({ valor: String(sessao.valorCotado || ''), categoria: 'SEN', canal: 'whatsapp', motivo: 'preco' });
                                      }}
                                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                                    >
                                      ❌ Não Fechou
                                    </button>
                                  </div>
                                )}

                                {statusFinal !== 'pendente' && (
                                  <div className="pt-2 border-t border-slate-100 flex gap-2">
                                    <button
                                      onClick={() => {
                                        setReservaModal({
                                          sessionId,
                                          acao: statusFinal === 'confirmada' ? 'perder' : 'confirmar',
                                          valor: sessao.valorCotado,
                                        });
                                        setReservaForm({
                                          valor: String(sessao.valorCotado || ''),
                                          categoria: 'SEN',
                                          canal: 'whatsapp',
                                          motivo: 'preco',
                                        });
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
            </div>
          </div>
        )}

        {/* ============= TAB 4: CONVERSAS ============= */}
        {activeTab === 'conversas' && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              💬 Conversas
              <span className="ml-2 text-sm font-normal text-slate-500">({filtered.length})</span>
            </h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-5 gap-2 bg-slate-50 px-4 py-3 text-xs uppercase tracking-wide text-slate-500 font-medium border-b border-slate-200">
                <span>ID</span>
                <span>Mensagens</span>
                <span>Última Atualização</span>
                <span>Origem</span>
                <span className="text-right">Ações</span>
              </div>
              {filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(conv => {
                const parsedConvDate = normalizeDate(conv.last_updated);
                const formattedDate = parsedConvDate
                  ? parsedConvDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                  : 'Data não disponível';
                return (
                  <div
                    key={conv.id}
                    className="grid grid-cols-5 gap-2 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 items-center text-sm"
                  >
                    <span className="font-mono text-xs text-slate-700 truncate">{conv.id.substring(0, 20)}...</span>
                    <span className="text-slate-700">{conv.total_messages}</span>
                    <span className="text-slate-500 text-xs">{formattedDate}</span>
                    <span className="text-slate-600 text-xs">{conv.source}</span>
                    <div className="text-right">
                      <button
                        onClick={() => handleViewConversation(conv.id)}
                        className="bg-slate-900 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      >
                        Ver Conversa
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length > pageSize && (
              <div className="flex justify-center items-center gap-2 mt-5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-100 transition-colors"
                >
                  ◀
                </button>
                <span className="px-4 py-1.5 text-sm text-slate-600">
                  {currentPage} de {Math.ceil(filtered.length / pageSize)}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filtered.length / pageSize), p + 1))}
                  disabled={currentPage === Math.ceil(filtered.length / pageSize)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-100 transition-colors"
                >
                  ▶
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============= MODAIS ============= */}
      {selectedConvId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm">Conversa Detalhada</h3>
                <p className="font-mono text-xs text-slate-300 truncate max-w-md">{selectedConvId}</p>
              </div>
              <button
                onClick={() => setSelectedConvId(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-lg leading-none ml-2 flex-shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-slate-50 min-h-[300px]">
              {loadingConv ? (
                <div className="flex justify-center items-center h-48 text-slate-500 text-sm">
                  Carregando mensagens...
                </div>
              ) : convMessages.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">Nenhuma mensagem encontrada.</div>
              ) : (
                convMessages.map((msg, idx) => {
                  const isUser = msg.role === 'user' || msg.role === 'cliente';
                  const parsedMsgDate = normalizeDate(msg.timestamp);
                  return (
                    <div key={idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                          isUser
                            ? 'bg-indigo-600 text-white rounded-br-none'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                        }`}
                      >
                        <div className="font-semibold text-[10px] mb-1 opacity-75">
                          {isUser ? '👤 Cliente' : '🤖 Assistente'}
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      </div>
                      {parsedMsgDate && (
                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                          {parsedMsgDate.toLocaleTimeString('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-3 bg-white border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedConvId(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {reservaModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className={`p-4 text-white ${reservaModal.acao === 'confirmar' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <h3 className="font-semibold text-base">
                {reservaModal.acao === 'confirmar' ? '✅ Confirmar Reserva' : '❌ Marcar como Perdida'}
              </h3>
              <p className="font-mono text-xs text-white/80 truncate mt-0.5">{reservaModal.sessionId}</p>
            </div>
            <div className="p-5 space-y-4">
              {reservaModal.acao === 'confirmar' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Valor final (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={reservaForm.valor}
                      onChange={e => setReservaForm(f => ({ ...f, valor: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Categoria</label>
                    <select
                      value={reservaForm.categoria}
                      onChange={e => setReservaForm(f => ({ ...f, categoria: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    >
                      <option value="SUP">Apartamento Superior</option>
                      <option value="SEN">Suíte Sênior</option>
                      <option value="MAS">Suíte Master (Cobertura)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Canal</label>
                    <select
                      value={reservaForm.canal}
                      onChange={e => setReservaForm(f => ({ ...f, canal: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="telefone">Telefone</option>
                      <option value="email">E-mail</option>
                    </select>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Motivo da perda</label>
                  <select
                    value={reservaForm.motivo}
                    onChange={e => setReservaForm(f => ({ ...f, motivo: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
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
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
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
                  className={`flex-1 text-white px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors ${
                    reservaModal.acao === 'confirmar'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
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

// 🔥 Revenue Alerts — Motor de flutuação de tarifa
const RevenueAlerts: React.FC<{
  alertas: AlertaFlutuacao[];
  limit: number;
  title: string;
  onVerTodas?: () => void;
}> = ({ alertas, limit, title, onVerTodas }) => {
  if (alertas.length === 0) return null;

  const visiveis = alertas.slice(0, limit);
  const restantes = alertas.length - visiveis.length;

  const config = {
    subir: {
      icon: '🔴',
      label: 'Subir tarifa',
      badge: 'bg-rose-100 text-rose-700 border-rose-200',
      accent: 'border-l-rose-500',
    },
    promover: {
      icon: '🔵',
      label: 'Promover / Flash Sale',
      badge: 'bg-blue-100 text-blue-700 border-blue-200',
      accent: 'border-l-blue-500',
    },
    manter: {
      icon: '⚪',
      label: 'Manter tarifa',
      badge: 'bg-slate-100 text-slate-600 border-slate-200',
      accent: 'border-l-slate-300',
    },
    observar: {
      icon: '·',
      label: 'Observar',
      badge: 'bg-slate-100 text-slate-500 border-slate-200',
      accent: 'border-l-slate-200',
    },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {onVerTodas && restantes > 0 && (
          <button
            onClick={onVerTodas}
            className="text-xs text-slate-500 hover:text-slate-900 font-medium underline"
          >
            Ver todas ({alertas.length})
          </button>
        )}
      </div>
      <div className="space-y-2">
        {visiveis.map((a, i) => {
          const c = config[a.tipo];
          return (
            <div
              key={i}
              className={`bg-white border border-slate-200 border-l-4 ${c.accent} rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-lg flex-shrink-0">{c.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      {a.dataBR}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.badge}`}>
                      {c.label}
                    </span>
                    {a.deltaPct !== 0 && (
                      <span
                        className={`text-xs font-bold ${
                          a.deltaPct > 0 ? 'text-rose-600' : 'text-blue-600'
                        }`}
                      >
                        {a.deltaPct > 0 ? '+' : ''}{a.deltaPct}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{a.sugestao}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                <div className="text-center">
                  <div className="font-bold text-slate-800">{a.buscas}</div>
                  <div className="text-[10px]">buscas</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-slate-800">{a.ocupacaoPct}%</div>
                  <div className="text-[10px]">ocup.</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-slate-800">{a.livres}</div>
                  <div className="text-[10px]">livres</div>
                </div>
              </div>
            </div>
          );
        })}
        {restantes > 0 && (
          <div className="text-xs text-slate-400 text-center py-2">
            + {restantes} alerta{restantes === 1 ? '' : 's'} adicional{restantes === 1 ? '' : 'is'}
          </div>
        )}
      </div>
    </div>
  );
};

// 🔥 Executive KPI card
const ExecCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  accent: 'emerald' | 'rose' | 'indigo' | 'amber';
  icon?: string;
}> = ({ label, value, sub, accent, icon }) => {
  const accents = {
    emerald: 'border-l-emerald-500 text-emerald-700',
    rose: 'border-l-rose-500 text-rose-700',
    indigo: 'border-l-indigo-500 text-indigo-700',
    amber: 'border-l-amber-500 text-amber-700',
  };
  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${accents[accent]} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500 font-medium">{label}</span>
        {icon && <span className="text-sm opacity-60">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold ${accents[accent].split(' ')[1]}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
};

// Mini stat para o heatmap header
const MiniStat: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  accent: 'indigo' | 'emerald' | 'amber' | 'rose';
}> = ({ label, value, sub, accent }) => {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <div className={`${colors[accent]} rounded-xl p-3 text-center`}>
      <div className="text-xl font-bold truncate">{value}</div>
      <div className="text-[11px] opacity-75">{label}</div>
      {sub && <div className="text-[10px] opacity-60 mt-0.5 font-mono">{sub}</div>}
    </div>
  );
};

const KanbanView: React.FC<{
  sessoes: SessaoAgrupada[];
  adr: number;
  onMarcarConfirmada: (sid: string, valor: number) => void;
  onMarcarPerdida: (sid: string, valor: number) => void;
}> = ({ sessoes, adr, onMarcarConfirmada, onMarcarPerdida }) => {
  const etapas = [
    { key: 'consulta_iniciada', label: 'Buscou', icon: '🔍' },
    { key: 'consulta_sucesso', label: 'Viu quartos', icon: '✅' },
    { key: 'carrinho_adicionado', label: 'Carrinho', icon: '🛒' },
    { key: 'orcamento_visualizado', label: 'Orçamento', icon: '📋' },
    { key: 'whatsapp_enviado', label: 'WhatsApp', icon: '💬' },
  ];

  const porEtapa = (idx: number) =>
    sessoes.filter(s => {
      if (s.statusFinal !== 'pendente') return false;
      const etapasDaSessao = s.eventos.map(e => e.event);
      const ultimaEtapa = etapas.map(e => e.key).filter(k => etapasDaSessao.includes(k)).pop();
      return ultimaEtapa === etapas[idx].key;
    });

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {etapas.map((etapa, idx) => {
        const cards = porEtapa(idx).sort(
          (a, b) => calcularLeadScore(b, adr) - calcularLeadScore(a, adr)
        );
        return (
          <div key={etapa.key} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 min-h-[200px]">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <span className="text-xs font-semibold text-slate-700">
                {etapa.icon} {etapa.label}
              </span>
              <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                {cards.length}
              </span>
            </div>
            <div className="space-y-2">
              {cards.slice(0, 8).map(s => {
                const score = calcularLeadScore(s, adr);
                const consulta = s.eventos.find(e => e.event === 'consulta_iniciada');
                return (
                  <div key={s.sessionId} className="bg-white rounded-lg p-2.5 border border-slate-200 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[10px] text-slate-500">
                        {s.sessionId.substring(0, 10)}...
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          score >= 70
                            ? 'bg-rose-100 text-rose-700'
                            : score >= 50
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {score}
                      </span>
                    </div>
                    {consulta?.data?.checkin && (
                      <div className="text-[10px] text-slate-500 mb-1">
                        {consulta.data.checkin} · {consulta.data.adultos}a
                        {consulta.data.criancas ? `+${consulta.data.criancas}c` : ''}
                      </div>
                    )}
                    {s.valorCotado > 0 && (
                      <div className="text-[11px] font-semibold text-emerald-700 mb-1">
                        {formatCurrency(s.valorCotado)}
                      </div>
                    )}
                    {etapa.key === 'whatsapp_enviado' && (
                      <div className="flex gap-1 mt-1.5">
                        <button
                          onClick={() => onMarcarConfirmada(s.sessionId, s.valorCotado)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-1 py-1 rounded-md text-[10px] font-medium transition-colors"
                          title="Confirmar reserva"
                        >
                          ✅
                        </button>
                        <button
                          onClick={() => onMarcarPerdida(s.sessionId, s.valorCotado)}
                          className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-1 py-1 rounded-md text-[10px] font-medium transition-colors"
                          title="Não fechou"
                        >
                          ❌
                        </button>
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
      <div className="overflow-x-auto max-h-[480px] rounded-lg border border-slate-200">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-100 text-slate-600 z-10">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Data</th>
              <th className="px-2 py-2 text-center font-medium">Buscas</th>
              <th className="px-2 py-2 text-center font-medium">SUP</th>
              <th className="px-2 py-2 text-center font-medium">SEN</th>
              <th className="px-2 py-2 text-center font-medium">MAS</th>
              <th className="px-2 py-2 text-center font-medium">Ocup.</th>
              <th className="px-2 py-2 text-left font-medium w-28">Barra</th>
              <th className="px-2 py-2 text-left font-medium">Sinal</th>
            </tr>
          </thead>
          <tbody>
            {ocupacao.map((d, i) => {
              const [dd, mm, yyyy] = d.data.split('/');
              const isoDate = `${yyyy}-${mm}-${dd}`;
              const buscas = buscasPorData[isoDate] || 0;
              const pct = Math.round(d.ocupacao * 100);
              const corBarra =
                pct >= 80 ? 'bg-rose-500'
                : pct >= 60 ? 'bg-orange-500'
                : pct >= 40 ? 'bg-amber-400'
                : 'bg-emerald-500';

              let sinal = '';
              let sinalCor = '';
              if (buscas >= 3 && pct < 40) { sinal = '🔴 Subir preço'; sinalCor = 'text-rose-700 font-semibold'; }
              else if (buscas >= 3 && pct >= 60) { sinal = '🟡 Já no caminho'; sinalCor = 'text-amber-700'; }
              else if (buscas <= 1 && pct < 30) { sinal = '🔵 Promover'; sinalCor = 'text-blue-700'; }
              else if (buscas <= 1 && pct >= 70) { sinal = '⚪ Manter'; sinalCor = 'text-slate-500'; }
              else { sinal = '·'; sinalCor = 'text-slate-300'; }

              const isHoje = isoDate === hojeStr;

              return (
                <tr
                  key={i}
                  className={`border-b border-slate-100 last:border-0 ${isHoje ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}
                >
                  <td className="px-2 py-1.5 font-mono text-slate-700">
                    {d.data}
                    {isHoje && <span className="ml-1.5 text-[9px] font-bold text-indigo-600">HOJE</span>}
                  </td>
                  <td className="px-2 py-1.5 text-center font-semibold text-slate-800">{buscas || '·'}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500">{d.porCategoria.SUP}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500">{d.porCategoria.SEN}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500">{d.porCategoria.MAS}</td>
                  <td className="px-2 py-1.5 text-center font-bold text-slate-800">{pct}%</td>
                  <td className="px-2 py-1.5">
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${corBarra} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td className={`px-2 py-1.5 text-xs ${sinalCor}`}>{sinal}</td>
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

const StatCard: React.FC<{ label: string; value: number | string; suffix?: string }> = ({
  label, value, suffix = '',
}) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4">
    <div className="text-2xl font-bold text-slate-900">
      {value}
      {suffix && <span className="text-sm font-normal text-slate-500 ml-1">{suffix}</span>}
    </div>
    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
  </div>
);

const TrackingCard: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => {
  const borderColor =
    color === 'gold' ? 'border-t-amber-400'
    : color === 'red' ? 'border-t-rose-400'
    : color === 'green' ? 'border-t-emerald-500'
    : 'border-t-slate-300';
  return (
    <div className={`bg-white p-2.5 rounded-lg border border-slate-200 border-t-4 ${borderColor} text-center`}>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
    </div>
  );
};