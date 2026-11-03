import { engine, speakDevice } from "./audio";

/**
 * Okunuş yöneticisi.
 * Satırlar /api/tts üzerinden gerçek ses dosyası olarak alınır, çözülür ve
 * motorun yankı/delay zincirinden geçirilerek çalınır. Ağ yoksa cihazın
 * konuşma sentezine düşer (o zaman yankı uygulanamaz, arayüzde belirtilir).
 */

const buffers = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();
let playbackSequence = 0;

const keyOf = (lang: string, text: string) => `${lang}|${text}`;

export function ttsUrl(lang: string, text: string) {
  return `/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`;
}

export function isCached(lang: string, text: string) {
  return buffers.has(keyOf(lang, text));
}

export function cachedCount() {
  return buffers.size;
}

export async function loadLine(lang: string, text: string): Promise<AudioBuffer | null> {
  const key = keyOf(lang, text);
  const hit = buffers.get(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    try {
      const res = await fetch(ttsUrl(lang, text));
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      if (data.byteLength < 512) return null;
      const buf = await engine.decode(data);
      buffers.set(key, buf);
      if (buffers.size > 240) buffers.delete(buffers.keys().next().value as string);
      return buf;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
}

/** Blok yüklenince 7 satırı önceden indir — gece boyunca takılma olmasın. */
export function prefetch(lang: string, texts: string[]) {
  texts.slice(0, 7).forEach((t, i) => {
    window.setTimeout(() => {
      if (!isCached(lang, t)) void loadLine(lang, t);
    }, i * 220);
  });
}

export interface PlayOpts {
  lang: string;
  text: string;
  source: "cloud" | "device";
  rate: number;
  level: number;
  delaySeconds?: number;
}

export type VoiceResult = "cloud" | "device" | "unavailable" | "cancelled" | "suppressed";

export async function playLine(opts: PlayOpts): Promise<VoiceResult> {
  const { lang, text, source, rate, level, delaySeconds = 0 } = opts;
  // Başlatılmış bir seansın ilk fazında hiçbir ekrandan dil sesi başlatılmaz.
  if (engine.isRunning && engine.currentPhase === "prep") return "suppressed";
  const sequence = ++playbackSequence;
  // Kulaklıkta ve mikrofon modunda sistem TTS sesi karışım zincirini atlar;
  // bu nedenle 3D veya eşit kanal garantisi için mutlaka ses dosyası gerekir.
  if (source === "cloud" || engine.requiresProcessedVoice()) {
    // Tıklama anında AudioContext'i açmak mobil tarayıcıların autoplay kuralı için önemlidir.
    const ready = engine.ensure().then(() => true).catch(() => false);
    const buf = await loadLine(lang, text);
    const audioReady = await ready;
    if (sequence !== playbackSequence) return "cancelled";
    if (buf && audioReady) {
      if (delaySeconds > 0 && engine.isRunning) {
        if (engine.scheduleVoice(buf, delaySeconds, rate, level)) return "cloud";
      }
      void engine.playVoice(buf, rate, level, () => sequence === playbackSequence);
      return "cloud";
    }
    if (engine.requiresProcessedVoice()) return "unavailable";
  }
  if (sequence !== playbackSequence) return "cancelled";
  speakDevice(text, lang, Math.min(1.1, rate), Math.min(1, level));
  return "device";
}

export function stopLine() {
  playbackSequence += 1;
  engine.stopVoice();
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
