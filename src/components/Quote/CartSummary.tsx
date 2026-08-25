import React from 'react';
import { useAppContext } from '../../context/AppContext';
import { Reservation } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import { calculateNights } from '../../utils/dateUtils';
import { Button } from '../Shared/Button';

// Função auxiliar para formatar data sem problemas de fuso
const formatDateLocal = (dateStr: string): string => {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

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
  const startDate = formatDateLocal(firstReservation.startDate);
  const endDate = formatDateLocal(firstReservation.endDate);

  let subtotal = 0;

  const handleRemove = (index: number) => {
    dispatch({ type: 'REMOVE_FROM_CART', payload: index });
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

      <div className="border-t mt-3 pt-3 flex justify-between font-semibold">
        <span>Subtotal</span>
        <span className="text-[#075e54]">{formatCurrency(subtotal)}</span>
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
