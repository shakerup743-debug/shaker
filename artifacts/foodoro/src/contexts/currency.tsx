import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
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
  /** True once live rates from the backend have been merged in. */
  ratesLoaded: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

interface ApiCurrency { code: string; symbol: string; nameEn: string; nameAr: string }
interface ApiRateRow  { target_currency: string; rate: string }

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [allCurrencies, setAllCurrencies] = useState<Currency[]>(CURRENCIES);
  const [currency, setCurrencyState] = useState<Currency>(() =>
    getCurrencyByCode(getStoredCurrency()),
  );
  const [ratesLoaded, setRatesLoaded] = useState<boolean>(false);

  // Fetch live rates from backend (base = SAR to match tenant currency).
  useEffect(() => {
    void (async () => {
      try {
        const token = localStorage.getItem("foodoro-token");
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const [ratesRes, currRes] = await Promise.all([
          fetch("/api/exchange-rates?base=SAR", { headers }),
          fetch("/api/currencies", { headers }),
        ]);
        if (!ratesRes.ok) return;
        const ratesJson = (await ratesRes.json()) as { rates?: ApiRateRow[] };
        const currJson  = currRes.ok ? ((await currRes.json()) as { currencies?: ApiCurrency[] }) : { currencies: [] };

        const rateMap = new Map<string, number>();
        for (const r of ratesJson.rates ?? []) {
          const v = parseFloat(r.rate);
          if (isFinite(v) && v > 0) rateMap.set(r.target_currency.toUpperCase(), v);
        }

        // Merge: keep CURRENCIES base order, override rates with live values,
        // append any new currencies (e.g. TRY, JPY) returned by the backend.
        const merged: Currency[] = CURRENCIES.map((c) => ({
          ...c,
          rate: rateMap.get(c.code) ?? c.rate,
        }));
        for (const c of currJson.currencies ?? []) {
          if (merged.find((m) => m.code === c.code)) continue;
          merged.push({
            code: c.code,
            name: c.nameEn,
            nameAr: c.nameAr,
            symbol: c.symbol,
            rate: rateMap.get(c.code) ?? 1,
          });
        }
        setAllCurrencies(merged);
        // Refresh selected currency with live rate
        setCurrencyState((prev) => merged.find((m) => m.code === prev.code) ?? prev);
        setRatesLoaded(true);
      } catch {
        // ignore — keep static fallback
      }
    })();
  }, []);

  const setCurrency = useCallback((code: string) => {
    const c = allCurrencies.find((x) => x.code === code) ?? getCurrencyByCode(code);
    setCurrencyState(c);
    storeCurrency(code);
  }, [allCurrencies]);

  const convert = useCallback(
    (sarAmount: number) => convertPrice(sarAmount, currency),
    [currency],
  );

  const format = useCallback(
    (sarAmount: number) => formatPrice(sarAmount, currency, i18n.language),
    [currency, i18n.language],
  );

  return (
    <CurrencyContext.Provider value={{
      currency, currencies: allCurrencies, setCurrency, convert, format, ratesLoaded,
    }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside CurrencyProvider");
  return ctx;
}
