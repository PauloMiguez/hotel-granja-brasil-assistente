import React, { useState } from 'react';
import { Room, Reservation, AvailabilityResponse } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import { getDatesBetween } from '../../utils/dateUtils';
import { VideoModal } from '../VideoModal/VideoModal';
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
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoSrc, setVideoSrc] = useState('');

  const payingChildren = (hasChildren ? (childAge1 > 6 ? 1 : 0) + (childrenCount === 2 && childAge2 > 6 ? 1 : 0) : 0);
  const totalGuests = adults + payingChildren;
  const extraGuests = Math.max(0, totalGuests - 2);

  const dates = getDatesBetween(startDate, endDate);

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

  const handleToggleRoom = (roomCode: string) => {
    setSelectedQuantities(prev => {
      const current = prev[roomCode] || 0;
      const maxQty = getAvailableQuantity(roomCode);
      if (current === 0) {
        // Se não está selecionado, seleciona com 1
        return { ...prev, [roomCode]: 1 };
      } else {
        // Se já está selecionado, desmarca (remove)
        const newPrev = { ...prev };
        delete newPrev[roomCode];
        return newPrev;
      }
    });
  };

  const handleQuantityChange = (roomCode: string, delta: number) => {
    const current = selectedQuantities[roomCode] || 0;
    const maxQty = getAvailableQuantity(roomCode);
    const newQty = Math.max(0, Math.min(current + delta, maxQty));
    if (newQty === 0) {
      // Remove se for zero
      const newPrev = { ...selectedQuantities };
      delete newPrev[roomCode];
      setSelectedQuantities(newPrev);
    } else {
      setSelectedQuantities(prev => ({ ...prev, [roomCode]: newQty }));
    }
  };

  const handleAddToCart = () => {
    const reservations: Reservation[] = [];
    const entries = Object.entries(selectedQuantities);
    for (const [roomCode, qty] of entries) {
      if (qty <= 0) continue;
      const room = rooms.find(r => r.codigo === roomCode);
      if (!room) continue;
      for (let i = 0; i < qty; i++) {
        const totalPerNight = room.valorMedio + extraGuests * 102;
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
          totalPerNight,
        });
      }
    }
    if (reservations.length > 0) {
      onAddToCart(reservations);
      // Limpa seleções após adicionar
      setSelectedQuantities({});
    }
  };

  const getVideoFileName = (descricao: string): string => {
    const lower = descricao.toLowerCase();
    if (lower.includes('apartamento superior')) return 'Apartamento Superior.mp4';
    if (lower.includes('suite senior') || lower.includes('suíte sênior')) return 'Suíte Sênior.mp4';
    if (lower.includes('suite master') || lower.includes('suíte master') || lower.includes('cobertura')) return 'Suíte Máster.mp4';
    return '';
  };

  // Total de quartos selecionados para exibir no botão
  const totalSelected = Object.values(selectedQuantities).reduce((a, b) => a + b, 0);

  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="font-semibold text-[#075e54] mb-3">Selecione as acomodações:</h4>
      <div className="space-y-3 max-h-60 overflow-y-auto">
        {rooms.map(room => {
          const videoFile = getVideoFileName(room.descricao);
          const availableQty = getAvailableQuantity(room.codigo);
          const isDisabled = availableQty <= 0;
          const selectedQty = selectedQuantities[room.codigo] || 0;
          const isSelected = selectedQty > 0;
          const totalPerNight = room.valorMedio + extraGuests * 102;

          return (
            <div
              key={room.codigo}
              className={`flex items-center p-3 border rounded-lg transition cursor-pointer ${
                isSelected ? 'border-[#075e54] bg-green-50' : 'border-gray-200 hover:bg-gray-50'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !isDisabled && handleToggleRoom(room.codigo)}
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
                {videoFile && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoSrc(videoFile);
                      setVideoOpen(true);
                    }}
                    className="text-xs text-[#075e54] underline mt-1"
                  >
                    ▶ Ver vídeo
                  </button>
                )}
              </div>
              {!isDisabled && (
                <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-50"
                    onClick={() => handleQuantityChange(room.codigo, -1)}
                    disabled={selectedQty <= 0}
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-medium">{selectedQty}</span>
                  <button
                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-50"
                    onClick={() => handleQuantityChange(room.codigo, 1)}
                    disabled={selectedQty >= availableQty}
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
        <Button variant="primary" onClick={handleAddToCart} className="w-full mt-3">
          ➕ Incluir no orçamento ({totalSelected} quarto{totalSelected > 1 ? 's' : ''})
        </Button>
      )}

      <VideoModal isOpen={videoOpen} onClose={() => setVideoOpen(false)} videoSrc={videoSrc} />
    </div>
  );
};
