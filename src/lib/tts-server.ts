import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Sunucu tarafı ses üretimi.
 * Okunuşlar gerçek ses dosyası olarak üretilir; böylece tarayıcıda Web Audio
 * konvolüsyon yankısı + delay zincirinden geçirilebilir (speechSynthesis sesi
 * efekt zincirine bağlanamaz — bu yüzden kalitesiz ve kuru duyuluyordu).
 * Üretilen her satır diske yazılır: ikinci dinlemede ağ gerekmez.
 */

const CACHE_DIR = path.join(process.cwd(), ".cache", "tts");

export const TTS_LOCALE: Record<string, string> = {
  en: "en",
  fr: "fr",
  it: "it",
  es: "es",
  ru: "ru",
  ja: "ja",
  zh: "zh-CN",
  tr: "tr",
};

// Azure Speech yapılandırıldığında her dil için kendi doğal telaffuzu kullanılır.
const NEURAL_VOICES: Record<string, { locale: string; voice: string }> = {
  en: { locale: "en-US", voice: "en-US-JennyNeural" },
  ru: { locale: "ru-RU", voice: "ru-RU-SvetlanaNeural" },
  it: { locale: "it-IT", voice: "it-IT-ElsaNeural" },
  es: { locale: "es-ES", voice: "es-ES-ElviraNeural" },
  ja: { locale: "ja-JP", voice: "ja-JP-NanamiNeural" },
  zh: { locale: "zh-CN", voice: "zh-CN-XiaoxiaoNeural" },
  fr: { locale: "fr-FR", voice: "fr-FR-DeniseNeural" },
  tr: { locale: "tr-TR", voice: "tr-TR-EmelNeural" },
};

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function fetchNeuralVoice(text: string, lang: string): Promise<Buffer | null> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const voice = NEURAL_VOICES[lang];
  if (!key || !region || !voice || !/^[a-z0-9-]+$/i.test(region)) return null;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.locale}"><voice name="${voice.voice}">${escapeXml(text)}</voice></speak>`;
  try {
    const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-48khz-96kbitrate-mono-mp3",
        "User-Agent": "NOCTA/2.1",
      },
      body: ssml,
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;
    const audio = Buffer.from(await response.arrayBuffer());
    return audio.length > 512 ? audio : null;
  } catch {
    return null;
  }
}

function chunks(text: string, max = 180): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return [clean];
  const out: string[] = [];
  let cur = "";
  for (const piece of clean.split(/(?<=[\s.,;:!?。、！？])/)) {
    if ((cur + piece).length > max) {
      if (cur) out.push(cur.trim());
      cur = piece;
    } else cur += piece;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > max ? [c.slice(0, max), c.slice(max)] : [c]));
}

const AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

async function fetchChunk(text: string, locale: string, variant: number): Promise<Buffer | null> {
  const client = variant === 0 ? "tw-ob" : "gtx";
  const url =
    `https://translate.google.com/translate_tts?ie=UTF-8&client=${client}` +
    `&tl=${encodeURIComponent(locale)}&q=${encodeURIComponent(text)}&total=1&idx=0&textlen=${text.length}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": AGENTS[variant % AGENTS.length],
        Referer: "https://translate.google.com/",
        Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("audio") && !type.includes("mpeg")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 512 ? buf : null;
  } catch {
    return null;
  }
}

const memory = new Map<string, Buffer>();

export interface TtsResult {
  audio: Buffer;
  provider: string;
  cached: boolean;
}

async function cachedAudio(key: string): Promise<Buffer | null> {
  const hit = memory.get(key);
  if (hit) return hit;
  try {
    const disk = await readFile(path.join(CACHE_DIR, `${key}.mp3`));
    if (disk.length > 512) {
      memory.set(key, disk);
      return disk;
    }
  } catch {
    // Henüz oluşturulmamış.
  }
  return null;
}

function cacheAudio(key: string, audio: Buffer) {
  memory.set(key, audio);
  if (memory.size > 400) memory.delete(memory.keys().next().value as string);
  void mkdir(CACHE_DIR, { recursive: true })
    .then(() => writeFile(path.join(CACHE_DIR, `${key}.mp3`), audio))
    .catch(() => undefined);
}

export async function synthesize(text: string, lang: string): Promise<TtsResult | null> {
  const locale = TTS_LOCALE[lang] ?? "en";
  // İsteğe bağlı yüksek kaliteli Azure sesi; anahtarlar sadece sunucuda okunur.
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION && NEURAL_VOICES[lang]) {
    const neuralKey = createHash("sha1").update(`azure-v1|${lang}|${text}`).digest("hex");
    const hit = await cachedAudio(neuralKey);
    if (hit) return { audio: hit, provider: "azure-neural", cached: true };
    const neural = await fetchNeuralVoice(text, lang);
    if (neural) {
      cacheAudio(neuralKey, neural);
      return { audio: neural, provider: "azure-neural", cached: false };
    }
  }

  // Yapılandırma yoksa veya servis erişilemiyorsa mevcut dil sesine dön.
  const key = createHash("sha1").update(`${locale}|${text}`).digest("hex");
  const hit = await cachedAudio(key);
  if (hit) return { audio: hit, provider: "speech-web", cached: true };
  const parts: Buffer[] = [];
  for (const piece of chunks(text)) {
    let buf = await fetchChunk(piece, locale, 0);
    if (!buf) buf = await fetchChunk(piece, locale, 1);
    if (!buf) return null;
    parts.push(buf);
  }
  if (!parts.length) return null;
  const audio = Buffer.concat(parts);
  cacheAudio(key, audio);
  return { audio, provider: "speech-web", cached: false };
}
