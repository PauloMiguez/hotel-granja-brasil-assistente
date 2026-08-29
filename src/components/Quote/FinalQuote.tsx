// Adicione a importação
import { trackEvent } from '../../services/trackingService';

// No handleWhatsApp, antes de abrir o WhatsApp:
trackEvent('whatsapp_enviado', {
  total: total,
  quartos: cart.length,
  cliente: customerName,
});

// Quando o componente montar (visualização do orçamento):
useEffect(() => {
  trackEvent('orcamento_visualizado', {
    total: total,
    quartos: cart.length,
  });
}, []);
