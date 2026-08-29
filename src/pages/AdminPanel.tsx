import React, { useState, useEffect } from 'react';

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

  useEffect(() => {
    fetchConversations();
    fetchTrackingStats();
    const interval = setInterval(() => {
      fetchConversations();
      fetchTrackingStats();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

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
    } finally {
      setLoading(false);
    }
  };

  const fetchTrackingStats = async () => {
    try {
      const res = await fetch(`${WORKER_URL}/tracking-stats`);
      const data = await res.json();
      if (data.success) {
        setTrackingStats(data.stats);
        setTrackingEvents(data.events || []);
      } else {
        const localData = getLocalTrackingStats();
        if (localData) {
          setTrackingStats(localData.stats);
          setTrackingEvents(localData.events);
        }
      }
    } catch (e) {
      const localData = getLocalTrackingStats();
      if (localData) {
        setTrackingStats(localData.stats);
        setTrackingEvents(localData.events);
      }
    }
  };

  const parseConversations = (docs: any[]): Conversation[] => {
    return docs.map((doc: any) => {
      const f = doc.fields || {};
      const id = f.conversation_id?.stringValue || doc.name?.split('/').pop() || 'N/A';
      const msgs = f.metadata?.mapValue?.fields?.total_messages?.integerValue || 0;
      const updated = f.metadata?.mapValue?.fields?.last_updated?.timestampValue || '';
      const source = f.metadata?.mapValue?.fields?.source?.stringValue || 'chat_web';
      return { id, total_messages: msgs, last_updated: updated, source };
    }).filter(c => c.id !== 'N/A');
  };

  const updateStats = (convs: Conversation[]) => {
    const total = convs.length;
    const msgs = convs.reduce((s, c) => s + c.total_messages, 0);
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
        if (ev.event === 'consulta_iniciada') stats.consultas++;
        else if (ev.event === 'consulta_sucesso') stats.sucesso++;
        else if (ev.event === 'consulta_vazia') stats.vazias++;
        else if (ev.event === 'carrinho_adicionado') stats.carrinho++;
        else if (ev.event === 'orcamento_visualizado') stats.orcamento++;
        else if (ev.event === 'whatsapp_enviado') stats.whatsapp++;
        else if (ev.event === 'abandono') stats.abandono++;
      });
      return { stats, events: history.slice(-30).reverse() };
    } catch { return null; }
  };

  if (loading) return <div className="text-center p-8">Carregando...</div>;
  if (error) return <div className="text-red-600 p-8">{error}</div>;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <header className="bg-[#075e54] text-white p-4 rounded-lg mb-4 flex justify-between items-center flex-wrap">
        <h1 className="text-2xl font-bold">🏨 Painel Administrativo</h1>
        <div className="flex gap-2">
          <button onClick={fetchConversations} className="bg-white/20 px-4 py-2 rounded hover:bg-white/30">🔄 Atualizar</button>
          <button onClick={fetchTrackingStats} className="bg-white/20 px-4 py-2 rounded hover:bg-white/30">📊 Tracking</button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Conversas" value={stats.total} />
        <StatCard label="Mensagens" value={stats.msgs} />
        <StatCard label="Hoje" value={stats.today} />
        <StatCard label="Média" value={stats.avg.toFixed(1)} suffix=" msg/conv" />
      </div>

      <h2 className="text-xl font-semibold text-[#075e54] border-b pb-2 mb-4">📈 Funil de Conversão</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-6">
        <TrackingCard label="Consultas" value={trackingStats.consultas} />
        <TrackingCard label="Sucesso" value={trackingStats.sucesso} />
        <TrackingCard label="Sem Disp." value={trackingStats.vazias} />
        <TrackingCard label="Carrinho" value={trackingStats.carrinho} />
        <TrackingCard label="Orçamento" value={trackingStats.orcamento} color="gold" />
        <TrackingCard label="WhatsApp" value={trackingStats.whatsapp} color="gold" />
        <TrackingCard label="Abandonos" value={trackingStats.abandono} color="red" />
      </div>

      <h2 className="text-xl font-semibold text-[#075e54] border-b pb-2 mb-4">🕒 Últimos Eventos</h2>
      <div className="bg-white rounded-lg shadow p-3 max-h-64 overflow-y-auto mb-6">
        {trackingEvents.length === 0 ? (
          <div className="text-gray-500 text-center py-4">Nenhum evento recente.</div>
        ) : (
          trackingEvents.slice(0, 30).map((ev, idx) => {
            const time = ev.timestamp ? new Date(ev.timestamp).toLocaleString('pt-BR') : '';
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
            return (
              <div key={idx} className="flex justify-between border-b border-gray-100 py-2 text-sm">
                <span className="font-medium text-[#075e54]">{ev.event}</span>
                <span className="text-gray-600">{detail}</span>
                <span className="text-gray-400 text-xs">{time}</span>
              </div>
            );
          })
        )}
      </div>

      <h2 className="text-xl font-semibold text-[#075e54] border-b pb-2 mb-4">📋 Conversas</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="grid grid-cols-5 bg-gray-100 p-3 font-semibold text-sm">
          <span>ID</span>
          <span>Mensagens</span>
          <span>Última Atualização</span>
          <span>Origem</span>
          <span>Ações</span>
        </div>
        {filtered.slice((currentPage-1)*pageSize, currentPage*pageSize).map(conv => (
          <div key={conv.id} className="grid grid-cols-5 p-3 border-b hover:bg-gray-50 items-center text-sm">
            <span className="font-mono text-xs text-[#075e54] truncate">{conv.id.substring(0,20)}...</span>
            <span>{conv.total_messages}</span>
            <span className="text-gray-600 text-xs">{new Date(conv.last_updated).toLocaleString('pt-BR')}</span>
            <span>{conv.source}</span>
            <button className="bg-[#075e54] text-white px-2 py-1 rounded text-xs hover:bg-[#128c7e]">Ver</button>
          </div>
        ))}
      </div>
      {filtered.length > pageSize && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage===1} className="px-3 py-1 border rounded disabled:opacity-50">◀</button>
          <span className="px-3 py-1">{currentPage} de {Math.ceil(filtered.length/pageSize)}</span>
          <button onClick={() => setCurrentPage(p => Math.min(Math.ceil(filtered.length/pageSize), p+1))} disabled={currentPage===Math.ceil(filtered.length/pageSize)} className="px-3 py-1 border rounded disabled:opacity-50">▶</button>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number | string; suffix?: string }> = ({ label, value, suffix = '' }) => (
  <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#075e54]">
    <div className="text-2xl font-bold text-[#075e54]">{value}{suffix}</div>
    <div className="text-sm text-gray-600">{label}</div>
  </div>
);

const TrackingCard: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => {
  const borderColor = color === 'gold' ? 'border-t-yellow-500' : color === 'red' ? 'border-t-red-500' : 'border-t-[#075e54]';
  return (
    <div className={`bg-white p-3 rounded-lg shadow text-center border-t-4 ${borderColor}`}>
      <div className="text-2xl font-bold text-[#075e54]">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
};
