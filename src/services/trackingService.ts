interface TrackingEvent {
  event: string;
  timestamp: string;
  data: Record<string, any>;
  sessionId: string;
}

// Gera um ID de sessão único (persistente no localStorage)
function getSessionId(): string {
  let sessionId = localStorage.getItem('tracking_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('tracking_session_id', sessionId);
  }
  return sessionId;
}

// Registra um evento (local + Firebase)
export function trackEvent(event: string, data: Record<string, any> = {}): void {
  try {
    const sessionId = getSessionId();
    const eventData: TrackingEvent = {
      event,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        url: window.location.href,
        userAgent: navigator.userAgent,
      },
      sessionId,
    };

    console.log(`📊 [Tracking] ${event}`, eventData);

    // Salva localmente (fallback e histórico)
    const history = getTrackingHistory();
    history.push(eventData);
    if (history.length > 500) history.splice(0, history.length - 500);
    localStorage.setItem('tracking_history', JSON.stringify(history));

    // Envia para o Worker (Firebase)
    sendEventToWorker(eventData).catch(() => {});
  } catch (error) {
    console.warn('Erro ao registrar evento de tracking:', error);
  }
}

// Envia evento para o Worker
async function sendEventToWorker(eventData: TrackingEvent): Promise<void> {
  try {
    const workerUrl = import.meta.env.VITE_AI_API_URL;
    if (!workerUrl) return;
    await fetch(`${workerUrl}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData),
    });
  } catch {
    // Silencia erro para não quebrar a experiência do usuário
  }
}

// Obtém histórico local (fallback)
export function getTrackingHistory(): TrackingEvent[] {
  try {
    const data = localStorage.getItem('tracking_history');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Busca estatísticas do servidor (Firebase via Worker)
export async function fetchTrackingStatsFromServer(): Promise<any> {
  try {
    const workerUrl = import.meta.env.VITE_AI_API_URL;
    if (!workerUrl) return null;
    const response = await fetch(`${workerUrl}/tracking-stats`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.success) return null;
    return data;
  } catch (error) {
    console.warn('Erro ao buscar tracking do servidor:', error);
    return null;
  }
}

// Detecta abandono
export function detectAbandono(context: string): void {
  const history = getTrackingHistory();
  const lastEvents = history.slice(-10);
  const lastConsulta = lastEvents.findLast((e: any) => e.event === 'consulta_sucesso');
  if (lastConsulta) {
    const hasCarrinho = lastEvents.some((e: any) => 
      e.event === 'carrinho_adicionado' && 
      new Date(e.timestamp) > new Date(lastConsulta.timestamp)
    );
    if (!hasCarrinho) {
      trackEvent('abandono', { context, stage: 'apos_consulta' });
    }
  }
}
