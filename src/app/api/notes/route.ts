import { db } from "@/db";
import { notes } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { bad, deviceFrom, json } from "@/lib/server";
import { LANGUAGES } from "@/lib/languages";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const device = new URL(req.url).searchParams.get("device") || deviceFrom(req);
  const rows = await db.select().from(notes).where(eq(notes.deviceId, device)).orderBy(desc(notes.createdAt)).limit(30);
  return json({ items: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("geçersiz gövde");
  const device = deviceFrom(req, body.deviceId || "local");
  const lang = String(body.lang || "en");
  if (!LANGUAGES.some((item) => item.code === lang)) return bad("desteklenmeyen dil");
  const clientKey = typeof body.clientKey === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(body.clientKey)
    ? body.clientKey : null;
  const date = typeof body.createdAt === "string" ? new Date(body.createdAt) : new Date();
  const createdAt = Number.isFinite(date.getTime()) ? date : new Date();
  const sessionId = Number(body.sessionId);
  const values = {
    deviceId: device,
    clientKey,
    lang,
    createdAt,
    rating: Math.min(5, Math.max(0, Number(body.rating || 0) | 0)),
    recalled: String(body.recalled || "").slice(0, 600),
    feeling: String(body.feeling || "").slice(0, 120),
    sessionId: Number.isSafeInteger(sessionId) && sessionId > 0 && sessionId <= 2147483647 ? sessionId : null,
  };

  const [inserted] = await db.insert(notes).values(values)
    .onConflictDoNothing({ target: [notes.deviceId, notes.clientKey] }).returning();
  if (inserted) return json({ ok: true, note: inserted, duplicate: false });
  if (!clientKey) return bad("not kaydedilemedi", 500);
  const [existing] = await db.select().from(notes)
    .where(and(eq(notes.deviceId, device), eq(notes.clientKey, clientKey))).limit(1);
  return existing ? json({ ok: true, note: existing, duplicate: true }) : bad("not kaydedilemedi", 500);
}
