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

  // ========= VERIFICA SE HÁ DISPONIBILIDADE PARA ALGUMA CATEGORIA =========
  const hasAvailability = (): boolean => {
    if (!state.availability) return false;
    const dates = getDatesBetween(firstReservation.startDate, firstReservation.endDate);
    const roomCodes = ['SUP', 'SEN', 'MAS'];
    
    for (const code of roomCodes) {
      let available = true;
      for (const date of dates) {
        const roomData = state.availability.wsrolRS.disponibilidadeRS.disponibilidade.result[code];
        if (!roomData || roomData.diaria[date] === undefined || roomData.diaria[date] <= 0) {
          available = false;
          break;
        }
      }
      if (available) return true;
    }
    return false;
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

  const hasAvailableRooms = hasAvailability();

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
      <h3 className="font-semibold text-[#075e54] text-lg mb-2">🛒 Seu Carrinho</h3>
      <p className="text-sm text-gray-600 mb-3">
        {startDate} a {endDate} · {nights} noite{nights > 1 ? 's' : ''}
      </p>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {cart.map((item: Reservation, index: number) => {
          const itemNights = calculateNights(item.startDate, item.endDate);
          const totalItem = item.totalPerNight * itemNights;
          subtotal += totalItem;

          return (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-100"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{item.room.descricao}</p>
                <p className="text-xs text-gray-500">
                  {item.adults} adulto(s)
                  {item.hasChildren && ` + ${item.childrenCount} criança(s)`}
                </p>
                <p className="text-sm font-semibold text-[#075e54]">
                  {formatCurrency(totalItem)}
                </p>
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

      <div className="border-t mt-3 pt-3 flex justify-between font-semibold">
        <span>Subtotal</span>
        <span className="text-[#075e54]">{formatCurrency(subtotal)}</span>
      </div>

      <div className="flex gap-2 mt-3">
        <Button 
          variant="outline" 
          onClick={onAddMore} 
          className="flex-1"
          disabled={!hasAvailableRooms}
        >
          {hasAvailableRooms ? '➕ Adicionar mais' : 'Sem disponibilidade'}
        </Button>
        <Button variant="primary" onClick={onFinalize} className="flex-1">
          Finalizar orçamento →
        </Button>
      </div>
    </div>
  );
};
