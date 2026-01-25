export const formatCurrencyRUB = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  const hasFraction = !Number.isInteger(value);
  const useDecimals = Math.abs(value) < 1000 && hasFraction;
  const formatter = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: useDecimals ? 2 : 0,
    maximumFractionDigits: useDecimals ? 2 : 0,
  });
  return formatter.format(value);
};

export const formatPercent = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  const percentValue = value * 100;
  const absPercent = Math.abs(percentValue);
  const fractionDigits = absPercent < 1 ? 2 : absPercent < 10 ? 1 : 0;
  const formatter = new Intl.NumberFormat("ru-RU", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return formatter.format(value);
};

export const formatNumber = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  const hasFraction = !Number.isInteger(value);
  const formatter = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
  return formatter.format(value);
};
