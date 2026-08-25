import React from 'react';

interface MessageItemProps {
  content: string | React.ReactNode;
  isUser: boolean;
  timestamp?: Date;
}

export const MessageItem: React.FC<MessageItemProps> = ({ content, isUser }) => {
  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0 ${isUser ? 'bg-[#128c7e]' : 'bg-[#075e54]'}`}>
        {isUser ? '👤' : '🤖'}
      </div>
      <div className={`max-w-[70%] px-3 py-2 rounded-lg shadow-sm ${isUser ? 'bg-[#dcf8c6] text-black' : 'bg-white'}`}>
        {typeof content === 'string' ? (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          content
        )}
      </div>
    </div>
  );
};