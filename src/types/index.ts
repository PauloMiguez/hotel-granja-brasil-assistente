import React from "react";
export interface Room {
  codigo: string;
  descricao: string;
  valorMedio: number;
  total: number;
  disponivel?: boolean;
}

export interface AvailabilityResult {
  [roomCode: string]: {
    diaria: {
      [date: string]: number;
    };
  };
}

export interface AvailabilityResponse {
  wsrolRS: {
    disponibilidadeRS: {
      disponibilidade: {
        result: AvailabilityResult;
      };
    };
  };
}

export interface RateResponse {
  data: {
    dataFormatted: Room[];
  };
}

export interface HotelConfig {
  name: string;
  whatsappNumber: string;
  emailCorporativo: string;
  localizacao: string;
  politicas: {
    cancelamento: string;
    criancas: string;
    hospedeExtra: string;
    animais: string;
    fumante: string;
    atestatMedico: string;
  };
  servicos: string[];
  horarios: {
    checkin: string;
    checkout: string;
    governanca: string;
    recepcao: string;
    piscina: string;
  };
  acomodacoes: {
    nome: string;
    descricao: string;
    capacidade: number;
  }[];
}

export interface Reservation {
  room: Room;
  startDate: string;
  endDate: string;
  adults: number;
  hasChildren: boolean;
  childrenCount: number;
  childAge1: number;
  childAge2?: number;
  extraGuests: number;
  totalPerNight: number;
}

export interface QuoteData {
  rooms: Reservation[];
  startDate: string;
  endDate: string;
  nights: number;
  totalRooms: number;
  totalExtraGuests: number;
  total: number;
  customerName?: string;
}

export interface Message {
  id: string;
  content: string | React.ReactNode;
  isUser: boolean;
  timestamp: Date;
}

export interface AppState {
  messages: Message[];
  cart: Reservation[];
  availability: AvailabilityResponse | null;
  isLoading: boolean;
  isCheckingAvailability: boolean;
  quoteData: QuoteData | null;
  selectedRooms: Room[];
  conversationId: string | null;
}

export type AppAction =
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'ADD_TO_CART'; payload: Reservation }
  | { type: 'REMOVE_FROM_CART'; payload: number }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_AVAILABILITY'; payload: AvailabilityResponse | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_CHECKING_AVAILABILITY'; payload: boolean }
  | { type: 'SET_QUOTE_DATA'; payload: QuoteData | null }
  | { type: 'SET_SELECTED_ROOMS'; payload: Room[] }
  | { type: 'SET_CONVERSATION_ID'; payload: string | null };