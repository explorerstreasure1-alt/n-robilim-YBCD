import { db } from "@/db";
import { words } from "@/db/schema";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { bad, ensureSeeded, json } from "@/lib/server";
import { SCHEMES } from "@/data/packs";
import { getExample } from "@/lib/examples";

export const dynamic = "force-dynamic";

/** 7 satırlık kafiyeli blok — seansın temel birimi. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") || "en";
  const index = Math.max(0, Number(url.searchParams.get("index") || 0) | 0);

  await ensureSeeded();

  const [{ c }] = await db
    .select({ c: count() })
    .from(words)
    .where(and(eq(words.lang, lang), ne(words.tier, 2)));
  if (!c) return bad("bilinmeyen dil", 404);

  const totalBlocks = Math.ceil(c / 7);
  const safeIndex = index % totalBlocks;

  const fields = {
    id: words.id, text: words.text, translation: words.translation, rhyme: words.rhyme,
    tier: words.tier, blockIndex: words.blockIndex, lineIndex: words.lineIndex,
    scheme: words.scheme, pos: words.pos,
  };
  const filter = and(eq(words.lang, lang), ne(words.tier, 2));
  const all = await db.select(fields).from(words).where(filter).orderBy(asc(words.id))
    .limit(7).offset(safeIndex * 7);
  // Son blok kısa ise yedi satır tamamlanana kadar paketin başına dön.
  if (all.length < 7) {
    const first = await db.select(fields).from(words).where(filter).orderBy(asc(words.id)).limit(7 - all.length);
    all.push(...first);
  }

  const scheme = all[0]?.scheme || SCHEMES[safeIndex % SCHEMES.length];

  return json({
    index: safeIndex,
    totalBlocks,
    scheme,
    lines: all.map((r, i) => {
      // Sözcükler için kaynaklı bir bağlam varsa gece akışı cümleyi okur.
      const example = r.tier === 1 ? getExample(lang, r.text) : null;
      return {
        line: i,
        text: example?.sentence ?? r.text,
        translation: example?.translation ?? r.translation,
        word: example ? r.text : null,
        wordTranslation: example ? r.translation : null,
        exampleSource: example?.attribution ?? null,
        exampleTranslationSource: example?.translationAttribution ?? null,
        rhyme: r.rhyme,
        tier: r.tier,
        wordId: r.id,
      };
    }),
  });
}
