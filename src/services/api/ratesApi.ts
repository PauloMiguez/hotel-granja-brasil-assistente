import { RateResponse, Room } from '../../types';
import { convertCurrencyToNumber } from '../../utils/currencyUtils';

const RATES_API_URL = import.meta.env.VITE_RATES_API_URL;

export async function fetchHotelRates(startDate: string, endDate: string): Promise<RateResponse> {
  const url = `${RATES_API_URL}?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic Og==',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Erro na consulta: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || !data.data.dataFormatted || !Array.isArray(data.data.dataFormatted)) {
      throw new Error('Formato de dados inválido retornado pela API');
    }

    data.data.dataFormatted = data.data.dataFormatted.map((room: Room) => ({
      ...room,
      valorMedio: convertCurrencyToNumber(room.valorMedio) * 0.95,
      total: convertCurrencyToNumber(room.total) * 0.95,
    }));

    return data;
  } catch (error) {
    console.error('Erro na API de tarifas:', error);
    throw new Error('Erro ao consultar tarifas. Por favor, tente novamente.');
  }
}