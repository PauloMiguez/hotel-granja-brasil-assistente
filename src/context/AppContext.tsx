import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { AppState, AppAction } from '../types';
import { loadCartFromLocalStorage, saveCartToLocalStorage } from '../utils/localStorage';

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

function getInitialState(): AppState {
  const savedCart = loadCartFromLocalStorage();
  if (savedCart && savedCart.length > 0) {
    return { ...initialState, cart: savedCart };
  }
  return initialState;
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };
    case 'ADD_TO_CART':
      return { ...state, cart: [...state.cart, action.payload] };
    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter((_, i) => i !== action.payload) };
    case 'CLEAR_CART':
      return { ...state, cart: [] };
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
