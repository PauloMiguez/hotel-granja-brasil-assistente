export function convertCurrencyToNumber(currencyString: string | number): number {
  if (typeof currencyString === 'number') return currencyString;
  if (!currencyString) return 0;
  const numeric = currencyString.toString()
    .replace(/R\$\s?/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(numeric) || 0;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}