export type ProcurementPriceChange = {
  direction: 'increase' | 'decrease';
  percentage: number;
};

export function getProcurementPriceChange(currentPrice: number, previousPrice: number): ProcurementPriceChange | null {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(previousPrice) || currentPrice <= 0 || previousPrice <= 0) {
    return null;
  }

  const difference = currentPrice - previousPrice;
  if (difference === 0) {
    return null;
  }

  return {
    direction: difference > 0 ? 'increase' : 'decrease',
    percentage: Math.abs(difference / previousPrice) * 100,
  };
}
