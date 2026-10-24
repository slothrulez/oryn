/** Locale configuration: Oryn ships in English only. */
export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Message entries for a single namespace (one page/module) */
export interface NamespaceMessages {
  en: Record<string, string>;
}
