import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { fetchAvailability } from '../../services/api/availabilityApi';
import { fetchHotelRates } from '../../services/api/ratesApi';
import { validateMinLOS, validateGuests, isRoomValidForGuests } from '../../utils/validation';
import { getTomorrowDate, formatDateToDDMMAAAA, getDatesBetween } from '../../utils/dateUtils';
import { RoomSelector } from './RoomSelector';
import { CartSummary } from './CartSummary';
import { FinalQuote } from './FinalQuote';
import { Button } from '../Shared/Button';
import { AvailabilityResponse } from '../../types';

interface QuoteFormProps {
  onClose?: () => void;
}

export const QuoteForm: React.FC<QuoteFormProps> = ({ onClose }) => {
  const { state, dispatch } = useAppContext();
  const [view, setView] = useState<'form' | 'cart' | 'final'>('form');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [originalStartDate, setOriginalStartDate] = useState('');
  const [originalEndDate, setOriginalEndDate] = useState('');
  const [adults, setAdults] = useState(2);
  const [hasChildren, setHasChildren] = useState(false);
  const [childrenCount, setChildrenCount] = useState(1);
  const [childAge1, setChildAge1] = useState(6);
  const [childAge2, setChildAge2] = useState(6);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRoomSelector, setShowRoomSelector] = useState(false);

  // Datas padrão
  useEffect(() => {
    const tomorrow = getTomorrowDate();
    setStartDate(tomorrow);
    setOriginalStartDate(tomorrow);
    const end = new Date(tomorrow);
    end.setDate(end.getDate() + 2);
    const endStr = end.toISOString().split('T')[0];
    setEndDate(endStr);
    setOriginalEndDate(endStr);
  }, []);

  // Se o carrinho já tem itens, trava as datas para o período da primeira reserva
  useEffect(() => {
    if (state.cart.length > 0) {
      const first = state.cart[0];
      if (first.startDate && first.endDate) {
        if (startDate !== first.startDate || endDate !== first.endDate) {
          setStartDate(first.startDate);
          setEndDate(first.endDate);
          setOriginalStartDate(first.startDate);
          setOriginalEndDate(first.endDate);
        }
      }
    } else {
      if (!originalStartDate || !originalEndDate) {
        const tomorrow = getTomorrowDate();
        setStartDate(tomorrow);
        setOriginalStartDate(tomorrow);
        const end = new Date(tomorrow);
        end.setDate(end.getDate() + 2);
        const endStr = end.toISOString().split('T')[0];
        setEndDate(endStr);
        setOriginalEndDate(endStr);
      } else {
        setStartDate(originalStartDate);
        setEndDate(originalEndDate);
      }
    }
  }, [state.cart, startDate, endDate, originalStartDate, originalEndDate]);

  // Validação em tempo real
  useEffect(() => {
    const childAges = hasChildren
      ? (childrenCount === 1 ? [childAge1] : [childAge1, childAge2])
      : [];
    const validation = validateGuests(adults, childrenCount, childAges);
    if (!validation.valid) {
      setError(validation.message || 'Configuração de hóspedes inválida.');
    } else if (validation.message) {
      setError(validation.message);
    } else {
      setError('');
    }
  }, [adults, hasChildren, childrenCount, childAge1, childAge2]);

  // ========= APLICA RESERVAS DO CARRINHO SOBRE A DISPONIBILIDADE =========
  const applyCartReservationsToAvailability = (baseAvailability: AvailabilityResponse): AvailabilityResponse => {
    if (state.cart.length === 0 || !baseAvailability) return baseAvailability;
    const newAvailability = JSON.parse(JSON.stringify(baseAvailability));
    state.cart.forEach(res => {
      const roomCode = res.room.codigo;
      const dates = getDatesBetween(res.startDate, res.endDate);
      dates.forEach(date => {
        const roomData = newAvailability.wsrolRS.disponibilidadeRS.disponibilidade.result[roomCode];
        if (roomData && roomData.diaria[date] !== undefined && roomData.diaria[date] > 0) {
          roomData.diaria[date] -= 1;
        }
      });
    });
    return newAvailability;
  };

  const handleCheckAvailability = async () => {
    setError('');
    if (!startDate || !endDate) {
      setError('Por favor, selecione as datas de check-in e check-out.');
      return;
    }

    if (state.cart.length > 0) {
      const first = state.cart[0];
      if (first.startDate !== startDate || first.endDate !== endDate) {
        setError('Não é possível alterar o período pois já há reservas em andamento. Para mudar o período, esvazie o carrinho primeiro.');
        return;
      }
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

    const childAges = hasChildren
      ? (childrenCount === 1 ? [childAge1] : [childAge1, childAge2])
      : [];
    const guestValidation = validateGuests(adults, childrenCount, childAges);
    if (!guestValidation.valid) {
      setError(guestValidation.message || 'Configuração de hóspedes inválida.');
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
      const adjustedAvailability = applyCartReservationsToAvailability(availabilityData);
      dispatch({ type: 'SET_AVAILABILITY', payload: adjustedAvailability });

      const ratesData = await fetchHotelRates(formattedStart, formattedEnd);

      const availableRooms = ratesData.data.dataFormatted.filter(room => {
        const dates = getDatesBetween(startDate, endDate);
        const isAvailable = dates.every(date => {
          const roomData = adjustedAvailability.wsrolRS.disponibilidadeRS.disponibilidade.result[room.codigo];
          return roomData && roomData.diaria[date] > 0;
        });
        if (!isAvailable) return false;

        const roomCheck = isRoomValidForGuests(
          room.descricao,
          adults,
          childAges,
          guestValidation.totalGuests,
          guestValidation.payingGuests
        );
        if (!roomCheck.valid) return false;
        return true;
      });

      if (availableRooms.length === 0) {
        setError('Não há acomodações disponíveis para o período selecionado com a configuração de hóspedes informada.');
        setIsLoading(false);
        dispatch({ type: 'SET_LOADING', payload: false });
        setShowRoomSelector(false);
        return;
      }

      if (state.cart.length === 0) {
        setOriginalStartDate(startDate);
        setOriginalEndDate(endDate);
      }

      dispatch({ type: 'SET_SELECTED_ROOMS', payload: availableRooms });
      setShowRoomSelector(true);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar disponibilidade.');
      setShowRoomSelector(false);
    } finally {
      setIsLoading(false);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleAddToCart = (reservations: any[]) => {
    if (reservations.length === 0) return;
    reservations.forEach(res => {
      dispatch({ type: 'ADD_TO_CART', payload: res });
    });
    if (state.availability) {
      const newAvailability = JSON.parse(JSON.stringify(state.availability));
      reservations.forEach(res => {
        const roomCode = res.room.codigo;
        const dates = getDatesBetween(res.startDate, res.endDate);
        dates.forEach(date => {
          const roomData = newAvailability.wsrolRS.disponibilidadeRS.disponibilidade.result[roomCode];
          if (roomData && roomData.diaria[date] !== undefined && roomData.diaria[date] > 0) {
            roomData.diaria[date] -= 1;
          }
        });
      });
      dispatch({ type: 'SET_AVAILABILITY', payload: newAvailability });
    }
    setShowRoomSelector(false);
    setView('cart');
    setError('');
  };

  const handleAddMore = () => {
    setView('form');
    setShowRoomSelector(false);
    setError('');
  };

  // Views
  if (view === 'cart') {
    return (
      <div className="relative">
        {onClose && <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl">✕</button>}
        <CartSummary onAddMore={handleAddMore} onFinalize={() => setView('final')} />
      </div>
    );
  }

  if (view === 'final') {
    return (
      <div className="relative">
        {onClose && <button onClick={onClose} className="absolute top-2 right-2 text-white hover:text-gray-300 text-xl z-10">✕</button>}
        <FinalQuote onBack={() => setView('cart')} />
      </div>
    );
  }

  // Formulário
  const hasCartItems = state.cart.length > 0;

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
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={getTomorrowDate()}
              disabled={hasCartItems}
              className={`w-full p-2 border border-gray-300 rounded-md text-sm ${hasCartItems ? 'bg-gray-100 cursor-not-allowed' : 'focus:border-[#075e54] focus:outline-none'}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Check-out</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || getTomorrowDate()}
              disabled={hasCartItems}
              className={`w-full p-2 border border-gray-300 rounded-md text-sm ${hasCartItems ? 'bg-gray-100 cursor-not-allowed' : 'focus:border-[#075e54] focus:outline-none'}`}
            />
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

        {error && (
          <div className={`text-sm p-2 rounded ${error.includes('Atenção') ? 'text-yellow-700 bg-yellow-50' : 'text-red-600 bg-red-50'}`}>
            {error}
          </div>
        )}

        <Button
          variant="primary"
          onClick={handleCheckAvailability}
          disabled={isLoading || (!!error && !error.includes('Atenção'))}
          className="w-full"
        >
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
            availability={state.availability}
            onAddToCart={handleAddToCart}
          />
        )}

        {state.cart.length > 0 && !showRoomSelector && !error && (
          <Button variant="outline" onClick={() => setView('cart')} className="w-full mt-2">
            🛒 Ver carrinho ({state.cart.length} item{state.cart.length > 1 ? 's' : ''})
          </Button>
        )}
      </div>
    </div>
  );
};
