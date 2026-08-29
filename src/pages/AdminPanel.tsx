import React, { useState, useEffect, useCallback } from 'react';

const WORKER_URL = 'https://intrega-ia.paulo-migueoli.workers.dev';

interface Conversation {
  id: string;
  total_messages: number;
  last_updated: string;
  source: string;
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
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

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
            setLastUpdate(new Date());
          }
          return;
        }
      }
      // Fallback para localStorage
      const localData = getLocalTrackingStats();
      if (localData) {
        const currentStr = JSON.stringify(trackingEvents);
        const newStr = JSON.stringify(localData.events);
        if (currentStr !== newStr) {
          setTrackingStats(localData.stats);
          setTrackingEvents(localData.events);
          setLastUpdate(new Date());
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
          setLastUpdate(new Date());
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

  // Carrega dados apenas uma vez na montagem
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchConversations(), fetchTrackingStats()]);
      setLoading(false);
    };
    loadData();
  }, []);

  // ========= ATUALIZAÇÃO MANUAL =========
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchConversations(), fetchTrackingStats()]);
    setIsRefreshing(false);
  };

  // ========= FILTRO POR EVENTO (para uso futuro) =========
  // Mantido para compatibilidade, mas a tabela de jornadas usa todos os eventos

  // ========= EXPORTAR CSV =========
  const exportCSV = () => {
    const headers = ['Sessão', 'Evento', 'Timestamp', 'Detalhes'];
    const rows = trackingEvents
      .filter(ev => ev.event !== 'teste_final' && ev.event !== 'diagnostico' && ev.event !== 'teste')
      .map(ev => {
        let detail = '';
        if (ev.event === 'consulta_iniciada' && ev.data) {
          detail = `Check-in: ${ev.data.checkin || '-'} | ${ev.data.adultos || 0} adulto(s)`;
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

      {/* Estatísticas do Chat */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Conversas" value={stats.total} />
        <StatCard label="Mensagens" value={stats.msgs.toLocaleString()} />
        <StatCard label="Hoje" value={stats.today} />
        <StatCard label="Média" value={stats.avg.toFixed(1)} suffix=" msg/conv" />
      </div>

      {/* Funil de Conversão */}
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
      <h2 className="text-xl font-semibold text-[#1e293b] border-b pb-2 mb-4">🧑‍💻 Jornadas dos Clientes</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        {(() => {
          // Agrupa eventos por sessionId
          const sessions: Record<string, TrackingEvent[]> = {};
          trackingEvents.forEach(ev => {
            if (ev.event === 'teste_final' || ev.event === 'diagnostico' || ev.event === 'teste') return;
            if (!sessions[ev.sessionId]) sessions[ev.sessionId] = [];
            sessions[ev.sessionId].push(ev);
          });

          // Ordena sessões pela data do primeiro evento (mais recente primeiro)
          const sortedSessions = Object.entries(sessions)
            .map(([sessionId, events]) => {
              events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              return { sessionId, events };
            })
            .sort((a, b) => {
              const aTime = a.events[0]?.timestamp || '';
              const bTime = b.events[0]?.timestamp || '';
              return new Date(bTime).getTime() - new Date(aTime).getTime();
            });

          if (sortedSessions.length === 0) {
            return <div className="text-gray-500 text-center py-8">Nenhuma jornada registrada.</div>;
          }

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-600">Sessão</th>
                    <th className="text-left p-3 font-semibold text-gray-600">Jornada</th>
                    <th className="text-left p-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left p-3 font-semibold text-gray-600">Detalhes</th>
                    <th className="text-left p-3 font-semibold text-gray-600">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSessions.slice(0, 30).map(({ sessionId, events }) => {
                    // Determina o status da jornada
                    const hasConsulta = events.some(e => e.event === 'consulta_iniciada');
                    const hasSucesso = events.some(e => e.event === 'consulta_sucesso');
                    const hasCarrinho = events.some(e => e.event === 'carrinho_adicionado');
                    const hasOrcamento = events.some(e => e.event === 'orcamento_visualizado');
                    const hasWhatsApp = events.some(e => e.event === 'whatsapp_enviado');
                    const hasAbandono = events.some(e => e.event === 'abandono');

                    let status = '🔄 Em andamento';
                    let statusColor = 'bg-blue-100 text-blue-700';
                    
                    if (hasWhatsApp) {
                      status = '✅ Convertido';
                      statusColor = 'bg-green-100 text-green-700';
                    } else if (hasAbandono || (hasSucesso && !hasCarrinho)) {
                      status = '🚫 Abandonou';
                      statusColor = 'bg-red-100 text-red-700';
                    } else if (hasCarrinho && !hasOrcamento) {
                      status = '🛒 No carrinho';
                      statusColor = 'bg-purple-100 text-purple-700';
                    } else if (hasSucesso && !hasCarrinho) {
                      status = '👀 Viu quartos';
                      statusColor = 'bg-amber-100 text-amber-700';
                    } else if (hasConsulta && !hasSucesso) {
                      status = '❌ Sem disponibilidade';
                      statusColor = 'bg-red-100 text-red-700';
                    }

                    // Resumo da jornada (ícones)
                    const steps = [
                      hasConsulta ? '🔍' : '',
                      hasSucesso ? '✅' : '',
                      hasCarrinho ? '🛒' : '',
                      hasOrcamento ? '📋' : '',
                      hasWhatsApp ? '💬' : '',
                      hasAbandono ? '🚫' : '',
                    ].filter(Boolean).join(' → ');

                    // Detalhes (check-in, adultos, etc)
                    const firstEvent = events.find(e => e.event === 'consulta_iniciada');
                    let details = '';
                    if (firstEvent?.data) {
                      const d = firstEvent.data;
                      details = `Check-in: ${d.checkin || '-'} | ${d.adultos || 0} adulto(s)`;
                      if (d.criancas) details += ` + ${d.criancas} criança(s)`;
                    }

                    const lastEvent = events[events.length - 1];
                    const time = lastEvent?.timestamp ? new Date(lastEvent.timestamp).toLocaleString('pt-BR') : '';

                    const shortId = sessionId.length > 30 
                      ? sessionId.substring(0, 15) + '...' 
                      : sessionId;

                    return (
                      <tr key={sessionId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 font-mono text-xs text-[#1e293b]">{shortId}</td>
                        <td className="p-3 text-sm">{steps}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                            {status}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600 text-xs">{details}</td>
                        <td className="p-3 text-gray-400 text-xs">{time}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sortedSessions.length > 30 && (
                <div className="text-center text-xs text-gray-400 py-2">
                  Mostrando 30 de {sortedSessions.length} sessões
                </div>
              )}
            </div>
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
            <span className="font-mono text-xs text-[#1e293b] truncate">{conv.id.substring(0, 20)}...</span>
            <span>{conv.total_messages}</span>
            <span className="text-gray-600 text-xs">{new Date(conv.last_updated).toLocaleString('pt-BR')}</span>
            <span>{conv.source}</span>
            <button className="bg-[#1e293b] text-white px-2 py-1 rounded text-xs hover:bg-[#2d3a4f]">Ver</button>
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
  const borderColor = color === 'gold' ? 'border-t-yellow-500' : color === 'red' ? 'border-t-red-500' : 'border-t-[#1e293b]';
  return (
    <div className={`bg-white p-3 rounded-lg shadow text-center border-t-4 ${borderColor}`}>
      <div className="text-2xl font-bold text-[#1e293b]">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
};