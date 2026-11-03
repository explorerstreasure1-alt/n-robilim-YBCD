/**
 * Gerçek sıklık sözlüğü derleyici.
 * OpenSubtitles sıklık listelerinden en sık kullanılan kelimeler alınır,
 * Türkçe karşılıkları toplu çeviriyle eklenir ve src/data/lexicon/*.json
 * olarak yazılır. Sonuç repoya gömülür: çalışma anında ağ gerekmez.
 *
 *   npx tsx scripts/build-lexicon.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TARGET = 3000;
const BATCH = 40;

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
  en: /^[a-z]{2,14}$/,
  fr: /^[a-zàâçéèêëîïôûùüÿœæ]{2,16}$/,
  es: /^[a-záéíóúüñ]{2,16}$/,
  it: /^[a-zàèéìíîòóùú]{2,16}$/,
  ru: /^[а-яё]{3,16}$/,
  ja: /^[\u3040-\u30ff\u4e00-\u9faf]{2,6}$/,
  zh: /^[\u4e00-\u9fff]{2,4}$/,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchList(url: string): Promise<string[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`liste alınamadı ${res.status}`);
  const text = await res.text();
  return text
    .split("\n")
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean);
}

async function translateBatch(words: string[], lang: string): Promise<string[] | null> {
  const q = words.join("\n");
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${lang}&tl=tr&dt=t&q=` +
    encodeURIComponent(q);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36" },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) {
        await sleep(900 * (attempt + 1));
        continue;
      }
      const data = (await res.json()) as [Array<[string, string]>];
      const joined = (data?.[0] ?? []).map((seg) => seg?.[0] ?? "").join("");
      const lines = joined.split("\n").map((s) => s.trim()).filter(Boolean);
      if (lines.length === words.length) return lines;
      return null;
    } catch {
      await sleep(900 * (attempt + 1));
    }
  }
  return null;
}

async function main() {
  const outDir = path.join(process.cwd(), "src", "data", "lexicon");
  await mkdir(outDir, { recursive: true });

  for (const [lang, url] of Object.entries(SOURCES)) {
    process.stdout.write(`\n[${lang}] liste indiriliyor… `);
    const raw = await fetchList(url);
    const seen = new Set<string>();
    const words: string[] = [];
    for (const w of raw) {
      const word = w.toLowerCase();
      if (!VALID[lang].test(word)) continue;
      if (seen.has(word)) continue;
      seen.add(word);
      words.push(word);
      if (words.length >= TARGET) break;
    }
    process.stdout.write(`${words.length} kelime. çeviri… `);

    const entries: { w: string; t: string }[] = [];
    for (let i = 0; i < words.length; i += BATCH) {
      const slice = words.slice(i, i + BATCH);
      const tr = await translateBatch(slice, lang === "zh" ? "zh-CN" : lang);
      if (tr) slice.forEach((w, k) => entries.push({ w, t: tr[k] }));
      else slice.forEach((w) => entries.push({ w, t: "" }));
      if (i % (BATCH * 10) === 0) process.stdout.write(`${i}… `);
      await sleep(120);
    }

    // çevrilemeyenleri tek tek dene
    const missing = entries.filter((e) => !e.t);
    for (const m of missing.slice(0, 200)) {
      const one = await translateBatch([m.w], lang === "zh" ? "zh-CN" : lang);
      if (one?.[0]) m.t = one[0];
      await sleep(80);
    }

    const clean = entries.filter((e) => e.t && e.t.length < 60);
    await writeFile(path.join(outDir, `${lang}.json`), JSON.stringify(clean), "utf8");
    process.stdout.write(`✓ ${clean.length} kayıt yazıldı`);
  }
  console.log("\nBitti.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
