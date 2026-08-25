import React from 'react';

interface QuickActionsProps {
  onAction: (message: string) => void;
}

const ACTION_MAP: Record<string, string> = {
  'solicitar-orcamento': 'Quero solicitar um orçamento',
  'informacoes-hotel': 'Me fale sobre as acomodações',
  'servicos': 'Quais são os serviços e lazer?',
  'politicas': 'Quais são as políticas do hotel?',
  'localizacao': 'Onde fica o hotel?',
  'contato': 'Como posso entrar em contato?',
};

export const QuickActions: React.FC<QuickActionsProps> = ({ onAction }) => {
  const actions = [
    { id: 'solicitar-orcamento', label: '💰 Solicitar Orçamento' },
    { id: 'informacoes-hotel', label: '🏨 Acomodações' },
    { id: 'servicos', label: '🌟 Serviços e Lazer' },
    { id: 'politicas', label: '📋 Políticas' },
    { id: 'localizacao', label: '📍 Localização' },
    { id: 'contato', label: '📞 Contato' },
  ];

  return (
    <div className="flex flex-wrap gap-2 my-2">
      {actions.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onAction(ACTION_MAP[id] || id)}
          className="bg-white border border-gray-300 px-3 py-1.5 rounded-full text-sm hover:bg-gray-100 transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  );
};