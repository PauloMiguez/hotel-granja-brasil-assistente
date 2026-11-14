import { AvailabilityResponse } from '../../types';
import { formatDateToDDMMAAAA } from '../../utils/dateUtils';

const AI_API_URL = import.meta.env.VITE_AI_API_URL;

export async function fetchAvailability(startDate: string, endDate: string): Promise<AvailabilityResponse> {
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

    // =========================================================
    // TRADUTOR (ADAPTER): Transforma o novo JSON no formato antigo
    // =========================================================
    // O novo Worker retorna um array "diarias". 
    // Vamos recriar a estrutura "wsrolRS" que os seus componentes esperam.

    const result: Record<string, { diaria: Record<string, number> }> = {
      SUP: { diaria: {} },
      SEN: { diaria: {} },
      MAS: { diaria: {} }
    };

    // Preenche os dias e as quantidades de quartos livres para cada categoria
    if (data.diarias && Array.isArray(data.diarias)) {
      data.diarias.forEach((dia: any) => {
        result.SUP.diaria[dia.data] = dia.porCategoria.SUP;
        result.SEN.diaria[dia.data] = dia.porCategoria.SEN;
        result.MAS.diaria[dia.data] = dia.porCategoria.MAS;
      });
    }

    // Monta o objeto final exatamente como o frontend antigo espera
    const adaptedResponse = {
      wsrolRS: {
        disponibilidadeRS: {
          disponibilidade: {
            result: result
          }
        }
      }
    };

    // Retorna o formato adaptado
    return adaptedResponse as unknown as AvailabilityResponse;

  } catch (error) {
    console.error('Erro na API de disponibilidade:', error);
    throw new Error('Serviço indisponível no momento. Por favor, tente novamente mais tarde.');
  }
}