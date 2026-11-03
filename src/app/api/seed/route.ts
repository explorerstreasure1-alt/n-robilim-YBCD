import { pool } from "@/db";
import { json } from "@/lib/server";
import { seedAll } from "@/lib/seed-core";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await seedAll(pool);
    return json(res);
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
}
