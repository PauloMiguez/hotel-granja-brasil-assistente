import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { QuickActions } from './QuickActions';
import { QuoteForm } from '../Quote/QuoteForm';

export const ChatContainer: React.FC = () => {
  const { messages, sendMessage, isSending, showQuoteForm, setShowQuoteForm } = useChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  const closeModal = () => {
    setShowQuoteForm(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <>
      {/* Container principal – ocupa 100% da altura do pai */}
      <div className="flex flex-col h-full w-full bg-[#e5ddd5] overflow-hidden">
        {/* Cabeçalho – fixo no topo */}
        <div className="bg-[#075e54] text-white px-4 py-2.5 flex items-center justify-end flex-shrink-0 z-10">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="w-2 h-2 bg-green-400 rounded-full inline-block animate-pulse"></span>
            <span>Online</span>
          </div>
        </div>

        {/* Área de mensagens – única parte rolável */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          <MessageList messages={messages} isTyping={isSending} />
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions – fixo */}
        <div className="px-4 py-1.5 bg-[#e5ddd5] flex-shrink-0 border-t border-gray-200">
          <QuickActions onAction={sendMessage} />
        </div>

        {/* Input – fixo */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={isSending}
        />
      </div>

      {/* Modal do orçamento – sobreposto */}
      {showQuoteForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <QuoteForm onClose={closeModal} />
          </div>
        </div>
      )}
    </>
  );
};