import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { callHotelAI } from '../services/api/aiApi';
import { HOTEL_CONFIG } from '../services/hotelConfig';
import { Message } from '../types';

export const useChat = () => {
  const { state, dispatch } = useAppContext();
  const [isSending, setIsSending] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const hasWelcomeRef = useRef(false);

  // Mensagem de boas-vindas 
  useEffect(() => {
    if (!hasWelcomeRef.current && state.messages.length === 0) {
      const welcomeMessage: Message = {
        id: 'welcome',
        content: `
Olá! Seja bem-vindo ao Hotel Granja Brasil.

Sou seu assistente virtual e estou aqui para ajudá-lo com:

- Orçamentos de reservas em tempo real
- Informações sobre acomodações
- Serviços e facilidades
- Esclarecimento de dúvidas
- Informações sobre estabelecimentos locais

Como posso ajudá-lo hoje?
        `,
        isUser: false,
        timestamp: new Date(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: welcomeMessage });
      hasWelcomeRef.current = true;
    }
  }, [state.messages.length, dispatch]);

  // Restaura conversationId
  useEffect(() => {
    const savedId = localStorage.getItem('granja_conversation_id');
    if (savedId && !state.conversationId) {
      dispatch({ type: 'SET_CONVERSATION_ID', payload: savedId });
    }
  }, [state.conversationId, dispatch]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isSending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: text,
      isUser: true,
      timestamp: new Date(),
    };
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

    const lowerText = text.toLowerCase();

    // Intercepta orçamento
    if (lowerText.includes('orçamento') || lowerText.includes('orcamento') || lowerText.includes('preço') || lowerText.includes('valor') || lowerText.includes('reserva')) {
      setShowQuoteForm(true);
      const quoteMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `<p>Preencha o formulário abaixo para solicitar seu orçamento.</p>`,
        isUser: false,
        timestamp: new Date(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: quoteMessage });
      return;
    }

    // ========= INÍCIO DO PROCESSAMENTO COM DELAY MÍNIMO =========
    const startTime = Date.now();
    setIsSending(true);

    try {
      const historyForAPI = state.messages
        .filter(msg => typeof msg.content === 'string')
        .slice(-20)
        .map(msg => ({
          role: msg.isUser ? ('user' as const) : ('assistant' as const),
          content: msg.content as string,
          timestamp: msg.timestamp.toISOString(),
        }));

      const aiResponse = await callHotelAI(
        text,
        historyForAPI,
        state.conversationId || undefined
      );

      if (aiResponse.conversation_id) {
        const newId = aiResponse.conversation_id;
        localStorage.setItem('granja_conversation_id', newId);
        dispatch({ type: 'SET_CONVERSATION_ID', payload: newId });
      }

      const botMessage: Message = {
        id: (Date.now() + 2).toString(),
        content: aiResponse.response || 'Desculpe, não entendi. Pode reformular?',
        isUser: false,
        timestamp: new Date(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: botMessage });

    } catch (error) {
      console.error('Erro no chat:', error);
      const errorMessage: Message = {
        id: (Date.now() + 3).toString(),
        content: `
          <p>Desculpe, tive um problema ao processar sua mensagem.</p>
          <p>Você pode tentar novamente ou entrar em contato diretamente pelo WhatsApp:</p>
          <a href="https://wa.me/${HOTEL_CONFIG.whatsappNumber.replace(/\D/g, '')}" 
             target="_blank" 
             class="inline-block bg-[#25d366] text-white px-4 py-2 rounded-full mt-2 hover:bg-[#20b858]">
            WhatsApp
          </a>
        `,
        isUser: false,
        timestamp: new Date(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: errorMessage });
    } finally {
      // ========= DELAY MÍNIMO DE 3 SEGUNDOS =========
      const elapsed = Date.now() - startTime;
      const minDelay = 3000; // 3 segundos
      const remaining = Math.max(0, minDelay - elapsed);
      
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining));
      }
      
      setIsSending(false);
    }
  }, [state.messages, state.conversationId, isSending, dispatch]);

  return {
    messages: state.messages,
    sendMessage,
    isSending,
    conversationId: state.conversationId,
    showQuoteForm,
    setShowQuoteForm,
  };
};