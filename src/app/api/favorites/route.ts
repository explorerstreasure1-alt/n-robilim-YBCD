import { db } from "@/db";
import { favorites, words } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { bad, deviceFrom, json } from "@/lib/server";
import { getExample } from "@/lib/examples";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const device = url.searchParams.get("device") || deviceFrom(req);
  const lang = url.searchParams.get("lang");
  const rows = await db
    .select({
      id: favorites.id,
      wordId: favorites.wordId,
      lang: favorites.lang,
      note: favorites.note,
      createdAt: favorites.createdAt,
      text: words.text,
      translation: words.translation,
      pos: words.pos,
      level: words.level,
      topic: words.topic,
    })
    .from(favorites)
    .innerJoin(words, eq(favorites.wordId, words.id))
    .where(lang ? and(eq(favorites.deviceId, device), eq(favorites.lang, lang)) : eq(favorites.deviceId, device))
    .orderBy(desc(favorites.createdAt))
    .limit(200);
  return json({ items: rows.map((row) => ({ ...row, example: getExample(row.lang, row.text) })) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("geçersiz gövde");
  const device = deviceFrom(req, body.deviceId || "local");
  const wordId = Number(body.wordId);
  if (!Number.isSafeInteger(wordId) || wordId < 1 || wordId > 2147483647) return bad("geçerli wordId gerekli");
  if (body.active !== undefined && typeof body.active !== "boolean") return bad("active boolean olmalı");

  const [existing] = await db.select({ id: favorites.id }).from(favorites)
    .where(and(eq(favorites.deviceId, device), eq(favorites.wordId, wordId))).limit(1);
  // Eski istemciler için toggle; yeni istemciler için tekrar denenebilir açık durum.
  const active = typeof body.active === "boolean" ? body.active : !existing;
  const [word] = await db.select({ lang: words.lang }).from(words).where(eq(words.id, wordId)).limit(1);
  if (!word) {
    // Olmayan kelime için varsa eski favori kalıntısını da temizle.
    if (existing) await db.delete(favorites).where(eq(favorites.id, existing.id));
    return bad("kelime bulunamadı", 404);
  }
  if (!active) {
    if (existing) await db.delete(favorites).where(eq(favorites.id, existing.id));
    return json({ ok: true, active: false });
  }
  await db.insert(favorites).values({
    deviceId: device,
    wordId,
    lang: word.lang,
    note: body.note ? String(body.note).slice(0, 300) : null,
  }).onConflictDoNothing({ target: [favorites.deviceId, favorites.wordId] });
  return json({ ok: true, active: true });
}
