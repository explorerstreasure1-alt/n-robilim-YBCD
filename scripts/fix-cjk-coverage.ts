import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Entry = { w: string; t: string };
type Example = [string, string, string, string];
const ROOT = process.cwd(), TMP = "/tmp/nocta-corpus", TARGET = 6300;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function translate(items: string[], lang: string): Promise<string[]> {
  const locale = lang === "zh" ? "zh-CN" : lang;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${locale}&tl=tr&dt=t&q=${encodeURIComponent(items.join("\n"))}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" },
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const data = await response.json() as [Array<[string, string]>];
        const lines = (data[0] ?? []).map((part) => part?.[0] ?? "").join("").split("\n").map((line) => line.trim());
        if (lines.length === items.length && lines.every(Boolean)) return lines;
        break;
      }
    } catch { /* retry */ }
    await sleep((attempt + 1) * 500);
  }
  if (items.length <= 1) return [""];
  const mid = Math.ceil(items.length / 2);
  return [...await translate(items.slice(0, mid), lang), ...await translate(items.slice(mid), lang)];
}

async function main() {
  for (const lang of ["ja", "zh"]) {
    const lex = JSON.parse(await readFile(path.join(ROOT, `src/data/lexicon/${lang}.json`), "utf8")) as Entry[];
    const linked = JSON.parse(await readFile(path.join(TMP, lang === "ja" ? "examples-exact-ja-full.json" : "examples-exact-zh.json"), "utf8")) as Record<string, Example>;
    const unlinked: Record<string, [string, string]> = lang === "ja"
      ? JSON.parse(await readFile(path.join(TMP, "examples-unlinked-ja.json"), "utf8")) : {};
    const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
    const words = new Set(lex.map((entry) => entry.w));
    const selected = new Set(lex.filter((entry) => own(linked, entry.w) || own(unlinked, entry.w)).map((entry) => entry.w));
    const additions: string[] = [];
    const frequency = (await readFile(path.join(TMP, `freq-${lang}.txt`), "utf8")).split("\n");
    for (const row of frequency) {
      const word = row.trim().split(/\s+/)[0]?.toLowerCase();
      if (!word || words.has(word) || (!own(linked, word) && !own(unlinked, word))) continue;
      words.add(word); selected.add(word); additions.push(word);
      if (selected.size >= TARGET) break;
    }
    const sentences = Array.from(new Set(Array.from(selected).filter((w) => !own(linked, w) && own(unlinked, w)).map((w) => unlinked[w][0])));
    console.log(`${lang}: ${selected.size} exact matches; translate ${additions.length} new words and ${sentences.length} example sentences`);
    const jobs: { kind: "word" | "sentence"; items: string[]; offset: number }[] = [];
    for (const [kind, list] of [["word", additions], ["sentence", sentences]] as const) {
      for (let offset = 0; offset < list.length; offset += 35) jobs.push({ kind, items: list.slice(offset, offset + 35), offset });
    }
    const wordTranslations: string[] = new Array(additions.length);
    const sentenceTranslations: string[] = new Array(sentences.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= jobs.length) break;
        const job = jobs[i], translated = await translate(job.items, lang);
        const target = job.kind === "word" ? wordTranslations : sentenceTranslations;
        translated.forEach((value, index) => { target[job.offset + index] = value; });
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    const translations = new Map(sentences.map((sentence, i) => [sentence, sentenceTranslations[i]]));
    const validAdditions = additions.map((w, i) => ({ w, t: wordTranslations[i] })).filter((entry) => entry.t && entry.t.length <= 100);
    const resultLex = [...lex, ...validAdditions];
    const result: Record<string, Example> = {};
    for (const entry of resultLex) {
      if (!selected.has(entry.w)) continue;
      if (own(linked, entry.w)) result[entry.w] = linked[entry.w];
      else if (own(unlinked, entry.w)) {
        const [sentence, attribution] = unlinked[entry.w];
        const tr = translations.get(sentence);
        if (tr && tr.length <= 180) result[entry.w] = [sentence, tr, attribution, "Türkçe: otomatik çeviri"];
      }
    }
    if (Object.keys(result).length < 6000) throw new Error(`${lang}: ${Object.keys(result).length} verified examples; expected >=6000`);
    await writeFile(path.join(ROOT, `src/data/lexicon/${lang}.json`), JSON.stringify(resultLex));
    await writeFile(path.join(ROOT, `src/data/examples/${lang}.json`), JSON.stringify(result));
    console.log(`${lang}: ${resultLex.length} word records, ${Object.keys(result).length} exact attributed examples`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
