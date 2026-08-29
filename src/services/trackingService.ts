interface TrackingEvent {
  event: string;
  timestamp: string;
  data: Record<string, any>;
  sessionId: string;
}

function getSessionId(): string {
  let sessionId = localStorage.getItem('tracking_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('tracking_session_id', sessionId);
  }
  return sessionId;
}

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

    const history = getTrackingHistory();
    history.push(eventData);
    if (history.length > 500) history.splice(0, history.length - 500);
    localStorage.setItem('tracking_history', JSON.stringify(history));

    sendEventToWorker(eventData).catch(() => {});
  } catch (error) {
    console.warn('Erro ao registrar evento de tracking:', error);
  }
}

async function sendEventToWorker(eventData: TrackingEvent): Promise<void> {
  try {
    const baseUrl = import.meta.env.VITE_AI_API_URL;
    if (!baseUrl) {
      console.warn('⚠️ VITE_AI_API_URL não definida');
      return;
    }
    // Remove barra dupla
    const url = baseUrl.replace(/\/$/, '') + '/track';
    
    // Garante sessionId
    const payload = {
      ...eventData,
      sessionId: eventData.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`❌ Tracking worker respondeu com ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.warn('❌ Erro ao enviar tracking para o worker:', error);
  }
}

export function getTrackingHistory(): TrackingEvent[] {
  try {
    const data = localStorage.getItem('tracking_history');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function fetchTrackingStatsFromServer(): Promise<any> {
  try {
    const baseUrl = import.meta.env.VITE_AI_API_URL;
    if (!baseUrl) return null;
    const url = baseUrl.replace(/\/$/, '') + '/tracking-stats';
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data.success ? data : null;
  } catch (error) {
    console.warn('Erro ao buscar tracking do servidor:', error);
    return null;
  }
}

export function detectAbandono(context: string): void {
  const history = getTrackingHistory();
  const lastEvents = history.slice(-10);
  let lastConsulta = null;
  for (let i = lastEvents.length - 1; i >= 0; i--) {
    if (lastEvents[i].event === 'consulta_sucesso') {
      lastConsulta = lastEvents[i];
      break;
    }
  }
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
