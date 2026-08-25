import React, { useState } from 'react';
import { Room, Reservation } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
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
  onAddToCart: (reservation: Reservation) => void;
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
  onAddToCart,
}) => {
  const [selectedRooms, setSelectedRooms] = useState<Room[]>([]);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoSrc, setVideoSrc] = useState('');

  const payingChildren = (hasChildren ? (childAge1 > 6 ? 1 : 0) + (childrenCount === 2 && childAge2 > 6 ? 1 : 0) : 0);
  const totalGuests = adults + payingChildren;
  const extraGuests = Math.max(0, totalGuests - 2);

  const handleToggleRoom = (room: Room) => {
    setSelectedRooms(prev =>
      prev.some(r => r.codigo === room.codigo)
        ? prev.filter(r => r.codigo !== room.codigo)
        : [...prev, room]
    );
  };

  const handleAddToCart = () => {
    if (selectedRooms.length === 0) return;

    selectedRooms.forEach(room => {
      const totalPerNight = room.valorMedio + extraGuests * 102;
      const reservation: Reservation = {
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
      };
      onAddToCart(reservation);
    });
    setSelectedRooms([]);
  };

  const getVideoFileName = (descricao: string): string => {
    const lower = descricao.toLowerCase();
    if (lower.includes('apartamento superior')) return 'Apartamento Superior.mp4';
    if (lower.includes('suite senior') || lower.includes('suíte sênior')) return 'Suíte Sênior.mp4';
    if (lower.includes('suite master') || lower.includes('suíte master') || lower.includes('cobertura')) return 'Suíte Máster.mp4';
    return '';
  };

  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="font-semibold text-[#075e54] mb-3">Selecione as acomodações:</h4>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {rooms.map(room => {
          const videoFile = getVideoFileName(room.descricao);
          const isChecked = selectedRooms.some(r => r.codigo === room.codigo);
          const totalPerNight = room.valorMedio + extraGuests * 102;

          return (
            <div
              key={room.codigo}
              className={`flex items-start p-2 border rounded hover:bg-gray-50 transition ${isChecked ? 'border-[#075e54] bg-green-50' : 'border-gray-200'}`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => handleToggleRoom(room)}
                className="mt-1 mr-3"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{room.descricao}</span>
                  <span className="text-xs bg-[#e8f5e9] text-[#075e54] px-2 py-0.5 rounded-full">
                    {formatCurrency(totalPerNight)}/noite
                  </span>
                </div>
                {videoFile && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setVideoSrc(videoFile);
                      setVideoOpen(true);
                    }}
                    className="text-xs text-[#075e54] underline mt-1"
                  >
                    ▶ Ver vídeo
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedRooms.length > 0 && (
        <Button variant="primary" onClick={handleAddToCart} className="w-full mt-3">
          ➕ Incluir {selectedRooms.length} quarto(s) no orçamento
        </Button>
      )}

      <VideoModal isOpen={videoOpen} onClose={() => setVideoOpen(false)} videoSrc={videoSrc} />
    </div>
  );
};
