import { getDatesBetween, calculateNights } from './dateUtils';
import { MINLOS_DATA } from '../services/minlosData';

export function validateGuests(adults: number, childrenCount: number, childAges: number[]): { 
  valid: boolean; 
  message?: string;
  payingChildren: number; 
  totalGuests: number;
  payingGuests: number;
} {
  const payingChildren = childAges.filter(age => age > 6).length;
  const totalChildren = childAges.length;
  const payingGuests = adults + payingChildren;
  const totalGuests = adults + totalChildren;

  // REGRA 1: HÓSPEDES PAGANTES (adultos + crianças > 6) - máximo 3
  if (payingGuests > 3) {
    return {
      valid: false,
      message: `Capacidade máxima de hóspedes pagantes: 3 (atualmente ${payingGuests}). Crianças até 6 anos são isentas.`,
      payingChildren,
      totalGuests,
      payingGuests,
    };
  }

  // REGRA 2: TOTAL DE PESSOAS NA SUÍTE - máximo 4
  if (totalGuests > 4) {
    return {
      valid: false,
      message: `Capacidade física da suíte: máximo 4 pessoas (atualmente ${totalGuests}).`,
      payingChildren,
      totalGuests,
      payingGuests,
    };
  }

  // REGRA 3: SE HOUVER CRIANÇAS, DEVE HAVER PELO MENOS 1 ADULTO
  if (totalChildren > 0 && adults === 0) {
    return {
      valid: false,
      message: 'Para reservas com crianças, é necessário pelo menos 1 adulto.',
      payingChildren,
      totalGuests,
      payingGuests,
    };
  }

  // REGRA 4: REMOVIDA - aviso sobre múltiplas crianças pequenas não é mais exibido
  // pois a configuração é válida e a criança pode dormir na cama com os pais.

  return {
    valid: true,
    message: undefined,
    payingChildren,
    totalGuests,
    payingGuests,
  };
}

export function isRoomValidForGuests(
  roomType: string,
  adults: number,
  childAges: number[],
  totalGuests: number,
  payingGuests: number
): { valid: boolean; reason?: string } {
  const isSuperior = roomType.toLowerCase().includes('apartamento superior');
  const isSuite = roomType.toLowerCase().includes('suíte') || roomType.toLowerCase().includes('suite');

  if (isSuperior) {
    if (totalGuests > 2) {
      return { valid: false, reason: 'Apartamento Superior tem capacidade máxima de 2 hóspedes.' };
    }
    if (childAges.some(age => age <= 6)) {
      return { valid: false, reason: 'Crianças até 6 anos não são permitidas no Apartamento Superior (necessita suíte com sofá-cama).' };
    }
    return { valid: true };
  }

  if (isSuite) {
    if (payingGuests > 3) {
      return { valid: false, reason: `Suíte tem capacidade máxima de 3 hóspedes pagantes (atualmente ${payingGuests}).` };
    }
    if (totalGuests > 4) {
      return { valid: false, reason: `Suíte tem capacidade máxima de 4 pessoas no total (atualmente ${totalGuests}).` };
    }
    return { valid: true };
  }

  return { valid: true };
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
