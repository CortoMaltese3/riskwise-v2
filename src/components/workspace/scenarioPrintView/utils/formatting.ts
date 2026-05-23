import { formatDate as formatDateI18n } from "../../../../lib/formatDate";

export const SHA_PREFIX_LEN = 8;

export const shortSha = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return value.slice(0, SHA_PREFIX_LEN);
};

export const formatDate = (iso: string | null, locale: string): string => {
  if (!iso) return "—";
  try {
    return formatDateI18n(iso, locale);
  } catch {
    return String(iso);
  }
};
