import "dotenv/config";
import { seedAll } from "../src/lib/seed-core";
import { pool } from "../src/db";

seedAll(pool)
  .then((r) => {
    console.log(r.seeded ? `Seed tamamlandı: ${r.count} kayıt` : `Zaten dolu: ${r.count} kayıt`);
    return pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
