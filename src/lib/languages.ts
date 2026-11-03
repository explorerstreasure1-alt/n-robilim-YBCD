export type LangCode = "en" | "ru" | "it" | "es" | "ja" | "zh" | "fr";

export interface LangMeta {
  code: LangCode;
  name: string;
  native: string;
  /** Taşıyıcı frekans (Hz) — binaural vuru algısının en güçlü olduğu 185–225 Hz bandı */
  carrier: number;
  /** Ritim (sn) — satır geçişi */
  cadence: number;
  note: string;
}

export const LANGUAGES: LangMeta[] = [
  { code: "en", name: "İngilizce", native: "English", carrier: 210, cadence: 7.5, note: "Stres kalıpları ve phrasal verb çekirdeği" },
  { code: "ru", name: "Rusça", native: "Русский", carrier: 200, cadence: 8.5, note: "Vurgu kaymalı sözcük gövdeleri, 7 vurgu kalıbı" },
  { code: "it", name: "İtalyanca", native: "Italiano", carrier: 220, cadence: 7.0, note: "Şarkımsı vurgu, açık ünlü uyumu" },
  { code: "es", name: "İspanyolca", native: "Español", carrier: 208, cadence: 7.0, note: "Hızlı artikülasyon, r ve rr çalışması" },
  { code: "ja", name: "Japonca", native: "日本語", carrier: 196, cadence: 9.5, note: "Mora ritmi, 7-5 hece düzeni, pitch accent" },
  { code: "zh", name: "Çince", native: "中文", carrier: 185, cadence: 9.0, note: "Ton çiftleri (1-4) ve ölçü sözcükleri" },
  { code: "fr", name: "Fransızca", native: "Français", carrier: 204, cadence: 8.0, note: "Burunlu ünlü ve sessiz harf silmesi" },
];

export const LANG_BY_CODE = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l]),
) as Record<LangCode, LangMeta>;
