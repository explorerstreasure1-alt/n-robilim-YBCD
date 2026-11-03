import { pool, db } from "../db";
import { words } from "../db/schema";
import { count, eq } from "drizzle-orm";
import { seedAll } from "./seed-core";

let seeding: Promise<{ seeded: boolean; count: number }> | null = null;

/** İlk istekte tablo boşsa paketleri doldurur. */
export async function ensureSeeded() {
  if (!seeding) {
    seeding = seedAll(pool).catch((e) => {
      seeding = null;
      throw e;
    });
  }
  return seeding;
}

export async function langCount(lang: string) {
  const rows = await db
    .select({ c: count() })
    .from(words)
    .where(eq(words.lang, lang));
  return rows[0]?.c ?? 0;
}

export function deviceFrom(req: Request, fallback = "local") {
  return req.headers.get("x-device-id")?.trim() || fallback;
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function bad(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}
