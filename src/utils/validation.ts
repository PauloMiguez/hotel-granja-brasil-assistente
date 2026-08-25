import { getDatesBetween, calculateNights } from './dateUtils';
import { MINLOS_DATA } from '../services/minlosData';

export function validateGuests(adults: number, childrenCount: number): boolean {
  const total = adults + childrenCount;
  return total >= 1 && total <= 3;
}

export function validateMinLOS(startDate: string, endDate: string): { valid: boolean; message?: string } {
  const nights = calculateNights(startDate, endDate);
  const dates = getDatesBetween(startDate, endDate);
  let maxMinLOS = 1;
  let dateWithMax = '';

  dates.forEach((date) => {
    const minLOS = MINLOS_DATA[date] || 1;
    if (minLOS > maxMinLOS) {
      maxMinLOS = minLOS;
      dateWithMax = date;
    }
  });

  if (nights < maxMinLOS) {
    return {
      valid: false,
      message: `Para o período selecionado, há restrição de estadia mínima de ${maxMinLOS} noites (a partir de ${dateWithMax}). Por favor, ajuste suas datas.`,
    };
  }

  return { valid: true };
}