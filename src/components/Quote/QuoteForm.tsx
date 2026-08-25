import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { fetchAvailability } from '../../services/api/availabilityApi';
import { fetchHotelRates } from '../../services/api/ratesApi';
import { validateMinLOS, validateGuests } from '../../utils/validation';
import { getTomorrowDate, formatDateToDDMMAAAA, getDatesBetween } from '../../utils/dateUtils';
import { RoomSelector } from './RoomSelector';
import { CartSummary } from './CartSummary';
import { FinalQuote } from './FinalQuote';
import { Button } from '../Shared/Button';

interface QuoteFormProps {
  onClose?: () => void;
}

export const QuoteForm: React.FC<QuoteFormProps> = ({ onClose }) => {
  const { state, dispatch } = useAppContext();
  const [view, setView] = useState<'form' | 'cart' | 'final'>('form');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [adults, setAdults] = useState(2);
  const [hasChildren, setHasChildren] = useState(false);
  const [childrenCount, setChildrenCount] = useState(1);
  const [childAge1, setChildAge1] = useState(6);
  const [childAge2, setChildAge2] = useState(6);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRoomSelector, setShowRoomSelector] = useState(false);

  useEffect(() => {
    const tomorrow = getTomorrowDate();
    setStartDate(tomorrow);
    const end = new Date(tomorrow);
    end.setDate(end.getDate() + 2);
    setEndDate(end.toISOString().split('T')[0]);
  }, []);

  const handleCheckAvailability = async () => {
    setError('');
    if (!startDate || !endDate) {
      setError('Por favor, selecione as datas de check-in e check-out.');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(startDate) <= today) {
      setError('O check-in deve ser feito com pelo menos 1 dia de antecedência.');
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError('A data de check-out deve ser posterior à data de check-in.');
      return;
    }

    const totalGuests = adults + childrenCount;
    if (!validateGuests(adults, childrenCount)) {
      setError('Capacidade máxima excedida (máximo 3 hóspedes).');
      return;
    }

    const minLOSCheck = validateMinLOS(startDate, endDate);
    if (!minLOSCheck.valid) {
      setError(minLOSCheck.message || 'Período inválido.');
      return;
    }

    setIsLoading(true);
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const formattedStart = formatDateToDDMMAAAA(startDate);
      const formattedEnd = formatDateToDDMMAAAA(endDate);

      const availabilityData = await fetchAvailability(startDate, endDate);
      dispatch({ type: 'SET_AVAILABILITY', payload: availabilityData });

      const ratesData = await fetchHotelRates(formattedStart, formattedEnd);

      const availableRooms = ratesData.data.dataFormatted.filter(room => {
        const roomName = room.descricao.toLowerCase();
        const isSuite = roomName.includes('suíte') || roomName.includes('suite');
        const isSuperior = roomName.includes('apartamento superior');
        const totalGuests = adults + childrenCount;

        const dates = getDatesBetween(startDate, endDate);
        const isAvailable = dates.every(date => {
          const roomData = availabilityData.wsrolRS.disponibilidadeRS.disponibilidade.result[room.codigo];
          return roomData && roomData.diaria[date] > 0;
        });

        if (!isAvailable) return false;
        if (isSuperior && totalGuests > 2) return false;
        if (hasChildren && (childAge1 <= 6 || (childrenCount === 2 && childAge2 <= 6)) && !isSuite) return false;

        return true;
      });

      if (availableRooms.length === 0) {
        setError('Não há acomodações disponíveis para o período selecionado com a configuração de hóspedes informada.');
        setIsLoading(false);
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      dispatch({ type: 'SET_SELECTED_ROOMS', payload: availableRooms });
      setShowRoomSelector(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar disponibilidade.');
    } finally {
      setIsLoading(false);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Views
  if (view === 'cart') {
    return (
      <div className="relative">
        {onClose && (
          <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl">✕</button>
        )}
        <CartSummary
          onAddMore={() => { setView('form'); setShowRoomSelector(false); }}
          onFinalize={() => setView('final')}
        />
      </div>
    );
  }

  if (view === 'final') {
    return (
      <div className="relative">
        {onClose && (
          <button onClick={onClose} className="absolute top-2 right-2 text-white hover:text-gray-300 text-xl z-10">✕</button>
        )}
        <FinalQuote onBack={() => setView('cart')} />
      </div>
    );
  }

  // Formulário
  return (
    <div className="w-full">
      {onClose && (
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
        </div>
      )}
      <h3 className="text-lg font-semibold text-[#075e54] mb-3">💰 Solicitar Orçamento</h3>
      <p className="text-sm text-gray-600 mb-4">Preencha os dados abaixo para consultar disponibilidade em tempo real.</p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Check-in</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={getTomorrowDate()} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Check-out</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || getTomorrowDate()} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Adultos</label>
          <select value={adults} onChange={(e) => setAdults(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-md text-sm">
            <option value="1">1 Adulto</option>
            <option value="2">2 Adultos</option>
            <option value="3">3 Adultos</option>
          </select>
        </div>

        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">👶 Crianças (até 17 anos)</label>
          <div className="space-y-2">
            <select value={hasChildren ? childrenCount : 0} onChange={(e) => {
              const val = Number(e.target.value);
              if (val === 0) { setHasChildren(false); setChildrenCount(1); } else { setHasChildren(true); setChildrenCount(val); }
            }} className="w-full p-2 border border-gray-300 rounded-md text-sm">
              <option value="0">Sem crianças</option>
              <option value="1">1 Criança</option>
              <option value="2">2 Crianças</option>
            </select>

            {hasChildren && (
              <>
                <div>
                  <label className="text-xs text-gray-600">Idade da 1ª criança</label>
                  <select value={childAge1} onChange={(e) => setChildAge1(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                    {Array.from({ length: 18 }, (_, i) => <option key={i} value={i}>{i} ano{i > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                {childrenCount === 2 && (
                  <div>
                    <label className="text-xs text-gray-600">Idade da 2ª criança</label>
                    <select value={childAge2} onChange={(e) => setChildAge2(Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                      {Array.from({ length: 18 }, (_, i) => <option key={i} value={i}>{i} ano{i > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

        <Button variant="primary" onClick={handleCheckAvailability} disabled={isLoading} className="w-full">
          {isLoading ? 'Consultando...' : '🔍 Consultar Disponibilidade'}
        </Button>

        {showRoomSelector && (
          <RoomSelector
            rooms={state.selectedRooms}
            startDate={startDate}
            endDate={endDate}
            adults={adults}
            hasChildren={hasChildren}
            childrenCount={childrenCount}
            childAge1={childAge1}
            childAge2={childAge2}
            onAddToCart={(reservation) => {
              dispatch({ type: 'ADD_TO_CART', payload: reservation });
              setShowRoomSelector(false);
              setView('cart');
            }}
          />
        )}

        {state.cart.length > 0 && !showRoomSelector && (
          <Button variant="outline" onClick={() => setView('cart')} className="w-full mt-2">
            🛒 Ver carrinho ({state.cart.length} item{state.cart.length > 1 ? 's' : ''})
          </Button>
        )}
      </div>
    </div>
  );
};
