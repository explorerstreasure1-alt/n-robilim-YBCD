import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Add real frequency words with attributed Tatoeba examples until 6,200 per language. */
type Entry = { w: string; t: string };
type Example = [string, string, string, string];
const LANGS = ["en", "ru", "it", "es", "ja", "zh", "fr"];
const ROOT = process.cwd();
const CORPUS = "/tmp/nocta-corpus";
const TARGET = 6200;
const BATCH = 40;
const WAIT = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function translate(words: string[], lang: string): Promise<string[]> {
  const locale = lang === "zh" ? "zh-CN" : lang;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${locale}&tl=tr&dt=t&q=${encodeURIComponent(words.join("\n"))}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" },
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) {
        const data = await r.json() as [Array<[string, string]>];
        const lines = (data[0] ?? []).map((part) => part?.[0] ?? "").join("").split("\n").map((line) => line.trim());
        if (lines.length === words.length && lines.every(Boolean)) return lines;
        break;
      }
    } catch { /* retry */ }
    await WAIT(500 * (attempt + 1));
  }
  if (words.length <= 1) return [""];
  const middle = Math.ceil(words.length / 2);
  return [...await translate(words.slice(0, middle), lang), ...await translate(words.slice(middle), lang)];
}

async function main() {
  const old = new Map<string, Entry[]>();
  const examples = new Map<string, Record<string, Example>>();
  const additions = new Map<string, Entry[]>();
  const jobs: { lang: string; words: string[]; start: number }[] = [];
  for (const lang of LANGS) {
    const lex = JSON.parse(await readFile(path.join(ROOT, "src/data/lexicon", `${lang}.json`), "utf8")) as Entry[];
    const ex = JSON.parse(await readFile(path.join(CORPUS, `examples-candidates-${lang}.json`), "utf8")) as Record<string, Example>;
    old.set(lang, lex); examples.set(lang, ex);
    const known = new Set(lex.map((entry) => entry.w));
    const covered = lex.filter((entry) => Boolean(ex[entry.w])).length;
    const words: string[] = [];
    const raw = await readFile(path.join(CORPUS, `freq-${lang}.txt`), "utf8");
    for (const row of raw.split("\n")) {
      const word = row.trim().split(/\s+/)[0]?.toLowerCase();
      if (!word || known.has(word) || !ex[word]) continue;
      known.add(word); words.push(word);
      if (covered + words.length >= TARGET) break;
    }
    additions.set(lang, new Array(words.length));
    for (let i = 0; i < words.length; i += BATCH) jobs.push({ lang, words: words.slice(i, i + BATCH), start: i });
    console.log(`${lang}: ${covered} existing examples + ${words.length} candidates`);
  }
  let cursor = 0;
  let complete = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= jobs.length) return;
      const job = jobs[i];
      const translations = await translate(job.words, job.lang);
      job.words.forEach((w, index) => { additions.get(job.lang)![job.start + index] = { w, t: translations[index] ?? "" }; });
      complete++;
      if (complete % 30 === 0) console.log(`translated ${complete}/${jobs.length} batches`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  for (const lang of LANGS) {
    const extra = additions.get(lang)!.filter((item) => item?.t && item.t.length <= 100);
    const lex = [...old.get(lang)!, ...extra];
    const source = examples.get(lang)!;
    const selected = Object.fromEntries(lex.filter((entry) => source[entry.w]).map((entry) => [entry.w, source[entry.w]]));
    if (Object.keys(selected).length < 6000) throw new Error(`${lang}: only ${Object.keys(selected).length} contextual words`);
    await writeFile(path.join(ROOT, "src/data/lexicon", `${lang}.json`), JSON.stringify(lex));
    await writeFile(path.join(ROOT, "src/data/examples", `${lang}.json`), JSON.stringify(selected));
    console.log(`${lang}: ${lex.length} words, ${Object.keys(selected).length} with attributed examples`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
