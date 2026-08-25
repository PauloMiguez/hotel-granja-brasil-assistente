import { HotelConfig } from '../types';

export const HOTEL_CONFIG: HotelConfig = {
  name: "Hotel Granja Brasil",
  whatsappNumber: "+5524998275427",
  emailCorporativo: "contato@reservasgranjabrasil.com.br",
  localizacao: "Condomínio das Residências do Pau Brasil - Estrada União e Indústria, 9153 - Itaipava - Petrópolis, RJ",
  politicas: {
    cancelamento: "Alterações ou cancelamentos sem custo até 48h antes do check-in",
    criancas: "Crianças até 6 anos não pagam, mas exigem suítes com sofás-camas",
    hospedeExtra: "Hóspedes extras: R$ 102/dia (sofás-camas)",
    animais: "Animais de estimação não são permitidos",
    fumante: "100% não fumante",
    atestatMedico: "Obrigatório para áreas externas (sauna, academia, piscinas) - válido por 6 meses",
  },
  servicos: [
    "Café da Manhã (Buffet) Incluso",
    "Internet Wifi Gratuita",
    "Piscinas",
    "Quadras Poliesportivas, Tênis e Vôlei de Areia",
    "Academia e Sauna a Vapor",
    "Trilha Ecológica",
    "Parquinho Infantil",
    "Estacionamento Gratuito (coberto/descoberto)",
  ],
  horarios: {
    checkin: "14h às 19h",
    checkout: "12h",
    governanca: "7h às 22h",
    recepcao: "7h às 19h",
    piscina: "Quinta a domingo: 10h às 19h",
  },
  acomodacoes: [
    {
      nome: "Apartamento Superior",
      descricao: "Camas separadas (padrão viúva) – ideal para solteiros - 26 m² - Ar-condicionado - Frigobar - Secador de Cabelos - Mesa de Trabalho",
      capacidade: 2,
    },
    {
      nome: "Suíte Sênior",
      descricao: "Conforto ampliado com sofá-cama na sala - Cama de Casal King Size - 41 m² - Ar-condicionado - Frigobar - Microondas - Pia - Sacada - Secador de Cabelos - Mesa de Trabalho",
      capacidade: 3,
    },
    {
      nome: "Suíte Master (Cobertura)",
      descricao: "Cama King Size, sofá-cama e vista privilegiada - 56 m² - Ar-condicionado - Frigobar - Microondas - Pia - Varanda - Acesso por escada (15 degraus) - Secador de Cabelos - Mesa de Trabalho",
      capacidade: 3,
    },
  ],
};