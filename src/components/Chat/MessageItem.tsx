import React from 'react';

interface MessageItemProps {
  content: string | React.ReactNode;
  isUser: boolean;
  timestamp?: Date;
}

// Função de formatação manual (mais robusta)
const formatMessage = (text: string): string => {
  if (typeof text !== 'string') return text;

  let html = text;

  // 1. Negrito
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 2. Links
  html = html.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #075e54; text-decoration: underline;">$1</a>'
  );

  // 3. Telefones
  html = html.replace(
    /(\(\d{2}\)\s?\d{4,5}-\d{4})/g,
    '<a href="tel:$1" style="color: #075e54; text-decoration: none; font-weight: bold;">$1</a>'
  );

  // 4. Processar listas e parágrafos
  const lines = html.split('\n');
  let result = '';
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      if (inList) {
        result += '</ul>';
        inList = false;
      }
      result += '<br>';
      continue;
    }

    // Linha com marcador de lista
    if (/^[-•]\s/.test(trimmed)) {
      if (!inList) {
        result += '<ul style="margin: 6px 0; padding-left: 20px; list-style-type: disc;">';
        inList = true;
      }
      const content = trimmed.replace(/^[-•]\s/, '');
      // Negrito dentro do item
      const itemHtml = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      result += `<li style="margin: 4px 0;">${itemHtml}</li>`;
      continue;
    }

    // Se estava em lista e a linha não é lista, fecha a lista
    if (inList) {
      result += '</ul>';
      inList = false;
    }

    // Linha normal (título, texto corrido)
    const lineHtml = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    result += `<p style="margin: 6px 0;">${lineHtml}</p>`;
  }

  if (inList) {
    result += '</ul>';
  }

  // Se não houve formatação, envolve tudo em um parágrafo com quebras de linha
  if (!result.includes('<p>') && !result.includes('<ul>')) {
    result = `<p style="margin: 6px 0; white-space: pre-wrap;">${html.replace(/\n/g, '<br>')}</p>`;
  }

  return result;
};

export const MessageItem: React.FC<MessageItemProps> = ({ content, isUser }) => {
  // Renderização para mensagens do usuário ou conteúdo não-string
  if (typeof content !== 'string' || isUser) {
    return (
      <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 ${isUser ? 'bg-[#128c7e]' : 'bg-[#075e54]'}`}>
          {isUser ? '👤' : '🤖'}
        </div>
        <div className={`max-w-[85%] px-3 py-1.5 rounded-lg shadow-sm break-words ${isUser ? 'bg-[#dcf8c6] text-black' : 'bg-white'}`}>
          {typeof content === 'string' ? content : content}
        </div>
      </div>
    );
  }

  // Mensagens do bot com formatação manual
  return (
    <div className="flex items-start gap-2">
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 bg-[#075e54]">
        🤖
      </div>
      <div
        className="max-w-[85%] px-3 py-1.5 rounded-lg shadow-sm bg-white"
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        <div dangerouslySetInnerHTML={{ __html: formatMessage(content) }} />
      </div>
    </div>
  );
};
