// Unicode BiDi isolation characters. LRI/RLI open an isolated run with an
// explicit base direction; PDI closes it. Wrapping mixed-direction substrings
// in these prevents the surrounding paragraph's base direction from
// reordering them (e.g. Latin field codes inside an Arabic axis label).
const LRI = "⁦"; // LEFT-TO-RIGHT ISOLATE
const RLI = "⁧"; // RIGHT-TO-LEFT ISOLATE
const PDI = "⁩"; // POP DIRECTIONAL ISOLATE

const RTL_LANGS = ["ar", "he", "fa", "ur"];

const ASCII_RUN = /[\p{ASCII}]+/gu;
const RTL_RUN = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿ]+/g;

export const isRtlLocale = (locale: string | undefined | null): boolean => {
  if (!locale) return false;
  const lower = locale.toLowerCase();
  return RTL_LANGS.some((l) => lower.startsWith(l));
};

// Wrap mixed-direction substrings in BiDi isolates so Chart.js (or any
// renderer that passes the string straight through to canvas / DOM) doesn't
// reorder Latin runs inside RTL text — and vice versa. Pass-through for
// non-string inputs so callers can wrap formatter return values without
// pre-checking the type.
export const bidiIsolate = <T>(value: T, locale: string | undefined | null): T => {
  if (value == null || typeof value !== "string") return value;
  if (isRtlLocale(locale)) {
    return value.replace(ASCII_RUN, (m) => (m.trim() ? `${LRI}${m}${PDI}` : m)) as unknown as T;
  }
  return value.replace(RTL_RUN, (m) => (m.trim() ? `${RLI}${m}${PDI}` : m)) as unknown as T;
};
