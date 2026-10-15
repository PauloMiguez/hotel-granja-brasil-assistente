import React, { useState, useRef, useEffect } from 'react';
import { Room, Reservation, AvailabilityResponse } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import { getDatesBetween } from '../../utils/dateUtils';
import { Button } from '../Shared/Button';

interface RoomSelectorProps {
  rooms: Room[];
  startDate: string;
  endDate: string;
  adults: number;
  hasChildren: boolean;
  childrenCount: number;
  childAge1: number;
  childAge2: number;
  availability: AvailabilityResponse | null;
  onAddToCart: (reservations: Reservation[]) => void;
}

export const RoomSelector: React.FC<RoomSelectorProps> = ({
  rooms,
  startDate,
  endDate,
  adults,
  hasChildren,
  childrenCount,
  childAge1,
  childAge2,
  availability,
  onAddToCart,
}) => {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const addButtonRef = useRef<HTMLDivElement>(null);

  // Conta crianças pagantes (idade > 6 anos)
  const payingChildren = (hasChildren ? (childAge1 > 6 ? 1 : 0) + (childrenCount === 2 && childAge2 > 6 ? 1 : 0) : 0);
  // Total de hóspedes pagantes (adultos + crianças > 6 anos)
  const payingGuests = adults + payingChildren;
  // Hóspedes extras = pagantes acima de 2 (base já cobre 2 hóspedes)
  const extraGuests = Math.max(0, payingGuests - 2);
  const dates = getDatesBetween(startDate, endDate);

  const totalSelected = Object.values(quantities).reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (totalSelected > 0 && addButtonRef.current) {
      setTimeout(() => {
        addButtonRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    }
  }, [quantities, totalSelected]);

  const getAvailableQuantity = (roomCode: string): number => {
    if (!availability) return 0;
    const roomData = availability.wsrolRS.disponibilidadeRS.disponibilidade.result[roomCode];
    if (!roomData) return 0;
    let minQty = Infinity;
    dates.forEach(date => {
      const qty = roomData.diaria[date] || 0;
      if (qty < minQty) minQty = qty;
    });
    return minQty === Infinity ? 0 : minQty;
  };

  const toggleSelect = (roomCode: string) => {
    setSelected(prev => ({
      ...prev,
      [roomCode]: !prev[roomCode],
    }));
    if (selected[roomCode]) {
      setQuantities(prev => ({ ...prev, [roomCode]: 0 }));
    } else {
      const maxQty = getAvailableQuantity(roomCode);
      if (maxQty > 0) {
        setQuantities(prev => ({ ...prev, [roomCode]: 1 }));
      }
    }
  };

  const increment = (roomCode: string) => {
    const maxQty = getAvailableQuantity(roomCode);
    setQuantities(prev => {
      const current = prev[roomCode] || 0;
      if (current < maxQty) {
        return { ...prev, [roomCode]: current + 1 };
      }
      return prev;
    });
  };

  const decrement = (roomCode: string) => {
    setQuantities(prev => {
      const current = prev[roomCode] || 0;
      if (current > 0) {
        return { ...prev, [roomCode]: current - 1 };
      }
      return prev;
    });
  };

  const handleAddToCart = () => {
    const reservations: Reservation[] = [];
    Object.keys(quantities).forEach(roomCode => {
      const qty = quantities[roomCode] || 0;
      if (qty > 0) {
        const room = rooms.find(r => r.codigo === roomCode);
        if (room) {
          for (let i = 0; i < qty; i++) {
            reservations.push({
              room,
              startDate,
              endDate,
              adults,
              hasChildren,
              childrenCount,
              childAge1,
              childAge2,
              extraGuests,
              totalPerNight: room.valorMedio + extraGuests * 102,
            });
          }
        }
      }
    });
    if (reservations.length > 0) {
      onAddToCart(reservations);
      setQuantities({});
      setSelected({});
    }
  };

  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="font-semibold text-[#075e54] mb-3">Selecione as acomodações:</h4>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {rooms.map(room => {
          const availableQty = getAvailableQuantity(room.codigo);
          const isDisabled = availableQty <= 0;
          const isSelected = selected[room.codigo] || false;
          const qty = quantities[room.codigo] || 0;
          const totalPerNight = room.valorMedio + extraGuests * 102;

          return (
            <div
              key={room.codigo}
              className={`flex items-center justify-between p-3 border rounded-lg transition ${isSelected ? 'border-[#075e54] bg-green-50' : 'border-gray-200 hover:bg-gray-50'
                } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              onClick={() => !isDisabled && toggleSelect(room.codigo)}
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{room.descricao}</span>
                  <span className="text-xs bg-[#e8f5e9] text-[#075e54] px-2 py-0.5 rounded-full">
                    {formatCurrency(totalPerNight)}/noite
                  </span>
                  <span className="text-xs text-gray-500">
                    {availableQty} unidade{availableQty > 1 ? 's' : ''} disponível(is)
                  </span>
                </div>
              </div>

              {isSelected && (
                <div className="flex items-center gap-3 ml-4" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => decrement(room.codigo)}
                    disabled={qty <= 0}
                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-lg font-bold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-medium text-sm">{qty}</span>
                  <button
                    onClick={() => increment(room.codigo)}
                    disabled={qty >= availableQty}
                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-lg font-bold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalSelected > 0 && (
        <div ref={addButtonRef} className="mt-4">
          <Button variant="primary" onClick={handleAddToCart} className="w-full">
            ➕ Incluir no orçamento ({totalSelected} quarto{totalSelected > 1 ? 's' : ''})
          </Button>
        </div>
      )}
    </div>
  );
};