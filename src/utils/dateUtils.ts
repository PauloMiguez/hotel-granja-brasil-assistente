import { format, addDays, differenceInDays, isValid } from 'date-fns';

export function formatDateToDDMMAAAA(dateStr: string): string {
  const date = new Date(dateStr);
  if (!isValid(date)) return '';
  return format(date, 'dd/MM/yyyy');
}

export function getDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = new Date(startDate);
  const end = new Date(endDate);
  while (current < end) {
    dates.push(formatDateToDDMMAAAA(current.toISOString().split('T')[0]));
    current = addDays(current, 1);
  }
  return dates;
}

export function calculateNights(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(0, differenceInDays(end, start));
}

export function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (!isValid(date)) return '';
  return format(date, 'dd/MM/yyyy');
}

export function getTomorrowDate(): string {
  return format(addDays(new Date(), 1), 'yyyy-MM-dd');
}