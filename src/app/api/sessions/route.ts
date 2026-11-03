import { db } from "@/db";
import { devices, sessions } from "@/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { bad, deviceFrom, json } from "@/lib/server";
import { LANGUAGES } from "@/lib/languages";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const device = new URL(req.url).searchParams.get("device") || deviceFrom(req);
  const rows = await db.select().from(sessions).where(eq(sessions.deviceId, device)).orderBy(desc(sessions.startedAt)).limit(30);
  const dev = await db.select().from(devices).where(eq(devices.id, device)).limit(1);
  return json({ device, sessions: rows, device_row: dev[0] ?? null });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("geçersiz gövde");
  const device = deviceFrom(req, body.deviceId || "local");
  const action = String(body.action || "start");

  if (action === "start") {
    const lang = String(body.lang || "en");
    if (!LANGUAGES.some((item) => item.code === lang)) return bad("desteklenmeyen dil");
    const mode = body.mode === "speaker" ? "speaker" : "binaural";
    const [row] = await db.insert(sessions).values({
      deviceId: device, lang, mode,
      scheme: typeof body.scheme === "string" ? body.scheme.slice(0, 24) : null,
    }).returning();
    return json({ ok: true, session: row });
  }
  if (action !== "end") return bad("geçersiz işlem");
  const id = Number(body.sessionId);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) return bad("geçerli sessionId gerekli");
  const minutes = Math.max(0, Number(body.minutes || 0) | 0);
  const blocks = Math.max(1, Number(body.blocks || 1) | 0);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Bitirme ve seri güncellemesi tek işlemde; tekrar gönderimler seriyi artırmaz.
  const result = await db.transaction(async (tx) => {
    const [ended] = await tx.update(sessions).set({ endedAt: new Date(), minutes, blocks })
      .where(and(eq(sessions.id, id), eq(sessions.deviceId, device), isNull(sessions.endedAt)))
      .returning({ id: sessions.id });
    if (!ended) {
      const [existing] = await tx.select({ id: sessions.id }).from(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.deviceId, device))).limit(1);
      return existing ? "already-ended" : "not-found";
    }
    const nextStreak = sql<number>`case
      when ${devices.lastNight} = ${today} then ${devices.streak}
      when ${devices.lastNight} = ${yesterday} then ${devices.streak} + 1
      else 1 end`;
    await tx.insert(devices).values({ id: device, name: "device", streak: 1, longestStreak: 1, lastNight: today })
      .onConflictDoUpdate({
        target: devices.id,
        set: {
          streak: nextStreak,
          longestStreak: sql`greatest(${devices.longestStreak}, ${nextStreak})`,
          lastNight: today,
          updatedAt: new Date(),
        },
      });
    return "ended";
  });
  if (result === "not-found") return bad("seans bulunamadı", 404);
  return json({ ok: true, alreadyEnded: result === "already-ended" });
}
