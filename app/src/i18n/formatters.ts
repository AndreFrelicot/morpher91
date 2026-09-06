import { useTranslation } from "react-i18next";

const numbers = new Map<string, Intl.NumberFormat>();

/** Readouts only: input values, timecodes and serialized coordinates stay numeric/LTR. */
export function formatNumber(
  value: number,
  language: string,
  fractionDigits?: number,
): string {
  const key = `${language}/${fractionDigits ?? "auto"}`;
  let formatter = numbers.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(
      language,
      fractionDigits === undefined
        ? {}
        : {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
            useGrouping: false,
          },
    );
    numbers.set(key, formatter);
  }
  return formatter.format(value);
}

export function useNumberFormatter() {
  const { i18n } = useTranslation();
  return (value: number, fractionDigits?: number) =>
    formatNumber(value, i18n.resolvedLanguage ?? i18n.language, fractionDigits);
}
