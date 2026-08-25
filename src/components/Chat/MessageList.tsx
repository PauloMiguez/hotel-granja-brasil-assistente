import React from 'react';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';

interface MessageListProps {
  messages: any[]; // ajuste o tipo depois com Message[]
  isTyping?: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isTyping = false }) => {
  return (
    <div className="flex flex-col space-y-2">
      {messages.map((msg, index) => (
        <MessageItem key={index} {...msg} />
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
};