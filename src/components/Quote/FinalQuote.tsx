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

    // Monta descritivo de crianças com idades
    let childrenDesc = '';
    if (item.hasChildren && item.childrenCount > 0) {
      const ages = [];
      if (item.childAge1 !== undefined) ages.push(item.childAge1);
      if (item.childrenCount === 2 && item.childAge2 !== undefined) ages.push(item.childAge2);
      childrenDesc = ` + ${item.childrenCount} criança(s) (${ages.join(' e ')} anos)`;
    }

    return (
      <div key={idx} className="border-b border-white/20 py-3 last:border-0">
        <p className="font-medium text-white text-sm">{item.room.descricao}</p>
        <p className="text-gray-300 text-xs">
          {item.adults} adulto(s){childrenDesc}
        </p>
        <p className="text-white font-semibold text-sm">
          {formatCurrency(roomTotal)}
        </p>
        {item.extraGuests > 0 && (
          <p className="text-gray-400 text-xs">
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

    // Mensagem WhatsApp com idades das crianças
    const cartSummary = cart.map((item, i) => {
      let childrenDesc = '';
      if (item.hasChildren && item.childrenCount > 0) {
        const ages = [];
        if (item.childAge1 !== undefined) ages.push(item.childAge1);
        if (item.childrenCount === 2 && item.childAge2 !== undefined) ages.push(item.childAge2);
        childrenDesc = ` + ${item.childrenCount} criança(s) (${ages.join(' e ')} anos)`;
      }
      return `${i+1}. ${item.room.descricao} - ${item.adults} adulto(s)${childrenDesc}`;
    }).join('\n');

    const message = `
*SOLICITAÇÃO DE RESERVA - HOTEL GRANJA BRASIL*

*Cliente:* ${customerName}
*Check-in:* ${startDate}
*Check-out:* ${endDate}
*Noites:* ${nights}

*Resumo das acomodações:*
${cartSummary}

*Valores:*
- Subtotal acomodações: ${formatCurrency(subtotal)}
- Hóspedes extras: ${formatCurrency(totalExtraGuests)}
- *TOTAL: ${formatCurrency(total)}*

Cliente interessado em fechar a reserva.
Aguardamos retorno para confirmação.
    `.trim();

    const encoded = encodeURIComponent(message);
    const phone = HOTEL_CONFIG.whatsappNumber.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
  };

  return (
    <div className="bg-[#075e54] text-white rounded-lg p-4 shadow-lg">
      <h3 className="text-xl font-bold mb-2">Orçamento Final</h3>
      <p className="text-gray-300 text-sm mb-3">
        {startDate} a {endDate} · {nights} noite{nights > 1 ? 's' : ''}
      </p>

      <div className="bg-white/10 rounded p-3 mb-3 max-h-48 overflow-y-auto">
        {roomDetails}
      </div>

      <div className="space-y-1 text-sm border-t border-white/20 pt-2">
        <div className="flex justify-between text-gray-300">
          <span>Subtotal acomodações</span>
          <span className="text-white">{formatCurrency(subtotal)}</span>
        </div>
        {totalExtraGuests > 0 && (
          <div className="flex justify-between text-gray-300">
            <span>Hóspedes extras</span>
            <span className="text-white">{formatCurrency(totalExtraGuests)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold pt-1 border-t border-white/20">
          <span className="text-white">TOTAL</span>
          <span className="text-[#d4af37]">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="mt-3">
        <input
          type="text"
          placeholder="Seu nome completo"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="w-full p-2 rounded text-white bg-white/20 border border-white/30 placeholder-gray-300 text-sm focus:outline-none focus:border-white/50"
        />
      </div>

      <div className="flex gap-2 mt-3">
        <Button variant="outline" onClick={onBack} className="flex-1 bg-white/10 text-white border-white/30 hover:bg-white/20">
          ↩️ Voltar
        </Button>
        <Button
          variant="whatsapp"
          onClick={handleWhatsApp}
          className="flex-1"
        >
          WhatsApp
        </Button>
      </div>

      <p className="text-gray-400 text-xs mt-2 text-center">
        * Políticas: {HOTEL_CONFIG.politicas.cancelamento}
      </p>
    </div>
  );
};
