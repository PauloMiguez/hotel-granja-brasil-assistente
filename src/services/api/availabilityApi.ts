import { AvailabilityResponse } from '../../types';
import { formatDateToDDMMAAAA } from '../../utils/dateUtils';

const AI_API_URL = import.meta.env.VITE_AI_API_URL;

// Mantendo o cache local (opcional, mas recomendado)
const cache = new Map<string, AvailabilityResponse>();

export async function fetchAvailability(startDate: string, endDate: string): Promise<AvailabilityResponse> {
  const key = `${startDate}-${endDate}`;
  if (cache.has(key)) {
    return cache.get(key)!;
  }

  const start = formatDateToDDMMAAAA(startDate);
  const end = formatDateToDDMMAAAA(endDate);
  
  const url = `${AI_API_URL.replace(/\/$/, '')}/ocupacao?start=${start}&end=${end}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status}`);
    }

    const data = await response.json();
    
    // Salva no cache antes de retornar
    cache.set(key, data);
    
    return data;
  } catch (error) {
    console.error('Erro na API de disponibilidade:', error);
    throw new Error('Serviço indisponível no momento. Por favor, tente novamente mais tarde.');
  }
}