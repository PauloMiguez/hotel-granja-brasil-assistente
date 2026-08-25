import React, { KeyboardEvent } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ value, onChange, onSend, disabled }) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="p-2 bg-gray-100 border-t flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Digite sua mensagem..."
        disabled={disabled}
        className="flex-1 px-4 py-2 rounded-full border-0 outline-none bg-white disabled:bg-gray-200 disabled:cursor-not-allowed"
      />
      <button
        onClick={onSend}
        disabled={!value.trim() || disabled}
        className="w-10 h-10 bg-[#075e54] text-white rounded-full flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-[#128c7e] transition-colors"
      >
        ➤
      </button>
    </div>
  );
};