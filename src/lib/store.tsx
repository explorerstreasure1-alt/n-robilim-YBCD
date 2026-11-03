"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LangCode } from "./languages";
import { flushPendingNotes } from "./offline-notes";

export interface Settings {
  reverb: number;
  volume: number;
  /** Uykuya geçiş fazı (dk): bu süre boyunca yalnız yoğun frekans, seslendirme yok */
  prepMinutes: number;
  /** Gece: hazırlık -> tekrar. Yoğun tekrar: anında alfa + tekrar. Sabah: alfa ile bilinç yükselişi. Akşam: bedeni uyutan, bilinci açık bırakan theta sınırı. Derin: delta ile derin uyku. Güçlü kısa uyku: 20 dk'lık delta pulsu. */
  sessionMode: "sleep" | "focus" | "morning" | "evening" | "deep" | "nap";
  timerMinutes: number;
  fadeMinutes: number;
  output: "auto" | "binaural" | "speaker";
  /** Hoparlörde daha belirgin nabız veya yumuşak modülasyon. */
  speakerStyle: "isochronic" | "monaural";
  sleepDetect: boolean;
  batterySaver: boolean;
  speak: boolean;
  /** cloud: sunucuda üretilen ses (yankı zincirinden geçer) · device: tarayıcı sesi */
  voiceSource: "cloud" | "device";
  voiceRate: number;
  voiceLevel: number;
  /** HRTF uzamsal ses derinliği (0–0.8). */
  spatialDepth: number;
  reminderAt: string;
}

const DEFAULTS: Settings = {
  reverb: 0.24,
  volume: 0.55,
  prepMinutes: 40,
  sessionMode: "sleep",
  timerMinutes: 0,
  fadeMinutes: 2,
  output: "auto",
  speakerStyle: "monaural",
  sleepDetect: false,
  batterySaver: true,
  speak: true,
  voiceSource: "cloud",
  voiceRate: 1,
  voiceLevel: 0.8,
  spatialDepth: 0.5,
  reminderAt: "23:15",
};

export interface ProgressEntry {
  blockIndex: number;
  listenedSeconds: number;
}

interface PendingFavorite {
  wordId: number;
  lang: string;
  active: boolean;
  revision: string;
}

interface StoreValue {
  deviceId: string;
  lang: LangCode;
  setLang: (l: LangCode) => void;
  settings: Settings;
  patch: (s: Partial<Settings>) => void;
  progress: Record<string, ProgressEntry>;
  setProgress: (lang: string, blockIndex: number, listenedSeconds?: number) => void;
  favorites: number[];
  toggleFavorite: (wordId: number, lang: string) => void;
  streak: { streak: number; longest: number };
  refreshStreak: () => Promise<void>;
  syncState: "idle" | "sending" | "ok" | "error";
  cloud: boolean;
  sync: () => void;
  boot: boolean;
}

const Ctx = createContext<StoreValue | null>(null);
const KEY = "nocta.v1";

interface Persisted {
  deviceId: string;
  lang: LangCode;
  settings: Settings;
  progress: Record<string, ProgressEntry>;
  favorites: number[];
  pendingFavorites?: Record<string, PendingFavorite>;
}

