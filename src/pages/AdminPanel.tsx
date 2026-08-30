import React, { useState, useEffect, useCallback } from 'react';

const WORKER_URL = 'https://intrega-ia.paulo-migueoli.workers.dev';

interface Conversation {
    id: string;
    total_messages: number;
    last_updated: string;
    source: string;
}

interface Message {
    role: string;
    content: string;
    timestamp?: string;
}

interface TrackingStats {
    consultas: number;
    sucesso: number;
    vazias: number;
    carrinho: number;
    orcamento: number;
    whatsapp: number;
    abandono: number;
}

interface TrackingEvent {
    event: string;
    timestamp: string;
    sessionId: string;
    data: any;
}

export const AdminPanel: React.FC = () => {
    const [filtered, setFiltered] = useState<Conversation[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(20);
    const [stats, setStats] = useState({ total: 0, msgs: 0, today: 0, avg: 0 });
    const [trackingStats, setTrackingStats] = useState<TrackingStats>({
        consultas: 0, sucesso: 0, vazias: 0, carrinho: 0, orcamento: 0, whatsapp: 0, abandono: 0
    });
    const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

    // 🔥 ESTADOS PARA O MODAL DE VER CONVERSA
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [convMessages, setConvMessages] = useState<Message[]>([]);
    const [loadingConv, setLoadingConv] = useState(false);

    // Filtro de data da jornada (Padrão: Hoje YYYY-MM-DD local)
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });

    // ========= BUSCAR CONVERSAS =========
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

    // ========= BUSCAR DETALHES DE UMA CONVERSA =========
    const handleViewConversation = async (convId: string) => {
        setSelectedConvId(convId);
        setLoadingConv(true);
        setConvMessages([]);
        try {
            const res = await fetch(`${WORKER_URL}/conversa/${encodeURIComponent(convId)}`);
            const data = await res.json();
            if (data.success && data.data) {
                // Tenta extrair as mensagens do formato do payload retornado
                const rawMsgs = data.data.messages || data.data.historico || [];
                const parsedMsgs: Message[] = rawMsgs.map((m: any) => ({
                    role: m.role || m.sender || 'user',
                    content: m.content || m.texto || m.message || JSON.stringify(m),
                    timestamp: m.timestamp
                }));
                setConvMessages(parsedMsgs);
            } else if (Array.isArray(data.messages)) {
                setConvMessages(data.messages);
            }
        } catch (e) {
            console.error('Erro ao buscar mensagens:', e);
        } finally {
            setLoadingConv(false);
        }
    };

    // ========= BUSCAR TRACKING =========
    const fetchTrackingStats = useCallback(async () => {
        try {
            const res = await fetch(`${WORKER_URL}/tracking-stats`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.events) {
                    const currentStr = JSON.stringify(trackingEvents);
                    const newStr = JSON.stringify(data.events);
                    if (currentStr !== newStr) {
                        setTrackingStats(data.stats);
                        setTrackingEvents(data.events);
                    }
                    return;
                }
            }
            const localData = getLocalTrackingStats();
            if (localData) {
                const currentStr = JSON.stringify(trackingEvents);
                const newStr = JSON.stringify(localData.events);
                if (currentStr !== newStr) {
                    setTrackingStats(localData.stats);
                    setTrackingEvents(localData.events);
                }
            }
        } catch (e) {
            console.warn('Erro ao buscar tracking do servidor:', e);
            const localData = getLocalTrackingStats();
            if (localData) {
                const currentStr = JSON.stringify(trackingEvents);
                const newStr = JSON.stringify(localData.events);
                if (currentStr !== newStr) {
                    setTrackingStats(localData.stats);
                    setTrackingEvents(localData.events);
                }
            }
        }
    }, [trackingEvents]);

    const parseConversations = (docs: any[]): Conversation[] => {
        return docs.map((doc: any) => {
            const f = doc.fields || {};
            const id = f.conversation_id?.stringValue || doc.name?.split('/').pop() || 'N/A';
            const msgs = Number(f.metadata?.mapValue?.fields?.total_messages?.integerValue) || 0;
            const updated = f.metadata?.mapValue?.fields?.last_updated?.timestampValue || '';
            const source = f.metadata?.mapValue?.fields?.source?.stringValue || 'chat_web';
            return { id, total_messages: msgs, last_updated: updated, source };
        }).filter(c => c.id !== 'N/A');
    };

    const updateStats = (convs: Conversation[]) => {
        const total = convs.length;
        const msgs = convs.reduce((s, c) => s + (Number(c.total_messages) || 0), 0);
        const today = new Date().toISOString().split('T')[0];
        const todayConvs = convs.filter(c => c.last_updated && c.last_updated.includes(today)).length;
        setStats({ total, msgs, today: todayConvs, avg: total > 0 ? msgs / total : 0 });
    };

    const getLocalTrackingStats = () => {
        try {
            const data = localStorage.getItem('tracking_history');
            if (!data) return null;
            const history = JSON.parse(data);
            if (!Array.isArray(history)) return null;
            const stats = {
                consultas: 0, sucesso: 0, vazias: 0, carrinho: 0, orcamento: 0, whatsapp: 0, abandono: 0
            };
            history.forEach((ev: any) => {
                switch (ev.event) {
                    case 'consulta_iniciada': stats.consultas++; break;
                    case 'consulta_sucesso': stats.sucesso++; break;
                    case 'consulta_vazia': stats.vazias++; break;
                    case 'carrinho_adicionado': stats.carrinho++; break;
                    case 'orcamento_visualizado': stats.orcamento++; break;
                    case 'whatsapp_enviado': stats.whatsapp++; break;
                    case 'abandono': stats.abandono++; break;
                }
            });
            return { stats, events: history.slice(-30).reverse() };
        } catch { return null; }
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchConversations(), fetchTrackingStats()]);
            setLoading(false);
        };
        loadData();
    }, []);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await Promise.all([fetchConversations(), fetchTrackingStats()]);
        setIsRefreshing(false);
    };

    const exportCSV = () => {
        const headers = ['Sessão', 'Evento', 'Timestamp', 'Detalhes'];
        const rows = trackingEvents
            .filter(ev => ev.event !== 'teste_final' && ev.event !== 'diagnostico' && ev.event !== 'teste')
            .map(ev => {
                let detail = '';
                if (ev.event === 'consulta_iniciada' && ev.data) {
                    detail = `Check-in: ${ev.data.checkin || '-'} | ${ev.data.checkout || '-'} | ${ev.data.adultos || 0} adulto(s)`;
                    if (ev.data.criancas) detail += ` + ${ev.data.criancas} criança(s)`;
                } else if (ev.event === 'carrinho_adicionado' && ev.data) {
                    detail = `${ev.data.quantidade || 0} quarto(s)`;
                } else if (ev.event === 'whatsapp_enviado' && ev.data) {
                    detail = `R$ ${ev.data.total || 0}`;
                } else if (ev.data?.context) {
                    detail = ev.data.context;
                }
                return [ev.sessionId, ev.event, new Date(ev.timestamp).toLocaleString('pt-BR'), detail];
            });
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `tracking_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="Conversas" value={stats.total} />
                <StatCard label="Mensagens" value={stats.msgs.toLocaleString()} />
                <StatCard label="Hoje" value={stats.today} />
                <StatCard label="Média" value={stats.avg.toFixed(1)} suffix=" msg/conv" />
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3 mt-4">
                    <TrackingCard label="Consultas" value={trackingStats.consultas} />
                    <TrackingCard label="Sucesso" value={trackingStats.sucesso} />
                    <TrackingCard label="Sem Disp." value={trackingStats.vazias} />
                    <TrackingCard label="Carrinho" value={trackingStats.carrinho} />
                    <TrackingCard label="Orçamento" value={trackingStats.orcamento} color="gold" />
                    <TrackingCard label="WhatsApp" value={trackingStats.whatsapp} color="gold" />
                    <TrackingCard label="Abandonos" value={trackingStats.abandono} color="red" />
                </div>
            </div>

            {/* ========= JORNADAS DOS CLIENTES ========= */}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-2 mb-4 gap-2">
                <h2 className="text-xl font-semibold text-[#1e293b]">🧑‍💻 Jornadas dos Clientes</h2>
                
                <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-medium">Filtrar por data:</label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700 shadow-sm"
                    />
                    {selectedDate && (
                        <button
                            onClick={() => setSelectedDate('')}
                            className="text-xs text-slate-400 hover:text-slate-600 bg-slate-100 px-2 py-1.5 rounded-md transition-colors"
                            title="Limpar filtro e ver todas as datas"
                        >
                            Ver Todas
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                {(() => {
                    const JOURNEY_STEPS = [
                        { key: 'consulta_iniciada', label: 'Consulta', icon: '🔍' },
                        { key: 'consulta_sucesso', label: 'Sucesso', icon: '✅' },
                        { key: 'carrinho_adicionado', label: 'Carrinho', icon: '🛒' },
                        { key: 'orcamento_visualizado', label: 'Orçamento', icon: '📋' },
                        { key: 'whatsapp_enviado', label: 'WhatsApp', icon: '💬' },
                    ];

                    const parseDateInfo = (rawTimestamp: any) => {
                        if (!rawTimestamp) {
                            const now = new Date();
                            return { dateStr: now.toLocaleDateString('sv-SE'), ms: now.getTime() };
                        }
                        const d = new Date(rawTimestamp);
                        if (isNaN(d.getTime())) {
                            const now = new Date();
                            return { dateStr: now.toLocaleDateString('sv-SE'), ms: now.getTime() };
                        }
                        return { dateStr: d.toLocaleDateString('sv-SE'), ms: d.getTime() };
                    };

                    const validEvents = trackingEvents.filter(
                        ev => !['teste_final', 'diagnostico', 'teste'].includes(ev.event)
                    );

                    const sessionsMap: Record<string, typeof trackingEvents> = {};
                    validEvents.forEach(ev => {
                        if (!sessionsMap[ev.sessionId]) sessionsMap[ev.sessionId] = [];
                        sessionsMap[ev.sessionId].push(ev);
                    });

                    Object.keys(sessionsMap).forEach(sId => {
                        sessionsMap[sId].sort((a, b) => parseDateInfo(a.timestamp).ms - parseDateInfo(b.timestamp).ms);
                    });

                    const allSessions = Object.entries(sessionsMap).map(([sessionId, events]) => {
                        const lastEvent = events[events.length - 1];
                        const { ms } = parseDateInfo(lastEvent?.timestamp);
                        const sessionDates = events.map(e => parseDateInfo(e.timestamp).dateStr);

                        return {
                            sessionId,
                            events,
                            lastTimestampMs: ms,
                            allDates: sessionDates
                        };
                    });

                    const filteredSessions = allSessions.filter(session => {
                        if (!selectedDate) return true;
                        return session.allDates.includes(selectedDate);
                    });

                    const sortedSessions = filteredSessions.sort((a, b) => b.lastTimestampMs - a.lastTimestampMs);

                    if (sortedSessions.length === 0) {
                        return (
                            <div className="text-gray-500 text-center py-12">
                                <div className="text-3xl mb-2">📅</div>
                                Nenhuma jornada registrada para {selectedDate ? selectedDate.split('-').reverse().join('/') : 'o período'}.
                            </div>
                        );
                    }

                    const totalSessions = sortedSessions.length;
                    const convertedSessions = sortedSessions.filter(s => s.events.some(e => e.event === 'whatsapp_enviado')).length;
                    const abandonedSessions = sortedSessions.filter(s => s.events.some(e => e.event === 'abandono' || e.event === 'consulta_vazia')).length;

                    return (
                        <>
                            <div className="bg-slate-50 px-5 py-2.5 border-b border-slate-200 text-xs text-slate-600 flex flex-wrap gap-4 items-center justify-between">
                                <div>
                                    Exibindo <strong>{totalSessions}</strong> sessão(ões) {selectedDate ? `para o dia ${selectedDate.split('-').reverse().join('/')}` : 'no total'}.
                                </div>
                                <div className="flex gap-3">
                                    <span className="text-emerald-700 font-medium">✅ {convertedSessions} Convertidas</span>
                                    <span className="text-rose-700 font-medium">🚫 {abandonedSessions} Abandonadas</span>
                                    <span className="text-blue-700 font-medium">🔄 {totalSessions - convertedSessions - abandonedSessions} Em andamento</span>
                                </div>
                            </div>

                            <div className="divide-y divide-gray-100">
                                {sortedSessions.map(({ sessionId, events }) => {
                                    const shortId = sessionId.length > 20 ? `${sessionId.substring(0, 10)}...` : sessionId;

                                    const hasWhatsApp = events.some(e => e.event === 'whatsapp_enviado');
                                    const hasAbandono = events.some(e => e.event === 'abandono' || e.event === 'consulta_vazia');
                                    const hasCarrinho = events.some(e => e.event === 'carrinho_adicionado');
                                    const hasSucesso = events.some(e => e.event === 'consulta_sucesso');

                                    let status = '🔄 Em andamento';
                                    let statusColor = 'bg-blue-50 text-blue-700 border-blue-200';

                                    if (hasWhatsApp) {
                                        status = '✅ Convertido';
                                        statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                    } else if (hasAbandono) {
                                        status = '🚫 Abandonou';
                                        statusColor = 'bg-rose-50 text-rose-700 border-rose-200';
                                    } else if (hasCarrinho) {
                                        status = '🛒 No carrinho';
                                        statusColor = 'bg-purple-50 text-purple-700 border-purple-200';
                                    } else if (hasSucesso) {
                                        status = '👀 Viu quartos';
                                        statusColor = 'bg-amber-50 text-amber-700 border-amber-200';
                                    }

                                    const lastEvent = events[events.length - 1];
                                    const lastTimeStr = lastEvent?.timestamp ? new Date(lastEvent.timestamp).toLocaleString('pt-BR') : '';

                                    const consulta = events.find(e => e.event === 'consulta_iniciada');
                                    const d = consulta?.data;

                                    return (
                                        <div key={sessionId} className="p-5 hover:bg-slate-50/50 transition-colors">
                                            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                                        {shortId}
                                                    </span>
                                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColor}`}>
                                                        {status}
                                                    </span>
                                                    {d && (
                                                        <span className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                                            📅 {d.checkin || '-'} até {d.checkout || '-'} • 👥 {d.adultos || 0}a{d.criancas ? ` + ${d.criancas}c` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs font-medium text-slate-400">{lastTimeStr}</span>
                                            </div>

                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-3">
                                                <div className="flex items-center justify-between relative">
                                                    {JOURNEY_STEPS.map((step, idx) => {
                                                        const stepEvent = events.find(e => e.event === step.key);
                                                        const isCompleted = !!stepEvent;

                                                        return (
                                                            <React.Fragment key={step.key}>
                                                                <div className="flex flex-col items-center z-10">
                                                                    <div
                                                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                                                                            isCompleted
                                                                                ? 'bg-indigo-600 text-white shadow-sm ring-4 ring-indigo-50'
                                                                                : 'bg-slate-200 text-slate-400'
                                                                        }`}
                                                                    >
                                                                        {step.icon}
                                                                    </div>
                                                                    <span className={`text-[11px] mt-1 font-medium ${isCompleted ? 'text-slate-800' : 'text-slate-400'}`}>
                                                                        {step.label}
                                                                    </span>
                                                                </div>

                                                                {idx < JOURNEY_STEPS.length - 1 && (
                                                                    <div className="flex-1 h-[2px] mx-2 -mt-4 bg-slate-200">
                                                                        <div
                                                                            className={`h-full transition-all ${
                                                                                events.some(e => e.event === JOURNEY_STEPS[idx + 1]?.key) ? 'bg-indigo-600' : 'bg-transparent'
                                                                            }`}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="pl-2 border-l-2 border-slate-100 space-y-1.5 ml-2">
                                                {events.map((ev, idx) => {
                                                    const eventTime = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

                                                    let detail = '';
                                                    switch (ev.event) {
                                                        case 'consulta_iniciada':
                                                            detail = `Busca realizada para ${ev.data?.adultos || 0} adulto(s)`;
                                                            break;
                                                        case 'consulta_sucesso':
                                                            detail = `${ev.data?.quartos || 0} quarto(s) disponível(is)`;
                                                            break;
                                                        case 'consulta_vazia':
                                                            detail = 'Nenhum quarto disponível para este período';
                                                            break;
                                                        case 'carrinho_adicionado':
                                                            detail = `${ev.data?.quantidade || 0} item(ns) adicionado(s)`;
                                                            break;
                                                        case 'orcamento_visualizado':
                                                            detail = `Valor do orçamento: R$ ${ev.data?.total || 0}`;
                                                            break;
                                                        case 'whatsapp_enviado':
                                                            detail = `Contato via WhatsApp por ${ev.data?.cliente || 'Cliente'} (R$ ${ev.data?.total || 0})`;
                                                            break;
                                                        case 'abandono':
                                                            detail = `Abandonou a página na etapa: ${ev.data?.stage || 'desconhecida'}`;
                                                            break;
                                                        default:
                                                            detail = JSON.stringify(ev.data || {});
                                                    }

                                                    return (
                                                        <div key={idx} className="flex items-center justify-between text-xs text-slate-600 hover:text-slate-900">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                                                <span className="font-semibold capitalize text-slate-700">{ev.event.replace('_', ' ')}:</span>
                                                                <span className="text-slate-500">{detail}</span>
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 font-mono">{eventTime}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    );
                })()}
            </div>

            {/* Conversas */}
            <h2 className="text-xl font-semibold text-[#1e293b] border-b pb-2 mb-4">📋 Conversas</h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="grid grid-cols-5 bg-gray-100 p-3 font-semibold text-sm">
                    <span>ID</span>
                    <span>Mensagens</span>
                    <span>Última Atualização</span>
                    <span>Origem</span>
                    <span>Ações</span>
                </div>
                {filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(conv => (
                    <div key={conv.id} className="grid grid-cols-5 p-3 border-b hover:bg-gray-50 items-center text-sm">
                        <span className="font-mono text-xs text-[#1e293b] truncate" title={conv.id}>{conv.id.substring(0, 20)}...</span>
                        <span>{conv.total_messages}</span>
                        <span className="text-gray-600 text-xs">{new Date(conv.last_updated).toLocaleString('pt-BR')}</span>
                        <span>{conv.source}</span>
                        {/* 🔥 AÇÃO CONECTADA */}
                        <button
                            onClick={() => handleViewConversation(conv.id)}
                            className="bg-[#1e293b] text-white px-3 py-1.5 rounded text-xs hover:bg-[#2d3a4f] transition-colors font-medium cursor-pointer w-fit"
                        >
                            Ver Conversa
                        </button>
                    </div>
                ))}
            </div>

            {filtered.length > pageSize && (
                <div className="flex justify-center gap-2 mt-4">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 border rounded disabled:opacity-50">◀</button>
                    <span className="px-3 py-1">{currentPage} de {Math.ceil(filtered.length / pageSize)}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(Math.ceil(filtered.length / pageSize), p + 1))} disabled={currentPage === Math.ceil(filtered.length / pageSize)} className="px-3 py-1 border rounded disabled:opacity-50">▶</button>
                </div>
            )}

            {/* 🔥 MODAL PARA VISUALIZAÇÃO DAS MENSAGENS */}
            {selectedConvId && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-100">
                        {/* Cabeçalho do Modal */}
                        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                            <div>
                                <h3 className="font-semibold text-sm">Conversa Detalhada</h3>
                                <p className="font-mono text-xs text-slate-300 truncate max-w-md">{selectedConvId}</p>
                            </div>
                            <button
                                onClick={() => setSelectedConvId(null)}
                                className="text-slate-400 hover:text-white p-1 rounded-lg text-lg leading-none"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Conteúdo das Mensagens */}
                        <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-slate-50 min-h-[300px]">
                            {loadingConv ? (
                                <div className="flex justify-center items-center h-48 text-slate-500 text-sm">
                                    Carregando mensagens...
                                </div>
                            ) : convMessages.length === 0 ? (
                                <div className="text-center py-12 text-slate-400 text-sm">
                                    Nenhuma mensagem encontrada para esta conversa.
                                </div>
                            ) : (
                                convMessages.map((msg, idx) => {
                                    const isUser = msg.role === 'user' || msg.role === 'cliente';
                                    return (
                                        <div
                                            key={idx}
                                            className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                                        >
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
                                            {msg.timestamp && (
                                                <span className="text-[10px] text-slate-400 mt-1 px-1">
                                                    {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Rodapé do Modal */}
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
        </div>
    );
};

const StatCard: React.FC<{ label: string; value: number | string; suffix?: string }> = ({ label, value, suffix = '' }) => (
    <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#1e293b]">
        <div className="text-2xl font-bold text-[#1e293b]">{value}{suffix}</div>
        <div className="text-sm text-gray-600">{label}</div>
    </div>
);

const TrackingCard: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => {
    const borderColor = color === 'gold' ? 'border-t-yellow-500' : color === 'red' ? 'border-t-red-500' : 'border-t-[#1e293b]';
    return (
        <div className={`bg-white p-3 rounded-lg shadow text-center border-t-4 ${borderColor}`}>
            <div className="text-2xl font-bold text-[#1e293b]">{value}</div>
            <div className="text-xs text-gray-600">{label}</div>
        </div>
    );
};