const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("pt-BR");

/** 0,253 → "25,3%". */
export const formatPercent = (n: number): string => pct.format(Number.isFinite(n) ? n : 0);
/** 0,5 → "0,50". */
export const formatDecimal2 = (n: number): string => dec2.format(Number.isFinite(n) ? n : 0);
/** 1234 → "1.234". */
export const formatInt = (n: number): string => int.format(Number.isFinite(n) ? n : 0);
