import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Expand existing subtitle-frequency lists with Turkish machine glosses. */
const TARGET = 6500;
const CONCURRENCY = 8;
const BATCH = 40;
const ROOT = path.join(process.cwd(), "src/data/lexicon");
const SOURCES: Record<string, string> = {
  en: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt",
  fr: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt",
  es: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt",
  it: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt",
  ru: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_50k.txt",
  ja: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ja/ja_full.txt",
  zh: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/zh_cn/zh_cn_50k.txt",
};
const VALID: Record<string, RegExp> = {
  en: /^[a-z]{2,16}$/,
  fr: /^[a-zàâçéèêëîïôûùüÿœæ]{2,18}$/,
  es: /^[a-záéíóúüñ]{2,18}$/,
  it: /^[a-zàèéìíîòóùú]{2,18}$/,
  ru: /^[а-яё]{2,18}$/,
  ja: /^[\u3040-\u30ff\u4e00-\u9faf]{2,7}$/,
  zh: /^[\u4e00-\u9fff]{2,5}$/,
};
type Entry = { w: string; t: string };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function translate(words: string[], lang: string): Promise<string[]> {
  const locale = lang === "zh" ? "zh-CN" : lang;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${locale}&tl=tr&dt=t&q=${encodeURIComponent(words.join("\n"))}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" },
        signal: AbortSignal.timeout(18000),
      });
      if (response.ok) {
        const data = await response.json() as [Array<[string, string]>];
        const lines = (data[0] ?? []).map((part) => part?.[0] ?? "").join("").split("\n").map((line) => line.trim());
        if (lines.length === words.length && lines.every(Boolean)) return lines;
        break;
      }
    } catch { /* retry */ }
    await sleep(450 * (attempt + 1));
  }
  if (words.length <= 1) return [""];
  const middle = Math.ceil(words.length / 2);
  return [...await translate(words.slice(0, middle), lang), ...await translate(words.slice(middle), lang)];
}

async function main() {
  await mkdir(ROOT, { recursive: true });
  const jobs: { lang: string; words: string[]; index: number }[] = [];
  const results = new Map<string, Entry[]>();
  const current = new Map<string, Entry[]>();
  for (const [lang, source] of Object.entries(SOURCES)) {
    const old = JSON.parse(await readFile(path.join(ROOT, `${lang}.json`), "utf8")) as Entry[];
    current.set(lang, old);
    const seen = new Set(old.map((entry) => entry.w));
    const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Cannot download ${lang}: ${response.status}`);
    const text = await response.text();
    const additions: string[] = [];
    for (const row of text.split("\n")) {
      const word = row.trim().split(/\s+/)[0]?.toLowerCase();
      if (!word || !VALID[lang].test(word) || seen.has(word)) continue;
      seen.add(word);
      additions.push(word);
      if (old.length + additions.length >= TARGET) break;
    }
    const batches = Math.ceil(additions.length / BATCH);
    for (let i = 0; i < additions.length; i += BATCH) jobs.push({ lang, words: additions.slice(i, i + BATCH), index: i });
    results.set(lang, new Array(additions.length));
    console.log(`${lang}: ${old.length} mevcut, ${additions.length} yeni, ${batches} grup`);
  }
  let next = 0;
  let finished = 0;
  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      const translated = await translate(job.words, job.lang);
      const target = results.get(job.lang)!;
      job.words.forEach((word, i) => {
        target[job.index + i] = { w: word, t: translated[i] ?? "" };
      });
      finished++;
      if (finished % 35 === 0) console.log(`çeviri ${finished}/${jobs.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  for (const lang of Object.keys(SOURCES)) {
    const combined = [...current.get(lang)!, ...results.get(lang)!.filter((entry) => entry?.t && entry.t.length <= 100)];
    await writeFile(path.join(ROOT, `${lang}.json`), JSON.stringify(combined));
    console.log(`${lang}: ${combined.length} gerçek sözlük kaydı yazıldı`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
