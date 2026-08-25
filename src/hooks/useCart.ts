// src/hooks/useCart.ts
import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { Reservation, QuoteData } from '../types';
import { calculateNights, formatCurrency } from '../utils';

export function useCart() {
  const { state, dispatch } = useAppContext();

  const addToCart = useCallback((reservation: Reservation) => {
    dispatch({ type: 'ADD_TO_CART', payload: reservation });
  }, [dispatch]);

  const removeFromCart = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_FROM_CART', payload: index });
  }, [dispatch]);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR_CART' });
  }, [dispatch]);

  const calculateQuote = useCallback((): QuoteData | null => {
    if (state.cart.length === 0) return null;

    const startDate = state.cart[0].startDate;
    const endDate = state.cart[0].endDate;
    const nights = calculateNights(startDate, endDate);

    let totalRooms = 0;
    let totalExtraGuests = 0;
    let rooms: Reservation[] = [];

    state.cart.forEach((res) => {
      const roomTotal = res.totalPerNight * nights;
      totalRooms += roomTotal;
      totalExtraGuests += res.extraGuests * 102 * nights;
      rooms.push(res);
    });

    const total = totalRooms + totalExtraGuests;

    return {
      rooms,
      startDate,
      endDate,
      nights,
      totalRooms,
      totalExtraGuests,
      total,
    };
  }, [state.cart]);

  return {
    cart: state.cart,
    quoteData: state.quoteData,
    addToCart,
    removeFromCart,
    clearCart,
    calculateQuote,
  };
}