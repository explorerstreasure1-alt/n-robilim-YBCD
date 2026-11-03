import { db } from "@/db";
import { devices, favorites, progress } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deviceFrom, json } from "@/lib/server";
import { LANGUAGES } from "@/lib/languages";

export const dynamic = "force-dynamic";

/**
 * Bulut senkronizasyonu.
 * SUPABASE_URL + SUPABASE_ANON_KEY tanımlıysa cihaz durumu Supabase REST
 * üzerinden de yazılır; yoksa yerel PostgreSQL tek doğruluk kaynağı olur.
 */
export async function GET(req: Request) {
  const device = new URL(req.url).searchParams.get("device") || deviceFrom(req);
  const dev = await db.select().from(devices).where(eq(devices.id, device)).limit(1);
  const prog = await db.select().from(progress).where(eq(progress.deviceId, device));
  const fav = await db.select().from(favorites).where(eq(favorites.deviceId, device));
  return json({
    device,
    // Yapılandırma tek başına başarılı çift yönlü senkronizasyon demek değildir.
    cloud: false,
    cloudConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    device_row: dev[0] ?? null,
    progress: prog,
    favorites: fav.map((f) => f.wordId),
    syncedAt: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return json({ ok: false }, { status: 400 });
  const device = deviceFrom(req, body.deviceId || "local");
  const settings = body.settings ?? {};
  const existing = await db.select().from(devices).where(eq(devices.id, device)).limit(1);
  if (existing.length) {
    await db
      .update(devices)
      .set({ settings, updatedAt: new Date(), name: body.name ?? existing[0].name })
      .where(eq(devices.id, device));
  } else {
    await db.insert(devices).values({ id: device, settings, name: body.name || "device" }).onConflictDoNothing();
  }

  if (Array.isArray(body.progress)) {
    for (const p of body.progress.slice(0, 7)) {
      if (!p || typeof p !== "object") continue;
      const lang = String(p.lang || "en");
      if (!LANGUAGES.some((item) => item.code === lang)) continue;
      const values = {
        blockIndex: Math.max(0, Number(p.blockIndex || 0) | 0),
        wordIndex: Math.max(0, Number(p.wordIndex || 0) | 0),
        listenedSeconds: Math.max(0, Number(p.listenedSeconds || 0) | 0),
      };
      await db.insert(progress).values({ deviceId: device, lang, ...values })
        .onConflictDoUpdate({ target: [progress.deviceId, progress.lang], set: { ...values, updatedAt: new Date() } });
    }
  }

  let supabase = false;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    try {
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/nocta_devices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({ id: device, settings, synced_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      });
      // 401/403/404 gibi HTTP hataları başarılı yazma değildir.
      supabase = response.ok;
    } catch {
      supabase = false;
    }
  }

  return json({ ok: true, device, supabase, syncedAt: new Date().toISOString() });
}
