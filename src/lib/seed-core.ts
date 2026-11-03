import type { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { words } from "../db/schema";
import { PACKS, SCHEMES } from "../data/packs";
import { buildPatternLines } from "../data/patterns";
import { curatedEntries, estimatedLevel, estimatedTopic } from "../data/curriculum";
import { numberWord } from "./numbers";
import en from "../data/lexicon/en.json";
import fr from "../data/lexicon/fr.json";
import es from "../data/lexicon/es.json";
import it from "../data/lexicon/it.json";
import ru from "../data/lexicon/ru.json";
import ja from "../data/lexicon/ja.json";
import zh from "../data/lexicon/zh.json";

export const TARGET_PER_LANG = 6000;

type Row = typeof words.$inferInsert;
type Lex = { w: string; t: string }[];

const LEXICON: Record<string, Lex> = { en, fr, es, it, ru, ja, zh };

/** Sık geçen işlev sözcükleri için bağlamdan bağımsız doğru karşılıklar. */
const GLOSS: Record<string, Record<string, string>> = {
  en: { the: "belirli artikel", a: "bir", an: "bir", to: "-e / -a, için", of: "-in / -ın", and: "ve", in: "içinde", is: "-dir", it: "o", you: "sen", that: "şu, ki", was: "-di (geçmiş)", for: "için", on: "üzerinde", are: "-dirler", with: "ile", as: "olarak", his: "onun (erkek)", be: "olmak", at: "-de / -da", have: "sahip olmak", this: "bu", from: "-den / -dan", or: "veya", by: "tarafından, ile", not: "değil", but: "ama", what: "ne", all: "hepsi", were: "-diler", we: "biz", when: "ne zaman", your: "senin", can: "-ebilmek", said: "dedi", there: "orada", use: "kullanmak", each: "her biri", which: "hangi", she: "o (kadın)", do: "yapmak", how: "nasıl", their: "onların", if: "eğer", will: "-ecek", up: "yukarı", out: "dışarı", about: "hakkında", who: "kim", get: "almak", make: "yapmak", go: "gitmek", me: "beni", my: "benim", no: "hayır", yes: "evet" },
  fr: { de: "-in / -ın, -den", le: "belirli artikel (eril)", la: "belirli artikel (dişil)", les: "belirli artikel (çoğul)", un: "bir (eril)", une: "bir (dişil)", je: "ben", tu: "sen", il: "o (erkek)", elle: "o (kadın)", nous: "biz", vous: "siz", ils: "onlar", est: "-dir", et: "ve", à: "-e / -a", en: "içinde, -de", que: "ki, ne", qui: "kim", ne: "olumsuzluk eki", pas: "değil", plus: "daha fazla", ce: "bu", c: "bu", dans: "içinde", pour: "için", sur: "üzerinde", avec: "ile", oui: "evet", non: "hayır", mais: "ama", ou: "veya", très: "çok", bien: "iyi", tout: "her şey", faire: "yapmak", être: "olmak", avoir: "sahip olmak" },
  es: { el: "belirli artikel (eril)", la: "belirli artikel (dişil)", los: "belirli artikel (çoğul)", las: "belirli artikel (çoğul)", un: "bir (eril)", una: "bir (dişil)", de: "-in / -ın", que: "ki, ne", no: "hayır, değil", a: "-e / -a", y: "ve", en: "içinde, -de", es: "-dir", lo: "onu", por: "için, tarafından", con: "ile", para: "için", su: "onun", se: "kendini", del: "-in (birleşik)", al: "-e (birleşik)", me: "bana", te: "sana", sí: "evet", pero: "ama", o: "veya", muy: "çok", más: "daha", bien: "iyi", todo: "her şey", ser: "olmak", estar: "bulunmak", tener: "sahip olmak", hacer: "yapmak" },
  it: { il: "belirli artikel (eril)", lo: "belirli artikel (eril)", la: "belirli artikel (dişil)", i: "belirli artikel (çoğul)", gli: "belirli artikel (çoğul)", le: "belirli artikel (çoğul)", un: "bir (eril)", una: "bir (dişil)", di: "-in / -ın", che: "ki, ne", non: "değil", e: "ve", a: "-e / -a", in: "içinde, -de", è: "-dir", per: "için", con: "ile", su: "üzerinde", si: "kendini", mi: "beni", ti: "sana", sì: "evet", ma: "ama", o: "veya", molto: "çok", più: "daha", bene: "iyi", tutto: "her şey", essere: "olmak", avere: "sahip olmak", fare: "yapmak" },
  ru: { и: "ve", в: "içinde, -de", не: "değil", на: "üzerinde", я: "ben", что: "ne, ki", ты: "sen", он: "o (erkek)", она: "o (kadın)", мы: "biz", вы: "siz", они: "onlar", это: "bu", как: "nasıl", да: "evet", нет: "hayır", но: "ama", или: "veya", с: "ile", по: "boyunca, -e göre", за: "için, arkasında", к: "-e / -a", из: "-den / -dan", у: "yanında, -de", очень: "çok", хорошо: "iyi", всё: "her şey", быть: "olmak", есть: "var", сделать: "yapmak" },
  ja: { の: "-in / -ın", は: "konu eki", を: "belirtme eki", に: "-e / -a", が: "özne eki", で: "-de / -da", と: "ile, diye", も: "de / da", か: "soru eki", ね: "değil mi", よ: "vurgu eki", はい: "evet", いいえ: "hayır", とても: "çok", これ: "bu", それ: "şu", あれ: "o", する: "yapmak", ある: "var (cansız)", いる: "var (canlı)" },
  zh: { 的: "-in / -ın", 是: "-dir", 不: "değil", 了: "tamamlanma eki", 在: "-de / -da", 有: "var", 我: "ben", 你: "sen", 他: "o (erkek)", 她: "o (kadın)", 我们: "biz", 你们: "siz", 他们: "onlar", 这: "bu", 那: "şu", 和: "ve", 也: "de / da", 很: "çok", 吗: "soru eki", 呢: "peki", 对: "doğru", 好: "iyi", 要: "istemek", 会: "-ebilmek", 说: "söylemek", 什么: "ne" },
};

/**
 * Kayıt kimlikleri korunarak paketleri genişletir. Her dilde en az 6.000
 * sayı olmayan kelime/cümle hedeflenir. Eski kayıtlar asla silinmez.
 * Sıklık kaynaklı etiketler yaklaşık; çeviriler makine çevirisi içerebilir.
 */
export async function seedAll(pool: Pool): Promise<{ seeded: boolean; count: number }> {
  const connection = await pool.connect();
  const db = drizzle(connection);
  await db.execute(sql`select pg_advisory_lock(731846291)`);
  try {
    let total = 0;
    let changed = false;
    for (const pack of PACKS) {
      const existing = await db.select({
        id: words.id, text: words.text, translation: words.translation,
        tier: words.tier, pos: words.pos, level: words.level, topic: words.topic,
      }).from(words).where(eq(words.lang, pack.code));
      const curated = curatedEntries(pack.code);
      const curatedMap = new Map(curated.map((entry) => [entry.text, entry]));
      const lex = LEXICON[pack.code] ?? [];
      const rank = new Map(lex.map((entry, index) => [entry.w, index]));

      // Önceden kaydedilmiş kelimelere tahmini etiketleri ekle; id'ler değişmez.
      const updates = existing.filter((entry) => {
        const known = curatedMap.get(entry.text);
        return !entry.level || !entry.topic || Boolean(known &&
          (entry.level !== known.level || entry.topic !== known.topic || entry.pos !== known.pos || entry.translation !== known.translation));
      }).map((entry) => {
        const known = curatedMap.get(entry.text);
        const level = known?.level ?? (entry.tier === 1 ? estimatedLevel(rank.get(entry.text) ?? 0) : "A1");
        const topic = known?.topic ?? estimatedTopic(entry.translation, entry.tier);
        return { id: entry.id, level, topic, pos: known?.pos ?? entry.pos, translation: known?.translation ?? entry.translation };
      });
      for (let i = 0; i < updates.length; i += 400) {
        const values = sql.join(updates.slice(i, i + 400).map((entry) =>
          sql`(${entry.id}::int, ${entry.level}::text, ${entry.topic}::text, ${entry.pos}::text, ${entry.translation}::text)`
        ), sql`, `);
        await db.execute(sql`update words as w set level=v.level, topic=v.topic, pos=v.pos, translation=v.translation from (values ${values}) as v(id, level, topic, pos, translation) where w.id=v.id`);
        changed = true;
      }

      const rows: Row[] = [];
      const seen = new Set(existing.map((entry) => entry.text));
      let idx = existing.length;
      const push = (r: Omit<Row, "id" | "blockIndex" | "lineIndex">, unique = true) => {
        if (unique && seen.has(r.text as string)) return;
        seen.add(r.text as string);
        rows.push({ ...r, blockIndex: Math.floor(idx / 7), lineIndex: idx % 7 });
        idx++;
      };

      if (!existing.length) {
        pack.lines.forEach((line, index) => push({
          lang: pack.code, tier: 0, scheme: SCHEMES[Math.floor(index / 7) % SCHEMES.length],
          text: line.s, translation: line.t, rhyme: line.r, pos: "kafiye",
          level: "A1", topic: "expressions",
        }, false));
        for (const line of buildPatternLines(pack.code)) push({
          lang: pack.code, tier: 3, scheme: "KALIP", text: line.s, translation: line.t,
          rhyme: null, pos: "kalıp cümle", level: "A1", topic: estimatedTopic(line.t, 3),
        });
        for (const word of pack.words) push({
          lang: pack.code, tier: 1, scheme: "KELİME", text: word.w, translation: word.t,
          rhyme: null, pos: word.pos, level: "A1", topic: estimatedTopic(word.t, 1),
        });
      }

      for (const entry of curated) push({
        lang: pack.code, tier: entry.tier, scheme: entry.tier === 3 ? "KALIP" : "KELİME",
        text: entry.text, translation: entry.translation, rhyme: null,
        pos: entry.pos, level: entry.level, topic: entry.topic,
      });

      const gloss = GLOSS[pack.code] ?? {};
      lex.forEach((item, index) => {
        const translation = gloss[item.w] ?? item.t;
        const topic = estimatedTopic(translation, 1);
        push({
          lang: pack.code, tier: 1, scheme: "KELİME", text: item.w, translation,
          rhyme: null, pos: topic === "verbs" ? "fiil" : topic === "pronouns" ? "zamir" : "kelime",
          level: estimatedLevel(index), topic,
        });
      });

      // Küçük bir sayı bölümü öğretim içindir; 6.000 hedefini doldurmak için kullanılmaz.
      if (!existing.length) for (let n = 0; n <= 100; n++) push({
        lang: pack.code, tier: 2, scheme: "SAYI", text: numberWord(pack.code, n),
        translation: String(n), rhyme: null, pos: "sayı", level: "A1", topic: "time",
      });

      const meaningful = existing.filter((entry) => entry.tier !== 2).length + rows.filter((entry) => entry.tier !== 2).length;
      if (meaningful < TARGET_PER_LANG) throw new Error(`${pack.code}: yalnızca ${meaningful} sayı dışı kayıt; paket eksik`);
      for (let i = 0; i < rows.length; i += 700) {
        await db.insert(words).values(rows.slice(i, i + 700)).onConflictDoNothing();
        changed = true;
      }
      total += existing.length + rows.length;
    }
    return { seeded: changed, count: total };
  } finally {
    await db.execute(sql`select pg_advisory_unlock(731846291)`);
    connection.release();
  }
}
