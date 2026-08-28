import { Reservation } from '../types';

const CART_KEY = 'hotel_cart';
const CART_TIMESTAMP_KEY = 'hotel_cart_timestamp';
const EXPIRATION_TIME = 2 * 60 * 60 * 1000; // 2 horas em milissegundos

export function saveCartToLocalStorage(cart: Reservation[]): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    localStorage.setItem(CART_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.warn('Erro ao salvar carrinho no localStorage:', error);
  }
}

export function loadCartFromLocalStorage(): Reservation[] | null {
  try {
    const cartData = localStorage.getItem(CART_KEY);
    const timestamp = localStorage.getItem(CART_TIMESTAMP_KEY);

    if (!cartData || !timestamp) {
      return null;
    }

    const now = Date.now();
    const savedTime = parseInt(timestamp, 10);

    // Verifica se o carrinho expirou
    if (now - savedTime > EXPIRATION_TIME) {
      // Carrinho expirado, limpa o localStorage
      clearCartFromLocalStorage();
      return null;
    }

    const parsed = JSON.parse(cartData);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Erro ao carregar carrinho do localStorage:', error);
    return null;
  }
}

export function clearCartFromLocalStorage(): void {
  try {
    localStorage.removeItem(CART_KEY);
    localStorage.removeItem(CART_TIMESTAMP_KEY);
  } catch (error) {
    console.warn('Erro ao limpar carrinho do localStorage:', error);
  }
}

export function getCartExpirationTime(): string | null {
  try {
    const timestamp = localStorage.getItem(CART_TIMESTAMP_KEY);
    if (!timestamp) return null;
    const savedTime = parseInt(timestamp, 10);
    const now = Date.now();
    const remaining = EXPIRATION_TIME - (now - savedTime);
    if (remaining <= 0) return 'Expirado';
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  } catch {
    return null;
  }
}
