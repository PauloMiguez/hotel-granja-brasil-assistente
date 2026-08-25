import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="flex items-start gap-2">
      <div className="w-8 h-8 rounded-full bg-[#075e54] flex items-center justify-center text-white flex-shrink-0">
        🤖
      </div>
      <div className="bg-white px-4 py-3 rounded-lg shadow-sm min-w-[60px]">
        <div className="flex gap-1 justify-center">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
        </div>
      </div>
    </div>
  );
};