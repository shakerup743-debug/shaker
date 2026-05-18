import React, { createContext, useContext, useState, useCallback } from "react";
import {
  type Currency,
  getCurrencyByCode,
  getStoredCurrency,
  storeCurrency,
  convertPrice,
  formatPrice,
  CURRENCIES,
} from "@/lib/currency";
import { useTranslation } from "react-i18next";

interface CurrencyContextValue {
  currency: Currency;
  currencies: Currency[];
  setCurrency: (code: string) => void;
  convert: (sarAmount: number) => number;
  format: (sarAmount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [currency, setCurrencyState] = useState<Currency>(() =>
    getCurrencyByCode(getStoredCurrency())
  );

  const setCurrency = useCallback((code: string) => {
    const c = getCurrencyByCode(code);
    setCurrencyState(c);
    storeCurrency(code);
  }, []);

  const convert = useCallback(
    (sarAmount: number) => convertPrice(sarAmount, currency),
    [currency]
  );

  const format = useCallback(
    (sarAmount: number) => formatPrice(sarAmount, currency, i18n.language),
    [currency, i18n.language]
  );

  return (
    <CurrencyContext.Provider value={{ currency, currencies: CURRENCIES, setCurrency, convert, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside CurrencyProvider");
  return ctx;
}
