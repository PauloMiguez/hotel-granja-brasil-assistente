interface TrackingEvent {
  event: string;
  timestamp: string;
  data: Record<string, any>;
  sessionId: string;
}

// ========= CONFIGURAÇÃO DE SESSÃO =========
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutos

function getSessionId(): string {
  try {
    const stored = localStorage.getItem('tracking_session_data');
    if (stored) {
      const { sessionId, lastEventTime } = JSON.parse(stored);
      const now = Date.now();
      // Se passou mais que SESSION_TIMEOUT desde o último evento, renova
      if (now - lastEventTime < SESSION_TIMEOUT) {
        return sessionId;
      }
    }
  } catch (e) {}
  // Gera nova sessão
  const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem('tracking_session_data', JSON.stringify({
    sessionId: newSessionId,
    lastEventTime: Date.now()
  }));
  return newSessionId;
}

function updateSessionTimestamp(): void {
  try {
    const stored = localStorage.getItem('tracking_session_data');
    if (stored) {
      const data = JSON.parse(stored);
      data.lastEventTime = Date.now();
      localStorage.setItem('tracking_session_data', JSON.stringify(data));
    }
  } catch (e) {}
}

export function trackEvent(event: string, data: Record<string, any> = {}): void {
  try {
    const sessionId = getSessionId();
    // Atualiza timestamp da sessão
    updateSessionTimestamp();

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

    // Salva localmente
    const history = getTrackingHistory();
    history.push(eventData);
    if (history.length > 500) history.splice(0, history.length - 500);
    localStorage.setItem('tracking_history', JSON.stringify(history));

    // Envia para o Worker
    sendEventToWorker(eventData).catch(() => {});
  } catch (error) {
    console.warn('Erro ao registrar evento de tracking:', error);
  }
}

async function sendEventToWorker(eventData: TrackingEvent): Promise<void> {
  try {
    const baseUrl = import.meta.env.VITE_AI_API_URL;
    if (!baseUrl) return;
    const url = baseUrl.replace(/\/$/, '') + '/track';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData),
    });
    if (!response.ok) {
      console.warn(`❌ Tracking worker respondeu com ${response.status}: ${await response.text()}`);
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
