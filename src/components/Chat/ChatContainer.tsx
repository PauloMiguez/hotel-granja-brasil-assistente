import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import { QuickActions } from './QuickActions';
import { QuoteForm } from '../Quote/QuoteForm';

export const ChatContainer: React.FC = () => {
  const { messages, sendMessage, isSending, showQuoteForm, setShowQuoteForm } = useChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-[#e5ddd5] overflow-hidden">
      {/* Header - Fixo */}
      <div className="bg-[#075e54] text-white p-4 flex items-center gap-2 flex-shrink-0">
        <span className="text-xl">🏨</span>
        <span className="font-semibold">Hotel Granja Brasil</span>
        <span className="ml-auto text-sm flex items-center gap-1">
          <span className="w-2 h-2 bg-green-400 rounded-full inline-block"></span>
          Online
        </span>
      </div>

      {/* Área de rolagem para mensagens + formulário */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <p className="text-center text-gray-600">Nenhuma mensagem ainda.</p>
        ) : (
          <div className="flex flex-col space-y-2">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 ${msg.isUser ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 ${msg.isUser ? 'bg-[#128c7e]' : 'bg-[#075e54]'}`}>
                  {msg.isUser ? '👤' : '🤖'}
                </div>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg shadow-sm ${msg.isUser ? 'bg-[#dcf8c6] text-black' : 'bg-white'}`}>
                  {typeof msg.content === 'string' ? (
                    <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Formulário de orçamento dentro da área de rolagem */}
        {showQuoteForm && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
            <QuoteForm onClose={() => setShowQuoteForm(false)} />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions - Fixo */}
      <div className="px-4 py-2 bg-[#e5ddd5] flex-shrink-0 border-t border-gray-200">
        <QuickActions onAction={sendMessage} />
      </div>

      {/* Input - Fixo */}
      <div className="p-2 bg-gray-100 border-t flex items-center gap-2 flex-shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Digite sua mensagem..."
          disabled={isSending}
          className="flex-1 px-4 py-2 rounded-full border-0 outline-none bg-white disabled:bg-gray-200"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isSending}
          className="w-10 h-10 bg-[#075e54] text-white rounded-full flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-[#128c7e] transition-colors"
        >
          ➤
        </button>
      </div>
    </div>
  );
};
