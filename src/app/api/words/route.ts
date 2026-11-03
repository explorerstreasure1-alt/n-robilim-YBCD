import { db } from "@/db";
import { words } from "@/db/schema";
import { and, asc, count, eq, ne, or, ilike } from "drizzle-orm";
import { ensureSeeded, json } from "@/lib/server";
import { LEVELS, TOPICS } from "@/data/curriculum";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") || "en";
  const q = (url.searchParams.get("q") || "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) | 0);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 60) | 0));
  const tier = url.searchParams.get("tier");
  const level = url.searchParams.get("level");
  const topic = url.searchParams.get("topic");

  await ensureSeeded();

  const filters = [eq(words.lang, lang)];
  if (q) filters.push(or(ilike(words.text, `%${q}%`), ilike(words.translation, `%${q}%`))!);
  if (tier !== null && tier !== "" && /^[0-3]$/.test(tier)) filters.push(eq(words.tier, Number(tier)));
  if (level && LEVELS.some((item) => item === level)) filters.push(eq(words.level, level));
  if (topic && TOPICS.some((item) => item.id === topic)) filters.push(eq(words.topic, topic));

  const where = and(...filters);
  const rows = await db
    .select({
      id: words.id,
      text: words.text,
      translation: words.translation,
      pos: words.pos,
      tier: words.tier,
      rhyme: words.rhyme,
      blockIndex: words.blockIndex,
      level: words.level,
      topic: words.topic,
    })
    .from(words)
    .where(where)
    .orderBy(asc(words.id))
    .limit(limit)
    .offset(offset);

  const [{ c }] = await db.select({ c: count() }).from(words).where(where);
  const [{ c: meaningfulTotal }] = await db.select({ c: count() }).from(words)
    .where(and(eq(words.lang, lang), ne(words.tier, 2)));
  return json({ total: c, meaningfulTotal, offset, limit, items: rows });
}
