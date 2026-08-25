import { AvailabilityResponse } from '../../types';
import { formatDateToDDMMAAAA } from '../../utils/dateUtils';

const AVAILABILITY_API_URL = import.meta.env.VITE_AVAILABILITY_API_URL;

const cache = new Map<string, AvailabilityResponse>();

export async function fetchAvailability(startDate: string, endDate: string): Promise<AvailabilityResponse> {
  const key = `${startDate}-${endDate}`;
  if (cache.has(key)) {
    return cache.get(key)!;
  }

  const payload = {
    wsrolRQ: {
      hotelLoginRQ: {
        slug: "hotel-granja-brasil-resort",
        origem: "rolweb",
        ip: "191.31.44.244",
      },
      disponibilidadeRQ: {
        disponibilidade: {
          datainicio: formatDateToDDMMAAAA(startDate),
          datafim: formatDateToDDMMAAAA(endDate),
          detalhes: true,
          cdvoucher: 0,
        },
      },
    },
  };

  try {
    const response = await fetch(`${AVAILABILITY_API_URL}https://reservas.desbravador.com.br/reservas/modules/ws/interface.php`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic cm9sRHNsOkJyNDVpMUAyMDE4',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Erro ${response.status}`);
    }

    const data = await response.json();
    cache.set(key, data);
    return data;
  } catch (error) {
    console.error('Erro na API de disponibilidade:', error);
    throw new Error('Serviço indisponível no momento. Por favor, tente novamente mais tarde.');
  }
}