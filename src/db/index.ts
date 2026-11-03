import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let databaseUrl = process.env.DATABASE_URL;
let internalPool: Pool | null = null;
let internalDb: ReturnType<typeof drizzle> | null = null;

function ensureDb() {
  if (internalDb) return { pool: internalPool!, db: internalDb };
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  internalPool = new Pool({ connectionString: databaseUrl });
  internalDb = drizzle(internalPool);
  return { pool: internalPool, db: internalDb };
}

/**
 * DATABASE_URL yoksa modül load edildiğinde çökmemesi için proxy.
 * Gerçek bir sorgu çalıştırıldığında veritabanı bağlantısı açılır.
 * Build sırasında import etmek güvenlidir.
 */
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    return ensureDb().pool[prop as keyof Pool];
  },
});

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return ensureDb().db[prop as keyof ReturnType<typeof drizzle>];
  },
});

export { ensureDb };