function load(): Partial<Persisted> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}") as Partial<Persisted>;
  } catch {
    return {};
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const saved = useRef<Persisted | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [lang, setLangState] = useState<LangCode>("en");
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [progress, setProgressState] = useState<Record<string, ProgressEntry>>({});
  const [favorites, setFavorites] = useState<number[]>([]);
  const [pendingFavorites, setPendingFavorites] = useState<Record<string, PendingFavorite>>({});
  const favoritesRef = useRef<number[]>([]);
  const pendingRef = useRef<Record<string, PendingFavorite>>({});
  const flushingFavoritesRef = useRef(false);
  const [streak, setStreak] = useState({ streak: 0, longest: 0 });
  const [syncState, setSyncState] = useState<StoreValue["syncState"]>("idle");
  const [cloud, setCloud] = useState(false);
  const [boot, setBoot] = useState(true);

  useEffect(() => {
    let alive = true;
    // Local storage is a browser-only external source; read it after hydration.
    const timer = window.setTimeout(() => {
      if (!alive) return;
      const s = load();
      saved.current = (s as Persisted) ?? null;
      let id = s.deviceId;
      if (!id) {
        id = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID() : `dev-${Math.random().toString(36).slice(2, 10)}`;
      }
      setDeviceId(id);
      if (s.lang) setLangState(s.lang);
      if (s.settings) {
        const merged = { ...DEFAULTS, ...s.settings };
        merged.voiceRate = Math.min(1.1, Math.max(0.85, Number(merged.voiceRate) || 1));
        setSettings(merged);
      }
      if (s.progress) setProgressState(s.progress);
      if (Array.isArray(s.favorites)) {
        favoritesRef.current = s.favorites.filter((value) => Number.isSafeInteger(value) && value > 0);
        setFavorites(favoritesRef.current);
      }
      if (s.pendingFavorites && typeof s.pendingFavorites === "object") {
        pendingRef.current = s.pendingFavorites;
        setPendingFavorites(s.pendingFavorites);
      }

      void (async () => {
        try {
          const response = await fetch(`/api/state?device=${encodeURIComponent(id)}`);
          if (!response.ok) throw new Error("state-unavailable");
          const data = await response.json();
          if (!alive) return;
          setCloud(Boolean(data.cloud));
          if (data.device_row?.streak) {
            setStreak({ streak: data.device_row.streak, longest: data.device_row.longestStreak ?? 0 });
          }
          if (Array.isArray(data.progress) && data.progress.length) {
            setProgressState((prev) => {
              const next = { ...prev };
              for (const p of data.progress) {
                const local = next[p.lang]?.blockIndex ?? 0;
                next[p.lang] = {
                  blockIndex: Math.max(local, p.blockIndex ?? 0),
                  listenedSeconds: Math.max(next[p.lang]?.listenedSeconds ?? 0, p.listenedSeconds ?? 0),
                };
              }
              return next;
            });
          }
          if (Array.isArray(data.favorites)) {
            setFavorites((prev) => {
              const merged = new Set<number>([...prev, ...data.favorites]);
              for (const change of Object.values(pendingRef.current)) {
                if (change.active) merged.add(change.wordId);
                else merged.delete(change.wordId);
              }
              const next = Array.from(merged);
              favoritesRef.current = next;
              return next;
            });
          }
        } catch { /* çevrimdışı: yerel durum yeterli */ }
        finally { if (alive) setBoot(false); }
      })();
    }, 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);

  const persist = useCallback(
    (patch: Partial<Persisted>) => {
      const current: Persisted = {
        ...(saved.current ?? {}),
        deviceId,
        lang,
        settings,
        progress,
        favorites,
        pendingFavorites,
        ...patch,
      };
      saved.current = current;
      try {
        window.localStorage.setItem(KEY, JSON.stringify(current));
      } catch {
        /* yoksay */
      }
    },
    [deviceId, lang, settings, progress, favorites, pendingFavorites],
  );

  const sync = useCallback(() => {
    if (!deviceId) return;
    setSyncState("sending");
    const payload = {
      deviceId,
      settings,
      progress: Object.entries(progress).map(([l, p]) => ({
        lang: l,
        blockIndex: p.blockIndex,
        listenedSeconds: p.listenedSeconds,
      })),
    };
    fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((d) => {
        setSyncState(d.ok ? "ok" : "error");
        if (typeof d.supabase === "boolean") setCloud(d.supabase);
        window.setTimeout(() => setSyncState("idle"), 2600);
      })
      .catch(() => {
        setSyncState("error");
        window.setTimeout(() => setSyncState("idle"), 2600);
      });
  }, [deviceId, settings, progress]);

  useEffect(() => {
    // Sunucu başlangıç durumu okunmadan boş yerel veriyle üzerine yazma.
    if (!deviceId || boot) return;
    persist({});
    const t = window.setTimeout(sync, 1200);
    return () => window.clearTimeout(t);
  }, [deviceId, boot, lang, settings, progress, favorites, pendingFavorites, persist, sync]);

  const setLang = useCallback((l: LangCode) => setLangState(l), []);

  const patch = useCallback((s: Partial<Settings>) => setSettings((p) => ({ ...p, ...s })), []);

  const setProgress = useCallback(
    (l: string, blockIndex: number, listenedSeconds = 0) => {
      setProgressState((prev) => ({
        ...prev,
        [l]: {
          blockIndex,
          listenedSeconds: Math.max(prev[l]?.listenedSeconds ?? 0, listenedSeconds),
        },
      }));
    },
    [],
  );

  const toggleFavorite = useCallback((wordId: number, l: string) => {
    const active = !favoritesRef.current.includes(wordId);
    const next = active ? [...favoritesRef.current, wordId] : favoritesRef.current.filter((id) => id !== wordId);
    favoritesRef.current = next;
    setFavorites(next);
    const revision = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const queue = { ...pendingRef.current, [wordId]: { wordId, lang: l, active, revision } };
    pendingRef.current = queue;
    setPendingFavorites(queue);
  }, []);

  const flushFavorites = useCallback(async () => {
    if (!deviceId || boot || flushingFavoritesRef.current || !navigator.onLine) return;
    flushingFavoritesRef.current = true;
    try {
      while (true) {
        const change = Object.values(pendingRef.current)[0];
        if (!change) break;
        let response: Response;
        try {
          response = await fetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-device-id": deviceId },
            body: JSON.stringify({ wordId: change.wordId, lang: change.lang, active: change.active }),
          });
        } catch { break; }
        if (!response.ok && response.status !== 400 && response.status !== 404) break;
        // Kullanıcı istek sürerken aynı kelimeyi tekrar değiştirdiyse yeni işlem sırada kalır.
        if (pendingRef.current[change.wordId]?.revision !== change.revision) continue;
        const queue = { ...pendingRef.current };
        delete queue[change.wordId];
        pendingRef.current = queue;
        setPendingFavorites(queue);
        if (!response.ok && change.active) {
          const valid = favoritesRef.current.filter((id) => id !== change.wordId);
          favoritesRef.current = valid;
          setFavorites(valid);
        }
      }
    } finally {
      flushingFavoritesRef.current = false;
    }
  }, [deviceId, boot]);

  const refreshStreak = useCallback(async () => {
    if (!deviceId) return;
    try {
      const response = await fetch(`/api/sessions?device=${encodeURIComponent(deviceId)}`);
      if (!response.ok) return;
      const data = await response.json();
      setStreak({ streak: data.device_row?.streak ?? 0, longest: data.device_row?.longestStreak ?? 0 });
    } catch { /* çevrimdışıyken mevcut görünüm korunur */ }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId || boot) return;
    void flushFavorites();
    void flushPendingNotes();
    const online = () => { sync(); void flushFavorites(); void flushPendingNotes(); };
    window.addEventListener("online", online);
    const retry = Object.keys(pendingFavorites).length ? window.setInterval(() => void flushFavorites(), 30000) : undefined;
    return () => {
      window.removeEventListener("online", online);
      if (retry !== undefined) window.clearInterval(retry);
    };
  }, [deviceId, boot, pendingFavorites, flushFavorites, sync]);

  const value = useMemo<StoreValue>(
    () => ({
      deviceId,
      lang,
      setLang,
      settings,
      patch,
      progress,
      setProgress,
      favorites,
      toggleFavorite,
      streak,
      refreshStreak,
      syncState,
      cloud,
      sync,
      boot,
    }),
    [deviceId, lang, setLang, settings, patch, progress, setProgress, favorites, toggleFavorite, streak, refreshStreak, syncState, cloud, sync, boot],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore, StoreProvider içinde kullanılmalı");
  return v;
}
