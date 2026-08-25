import { format, addDays, differenceInDays, isValid } from 'date-fns';

// Converte string YYYY-MM-DD para objeto Date com hora local meia-noite (sem fuso)
export function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // mês é 0-indexado
}

export function formatDateToDDMMAAAA(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = String(day).padStart(2, '0');
  const m = String(month).padStart(2, '0');
  return `${d}/${m}/${year}`;
}

export function formatDateToISO(dateStr: string): string {
  return dateStr; // já está no formato YYYY-MM-DD
}

export function getDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
  while (current < end) {
    const d = String(current.getDate()).padStart(2, '0');
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const y = current.getFullYear();
    dates.push(`${d}/${m}/${y}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function calculateNights(startDate: string, endDate: string): number {
  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
  return Math.max(0, differenceInDays(end, start));
}

export function formatDisplayDate(dateStr: string): string {
  return formatDateToDDMMAAAA(dateStr);
}

export function getTomorrowDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
