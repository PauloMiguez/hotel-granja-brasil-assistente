import React from 'react';
import { useAppContext } from '../../context/AppContext';
import { Reservation } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import { calculateNights, formatDisplayDate, getDatesBetween } from '../../utils/dateUtils';
import { Button } from '../Shared/Button';

interface CartSummaryProps {
  onAddMore: () => void;
  onFinalize: () => void;
}

export const CartSummary: React.FC<CartSummaryProps> = ({ onAddMore, onFinalize }) => {
  const { state, dispatch } = useAppContext();
  const { cart } = state;

  if (cart.length === 0) {
    return (
      <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
        Seu carrinho está vazio.
      </div>
    );
  }

  const firstReservation = cart[0];
  const nights = calculateNights(firstReservation.startDate, firstReservation.endDate);
  const startDate = formatDisplayDate(firstReservation.startDate);
  const endDate = formatDisplayDate(firstReservation.endDate);

  let subtotal = 0;
  let totalExtraGuests = 0;

  const handleRemove = (index: number) => {
    const removed = cart[index];
    const roomCode = removed.room.codigo;
    const dates = getDatesBetween(removed.startDate, removed.endDate);

    // Restaurar disponibilidade
    if (state.availability) {
      const newAvailability = JSON.parse(JSON.stringify(state.availability));
      dates.forEach(date => {
        const roomData = newAvailability.wsrolRS.disponibilidadeRS.disponibilidade.result[roomCode];
        if (roomData && roomData.diaria[date] !== undefined) {
          roomData.diaria[date] += 1;
        }
      });
      dispatch({ type: 'SET_AVAILABILITY', payload: newAvailability });
    }

    // Remover do carrinho
    dispatch({ type: 'REMOVE_FROM_CART', payload: index });
  };

  // Exibir disponibilidade restante
  const renderAvailability = () => {
    if (!state.availability) return null;
    const dates = getDatesBetween(firstReservation.startDate, firstReservation.endDate);
    const roomTypes = [
      { name: "Apartamento Superior", code: "SUP" },
      { name: "Suíte Sênior", code: "SEN" },
      { name: "Suíte Master (Cobertura)", code: "MAS" }
    ];

    return (
      <div className="bg-gray-50 p-3 rounded text-sm mt-3">
        <p className="font-semibold mb-1">📊 Disponibilidade restante:</p>
        {roomTypes.map(rt => {
          const minQty = Math.min(
            ...dates.map(date => {
              const roomData = state.availability?.wsrolRS.disponibilidadeRS.disponibilidade.result[rt.code];
              return roomData ? (roomData.diaria[date] || 0) : 0;
            })
          );
          return (
            <p key={rt.code} className="text-xs text-gray-600">
              {rt.name}: <strong>{minQty}</strong> unidade{minQty > 1 ? 's' : ''}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
      <h3 className="font-semibold text-[#075e54] text-lg mb-2">🛒 Seu Carrinho</h3>
      <p className="text-sm text-gray-600 mb-3">
        {startDate} a {endDate} · {nights} noite{nights > 1 ? 's' : ''}
      </p>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {cart.map((item: Reservation, index: number) => {
          const itemNights = calculateNights(item.startDate, item.endDate);
          const roomBaseTotal = item.totalPerNight * itemNights;
          const extraGuestCost = item.extraGuests * 102 * itemNights;
          const itemTotal = roomBaseTotal + extraGuestCost;

          subtotal += roomBaseTotal;
          totalExtraGuests += extraGuestCost;

          // Monta a descrição das crianças com idades
          let childrenInfo = '';
          if (item.hasChildren) {
            if (item.childrenCount === 1) {
              childrenInfo = ` + 1 criança (${item.childAge1} anos)`;
            } else if (item.childrenCount === 2) {
              childrenInfo = ` + 2 crianças (${item.childAge1} e ${item.childAge2} anos)`;
            }
          }

          return (
            <div
              key={index}
              className="flex items-start justify-between p-3 bg-gray-50 rounded border border-gray-100"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{item.room.descricao}</p>
                <p className="text-xs text-gray-500">
                  {item.adults} adulto(s){childrenInfo}
                </p>
                <p className="text-sm font-semibold text-[#075e54] mt-1">
                  {formatCurrency(roomBaseTotal)}
                </p>
                {item.extraGuests > 0 && (
                  <p className="text-xs text-gray-600">
                    Hóspede extra: {formatCurrency(extraGuestCost)} (R$ 102/dia)
                  </p>
                )}
              </div>
              <button
                onClick={() => handleRemove(index)}
                className="text-red-500 hover:text-red-700 text-xl font-bold px-2"
                aria-label="Remover"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {renderAvailability()}

      <div className="border-t mt-3 pt-3 space-y-1">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal acomodações</span>
          <span className="text-gray-800">{formatCurrency(subtotal)}</span>
        </div>
        {totalExtraGuests > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Hóspedes extras</span>
            <span className="text-gray-800">{formatCurrency(totalExtraGuests)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold pt-1 border-t">
          <span>Subtotal</span>
          <span className="text-[#075e54]">{formatCurrency(subtotal + totalExtraGuests)}</span>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <Button variant="outline" onClick={onAddMore} className="flex-1">
          ➕ Adicionar mais
        </Button>
        <Button variant="primary" onClick={onFinalize} className="flex-1">
          Finalizar orçamento →
        </Button>
      </div>
    </div>
  );
};