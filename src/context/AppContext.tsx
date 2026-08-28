import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { AppState, AppAction } from '../types';
import { loadCartFromLocalStorage, saveCartToLocalStorage, clearCartFromLocalStorage } from '../utils/localStorage';

const initialState: AppState = {
  messages: [],
  cart: [],
  availability: null,
  isLoading: false,
  isCheckingAvailability: false,
  quoteData: null,
  selectedRooms: [],
  conversationId: null,
};

// Carrega o carrinho do localStorage se disponível
function getInitialState(): AppState {
  const savedCart = loadCartFromLocalStorage();
  if (savedCart && savedCart.length > 0) {
    return {
      ...initialState,
      cart: savedCart,
    };
  }
  return initialState;
}

function appReducer(state: AppState, action: AppAction): AppState {
  let newState: AppState;
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };
    case 'ADD_TO_CART':
      newState = { ...state, cart: [...state.cart, action.payload] };
      return newState;
    case 'REMOVE_FROM_CART':
      newState = { ...state, cart: state.cart.filter((_, i) => i !== action.payload) };
      return newState;
    case 'CLEAR_CART':
      newState = { ...state, cart: [] };
      return newState;
    case 'SET_AVAILABILITY':
      return { ...state, availability: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_CHECKING_AVAILABILITY':
      return { ...state, isCheckingAvailability: action.payload };
    case 'SET_QUOTE_DATA':
      return { ...state, quoteData: action.payload };
    case 'SET_SELECTED_ROOMS':
      return { ...state, selectedRooms: action.payload };
    case 'SET_CONVERSATION_ID':
      return { ...state, conversationId: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | null>(null);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, getInitialState());

  // Salva o carrinho no localStorage sempre que ele mudar
  useEffect(() => {
    saveCartToLocalStorage(state.cart);
  }, [state.cart]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within an AppProvider');
  return ctx;
};
