import { db } from "@/db";
import { progress } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { bad, deviceFrom, json } from "@/lib/server";
import { LANGUAGES } from "@/lib/languages";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const device = url.searchParams.get("device") || deviceFrom(req);
  const rows = await db.select().from(progress).where(eq(progress.deviceId, device)).orderBy(desc(progress.updatedAt));
  return json({ device, items: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("geçersiz gövde");
  const device = deviceFrom(req, body.deviceId || "local");
  const lang = String(body.lang || "en");
  if (!LANGUAGES.some((item) => item.code === lang)) return bad("desteklenmeyen dil");
  const blockIndex = Math.max(0, Number(body.blockIndex || 0) | 0);
  const wordIndex = Math.max(0, Number(body.wordIndex || 0) | 0);
  const listenedSeconds = Math.max(0, Number(body.listenedSeconds || 0) | 0);

  await db.insert(progress)
    .values({ deviceId: device, lang, blockIndex, wordIndex, listenedSeconds })
    .onConflictDoUpdate({
      target: [progress.deviceId, progress.lang],
      set: { blockIndex, wordIndex, listenedSeconds, updatedAt: new Date() },
    });
  return json({ ok: true, device, lang, blockIndex });
}
