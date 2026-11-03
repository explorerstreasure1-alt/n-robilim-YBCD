import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Dil paketleri: her dilde en az 6.000 sayı dışı kelime ve cümle. */
export const words = pgTable(
  "words",
  {
    id: serial("id").primaryKey(),
    lang: text("lang").notNull(),
    /** 0 = kafiyeli cümle, 1 = çekirdek kelime, 2 = sayı sözcüğü */
    tier: integer("tier").notNull().default(1),
    blockIndex: integer("block_index").notNull().default(0),
    lineIndex: integer("line_index").notNull().default(0),
    scheme: text("scheme"),
    text: text("text").notNull(),
    translation: text("translation").notNull(),
    rhyme: text("rhyme"),
    pos: text("pos"),
    /** Sıklık ve küratör örneklerine dayalı yaklaşık CEFR etiketi. */
    level: text("level"),
    /** Konu etiketleri otomatik tahmin de içerebilir. */
    topic: text("topic"),
  },
  // Tekrarlayan nakarat satırları (refrain) hariç: kelime/sayı kayıtları benzersizdir.
  (t) => [uniqueIndex("words_lang_tier_text_unique").on(t.lang, t.tier, t.text).where(sql`tier > 0`)],
);

/** Kullanıcı ilerlemesi — dil başına bağımsız blok/kelime sayacı. */
export const progress = pgTable(
  "progress",
  {
    id: serial("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    lang: text("lang").notNull(),
    blockIndex: integer("block_index").notNull().default(0),
    wordIndex: integer("word_index").notNull().default(0),
    listenedSeconds: integer("listened_seconds").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("progress_device_lang_unique").on(t.deviceId, t.lang)],
);

/** Gece oturum kayıtları. */
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  lang: text("lang").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  minutes: integer("minutes").notNull().default(0),
  mode: text("mode").notNull().default("binaural"),
  scheme: text("scheme"),
  blocks: integer("blocks").notNull().default(1),
});

/** Zor kelime havuzu. */
export const favorites = pgTable(
  "favorites",
  {
    id: serial("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    wordId: integer("word_id").notNull(),
    lang: text("lang").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("favorites_device_word_unique").on(t.deviceId, t.wordId)],
);

/** Sabah uyanış notları. */
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  /** Çevrimdışı tekrar gönderimde aynı notun iki kez yazılmasını önler. */
  clientKey: text("client_key"),
  lang: text("lang").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rating: integer("rating").notNull().default(0),
  recalled: text("recalled"),
  feeling: text("feeling"),
  sessionId: integer("session_id"),
}, (t) => [uniqueIndex("notes_device_client_unique").on(t.deviceId, t.clientKey)]);

/** Cihaz ayarları + streak durumu. */
export const devices = pgTable("devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("device"),
  streak: integer("streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastNight: text("last_night"),
  reminderAt: text("reminder_at").default("23:15"),
  settings: jsonb("settings").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
