// src/hooks/useAvailability.ts
import { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { fetchAvailability } from '../services/api/availabilityApi';
import { fetchHotelRates } from '../services/api/ratesApi';
import { validateMinLOS } from '../utils/validation';
import { Room } from '../types';

export function useAvailability() {
  const { state, dispatch } = useAppContext();
  const [error, setError] = useState<string | null>(null);

  const checkAvailability = useCallback(async (startDate: string, endDate: string, adults: number, children: number, childAges: number[]) => {
    setError(null);
    dispatch({ type: 'SET_CHECKING_AVAILABILITY', payload: true });

    try {
      // Validar estadia mínima
      const minLOS = validateMinLOS(startDate, endDate);
      if (!minLOS.valid) {
        setError(minLOS.message || 'Estadia mínima não atendida.');
        dispatch({ type: 'SET_CHECKING_AVAILABILITY', payload: false });
        return null;
      }

      // Buscar disponibilidade
      const availability = await fetchAvailability(startDate, endDate);
      dispatch({ type: 'SET_AVAILABILITY', payload: availability });

      // Buscar tarifas
      const rates = await fetchHotelRates(startDate, endDate);
      const availableRooms = rates.data.dataFormatted.filter((room: Room) => {
        // Lógica de filtragem por capacidade, crianças, etc.
        // (simplificada para exemplo)
        return true;
      });

      dispatch({ type: 'SET_SELECTED_ROOMS', payload: availableRooms });
      return { availability, rates, availableRooms };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      return null;
    } finally {
      dispatch({ type: 'SET_CHECKING_AVAILABILITY', payload: false });
    }
  }, [dispatch]);

  return {
    availability: state.availability,
    selectedRooms: state.selectedRooms,
    isChecking: state.isCheckingAvailability,
    error,
    checkAvailability,
  };
}