import React from 'react';
import { MessageItem } from './MessageItem';

export const MessageList: React.FC<{ messages: any[] }> = ({ messages }) => {
  return (
    <div className="flex flex-col space-y-2">
      {messages.map((msg, index) => (
        <MessageItem key={index} {...msg} />
      ))}
    </div>
  );
};
