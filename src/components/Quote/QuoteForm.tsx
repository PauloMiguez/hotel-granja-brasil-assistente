// Adicione a importação
import { trackEvent, detectAbandono } from '../../services/trackingService';

// No handleCheckAvailability, após o início da consulta:
trackEvent('consulta_iniciada', {
  checkin: startDate,
  checkout: endDate,
  adultos: adults,
  criancas: childrenCount,
  idades: hasChildren ? (childrenCount === 1 ? [childAge1] : [childAge1, childAge2]) : [],
});

// Quando a consulta retorna quartos:
if (availableRooms.length > 0) {
  trackEvent('consulta_sucesso', {
    quartos: availableRooms.length,
    categorias: availableRooms.map(r => r.codigo),
  });
} else {
  trackEvent('consulta_vazia', {
    checkin: startDate,
    checkout: endDate,
  });
}

// No handleAddToCart:
trackEvent('carrinho_adicionado', {
  quantidade: reservations.length,
  categorias: reservations.map(r => r.room.codigo),
});

// No useEffect de desmontagem (para detectar abandono):
useEffect(() => {
  return () => {
    // Só detecta abandono se o usuário estava na etapa de seleção
    if (showRoomSelector) {
      detectAbandono('selecao_quartos');
    }
  };
}, [showRoomSelector]);
