import en from "../data/examples/en.json";
import ru from "../data/examples/ru.json";
import it from "../data/examples/it.json";
import es from "../data/examples/es.json";
import ja from "../data/examples/ja.json";
import zh from "../data/examples/zh.json";
import fr from "../data/examples/fr.json";

/** Tatoeba örnekleri: [hedef cümle, Türkçe, kaynak atfı, Türkçe atfı]. */
type ExampleTuple = string[];
const DATA: Record<string, Record<string, ExampleTuple>> = { en, ru, it, es, ja, zh, fr };

export interface AttributedExample {
  sentence: string;
  translation: string;
  attribution: string;
  translationAttribution: string;
}

export function getExample(lang: string, word: string): AttributedExample | null {
  const entries = DATA[lang];
  const key = word.trim().toLowerCase();
  if (!entries || !Object.prototype.hasOwnProperty.call(entries, key)) return null;
  const entry = entries[key];
  if (!Array.isArray(entry) || entry.length < 3) return null;
  return { sentence: entry[0], translation: entry[1], attribution: entry[2], translationAttribution: entry[3] ?? "" };
}

export function exampleCounts() {
  return Object.fromEntries(Object.entries(DATA).map(([lang, entries]) => [lang, Object.keys(entries).length]));
}
