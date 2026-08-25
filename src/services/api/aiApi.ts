interface AIResponse {
  success: boolean;
  response: string;
  conversation_id: string;
}

const AI_API_URL = import.meta.env.VITE_AI_API_URL;

export async function callHotelAI(
  message: string,
  history: { role: 'user' | 'assistant'; content: string; timestamp: string }[],
  conversationId?: string
): Promise<{ response: string; conversation_id?: string }> {
  const payload = {
    prompt: message,
    conversation_id: conversationId || null,
    history: history.slice(-20),
  };

  try {
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data: AIResponse = await response.json();

    if (data.success) {
      return {
        response: data.response,
        conversation_id: data.conversation_id,
      };
    } else {
      throw new Error('Resposta da IA não foi bem-sucedida');
    }
  } catch (error) {
    console.error('Erro ao chamar IA:', error);
    throw error;
  }
}
