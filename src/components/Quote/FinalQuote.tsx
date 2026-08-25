import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencyUtils';
import { calculateNights, formatDisplayDate } from '../../utils/dateUtils';
import { HOTEL_CONFIG } from '../../services/hotelConfig';
import { Button } from '../Shared/Button';

interface FinalQuoteProps {
  onBack: () => void;
}

export const FinalQuote: React.FC<FinalQuoteProps> = ({ onBack }) => {
  const { state } = useAppContext();
  const { cart } = state;
  const [customerName, setCustomerName] = useState('');

  if (cart.length === 0) {
    return <div className="text-center text-gray-500">Nenhum item no carrinho.</div>;
  }

  const firstReservation = cart[0];
  const nights = calculateNights(firstReservation.startDate, firstReservation.endDate);
  const startDate = formatDisplayDate(firstReservation.startDate);
  const endDate = formatDisplayDate(firstReservation.endDate);

  let subtotal = 0;
  let totalExtraGuests = 0;

  const roomDetails = cart.map((item, idx) => {
    const itemNights = calculateNights(item.startDate, item.endDate);
    const roomTotal = item.totalPerNight * itemNights;
    subtotal += roomTotal;
    const extraGuestCost = item.extraGuests * 102 * itemNights;
    totalExtraGuests += extraGuestCost;

    return (
      <div key={idx} className="border-b border-gray-100 py-2 last:border-0">
        <p className="font-medium text-sm">{item.room.descricao}</p>
        <p className="text-xs text-gray-600">
          {item.adults} adulto(s)
          {item.hasChildren && ` + ${item.childrenCount} criança(s)`}
        </p>
        <p className="text-sm font-semibold text-[#075e54]">
          {formatCurrency(roomTotal)}
        </p>
        {item.extraGuests > 0 && (
          <p className="text-xs text-gray-500">
            Hóspede extra: {formatCurrency(extraGuestCost)} (R$ 102/dia)
          </p>
        )}
      </div>
    );
  });

  const total = subtotal + totalExtraGuests;

  const handleWhatsApp = () => {
    if (!customerName.trim()) {
      alert('Por favor, informe seu nome completo para prosseguir.');
      return;
    }

    const message = `
🏨 *SOLICITAÇÃO DE RESERVA - HOTEL GRANJA BRASIL*

👤 *Cliente:* ${customerName}
📅 *Check-in:* ${startDate}
📅 *Check-out:* ${endDate}
🌙 *Noites:* ${nights}

*Resumo das acomodações:*
${cart.map((item, i) => 
  `• ${i+1}. ${item.room.descricao} - ${item.adults} adulto(s)${item.hasChildren ? ` + ${item.childrenCount} criança(s)` : ''}`
).join('\n')}

💰 *Valores:*
• Subtotal acomodações: ${formatCurrency(subtotal)}
• Hóspedes extras: ${formatCurrency(totalExtraGuests)}
• *TOTAL: ${formatCurrency(total)}*

📝 Cliente interessado em fechar a reserva!
    `.trim();

    const encoded = encodeURIComponent(message);
    const phone = HOTEL_CONFIG.whatsappNumber.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
  };

  return (
    <div className="bg-[#075e54] text-white rounded-lg p-4 shadow-lg">
      <h3 className="text-xl font-bold mb-2">📋 Orçamento Final</h3>
      <p className="text-sm opacity-90 mb-3">
        {startDate} a {endDate} · {nights} noite{nights > 1 ? 's' : ''}
      </p>

      <div className="bg-white/10 rounded p-3 mb-3 max-h-48 overflow-y-auto">
        {roomDetails}
      </div>

      <div className="space-y-1 text-sm border-t border-white/20 pt-2">
        <div className="flex justify-between">
          <span>Subtotal acomodações</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {totalExtraGuests > 0 && (
          <div className="flex justify-between">
            <span>Hóspedes extras</span>
            <span>{formatCurrency(totalExtraGuests)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold pt-1 border-t border-white/20">
          <span>TOTAL</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="mt-3">
        <input
          type="text"
          placeholder="Seu nome completo"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="w-full p-2 rounded text-black text-sm placeholder-gray-400"
        />
      </div>

      <div className="flex gap-2 mt-3">
        <Button variant="outline" onClick={onBack} className="flex-1 bg-white/10 text-white border-white/30">
          ↩️ Voltar
        </Button>
        <Button
          variant="whatsapp"
          onClick={handleWhatsApp}
          className="flex-1"
        >
          💬 WhatsApp
        </Button>
      </div>

      <p className="text-xs opacity-75 mt-2 text-center">
        * Políticas: {HOTEL_CONFIG.politicas.cancelamento}
      </p>
    </div>
  );
};
