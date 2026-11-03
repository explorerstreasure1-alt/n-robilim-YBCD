"use client";

import { useMemo, useState } from "react";
import { Beaker, Headphones, Play, Speaker, Volume2, Waves, Zap } from "lucide-react";
import { useStore } from "@/lib/store";
import { LANGUAGES } from "@/lib/languages";
import { playLine } from "@/lib/voice";
import { engine } from "@/lib/audio";

type Mode = "headphones" | "speaker";

interface Props {
  sourceText?: string;
  translationText?: string;
}

/**
 * Hızlı test laboratuvarı:
 * - 35/40/45 dk beklemeden alfa + okunuş örneğini anında duyar.
 * - Yabancı dil daha belirgin ve yankılı; Türkçe anlam daha kısık.
 */
export default function QuickAudioLab({ sourceText, translationText }: Props) {
  const { lang, setLang, settings } = useStore();
  const [mode, setMode] = useState<Mode>("headphones");
  const [busy, setBusy] = useState<"alpha" | "lang" | "meaning" | "simulate" | null>(null);
  const [note, setNote] = useState("");
  const source = sourceText || "Good evening. I am ready to learn.";
  const meaning = translationText || "İyi akşamlar. Öğrenmeye hazırım.";
  const label = useMemo(() => LANGUAGES.find((item) => item.code === lang)?.name ?? lang, [lang]);

  const prime = async () => {
    await engine.start({ carrier: 210, beat: 10, mode: mode === "headphones" ? "binaural" : "speaker" });
    engine.setReverb(Math.min(settings.reverb, 0.18));
    engine.setVolume(Math.min(settings.volume, mode === "headphones" ? 0.42 : 0.5));
  };

  const playAlpha = async () => {
    setBusy("alpha");
    setNote("Alfa başlangıcı çalıyor…");
    try {
      await prime();
      await engine.testTone();
      engine.stop(0.6);
      setNote(mode === "headphones"
        ? "Kulaklık: alfa başlangıcı yumuşak ve geniş stereo duyulmalı."
        : "Hoparlör: alfa başlangıcı yumuşak ve rahatsız etmeyen tek gövdeli ritim duyulmalı.");
    } finally {
      setBusy(null);
    }
  };

  const playForeign = async () => {
    setBusy("lang");
    setNote("Yabancı cümle hazırlanıyor…");
    try {
      await prime();
      engine.setSpatialDepth(mode === "headphones" ? 0.55 : 0);
      const result = await playLine({
        lang,
        text: source,
        source: "cloud",
        rate: settings.voiceRate,
        level: Math.min(1.05, settings.voiceLevel * 1.05),
      });
      setNote(result === "cloud"
        ? "Yabancı cümle: daha belirgin, hafif yankılı ve net gelmeli."
        : result === "unavailable"
          ? "İşlenmiş ses alınamadı; internet bağlantını kontrol et."
          : "Tarayıcı cihaz sesi ile okudu; yankı ve 3D daha zayıf olur.");
    } finally {
      setBusy(null);
    }
  };

  const playMeaning = async () => {
    setBusy("meaning");
    setNote("Türkçe anlam hazırlanıyor…");
    try {
      await prime();
      engine.setSpatialDepth(0);
      const result = await playLine({
        lang: "tr",
        text: meaning,
        source: "cloud",
        rate: Math.max(0.9, settings.voiceRate - 0.06),
        level: settings.voiceLevel * 0.42,
      });
      setNote(result === "cloud"
        ? "Türkçe anlam: daha kısık, daha sakin ve yabancı cümleden daha geri planda gelmeli."
        : "Türkçe anlam cihaz sesiyle okunuyor; seviye farkı daha az duyulabilir.");
    } finally {
      setBusy(null);
    }
  };

  const playChain = async () => {
    setBusy("lang");
    setNote("Sıralı test başlıyor…");
    try {
      await prime();
      engine.setReverb(Math.min(settings.reverb, 0.22));
      const foreign = await playLine({
        lang, text: source, source: "cloud", rate: settings.voiceRate,
        level: Math.min(1.05, settings.voiceLevel * 1.05),
      });
      if (foreign !== "cancelled") {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        await playLine({
          lang: "tr", text: meaning, source: "cloud",
          rate: Math.max(0.9, settings.voiceRate - 0.06),
          level: settings.voiceLevel * 0.42,
        });
      }
      setNote("Beklenen sıra: önce yabancı dil daha belirgin, sonra Türkçe anlam daha kısık.");
    } finally {
      setBusy(null);
    }
  };

  const simulateTransition = async (minutes: 35 | 40 | 45) => {
    setBusy("simulate");
    setNote(`${minutes} dakikalık geçişin sonunda duyacağın ses örneği başlıyor…`);
    try {
      await prime();
      engine.setBeat(10);
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      engine.schedulePhaseTransition(1.4);
      await new Promise((resolve) => window.setTimeout(resolve, 1600));
      await playChain();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-[#0c0a08] p-4">
      <div className="flex items-center gap-2 text-amber/90">
        <Beaker className="h-4 w-4" strokeWidth={1.5} />
        <h3 className="label text-bone">HIZLI SES TESTİ</h3>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-dim">
        35 / 40 / 45 dakika beklemeden alfa başlangıcını ve cümle okunuşlarını anında dinle.
      </p>
      <div className="mt-3 flex gap-px">
        <button type="button" onClick={() => setMode("headphones")}
          className={`flex min-h-[48px] flex-1 flex-col items-center justify-center border ${mode === "headphones" ? "border-amber bg-[#16100a] text-amber" : "border-line text-dim"}`}>
          <Headphones className="h-4 w-4" strokeWidth={1.5} />
          <span className="label mt-1" style={{ color: "inherit" }}>3D KULAKLIK</span>
        </button>
        <button type="button" onClick={() => setMode("speaker")}
          className={`flex min-h-[48px] flex-1 flex-col items-center justify-center border ${mode === "speaker" ? "border-amber bg-[#16100a] text-amber" : "border-line text-dim"}`}>
          <Speaker className="h-4 w-4" strokeWidth={1.5} />
          <span className="label mt-1" style={{ color: "inherit" }}>HOPARLÖR</span>
        </button>
      </div>
      <div className="scroll-thin mt-3 flex gap-px overflow-x-auto pb-1">
        {LANGUAGES.map((item) => (
          <button key={item.code} type="button" onClick={() => setLang(item.code)}
            className={`label min-h-[40px] shrink-0 border px-3 ${lang === item.code ? "border-amber text-amber" : "border-line text-dim"}`}>
            {item.code.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-px">
        <button type="button" onClick={() => void playAlpha()} disabled={busy !== null}
          className="label flex min-h-[46px] items-center justify-center gap-2 border border-line text-dim hover:text-amber disabled:opacity-50">
          <Zap className="h-4 w-4" strokeWidth={1.5} /> ALFA BAŞLANGIÇ
        </button>
        <button type="button" onClick={() => void playForeign()} disabled={busy !== null}
          className="label flex min-h-[46px] items-center justify-center gap-2 border border-line text-dim hover:text-amber disabled:opacity-50">
          <Waves className="h-4 w-4" strokeWidth={1.5} /> YABANCI CÜMLE
        </button>
        <button type="button" onClick={() => void playMeaning()} disabled={busy !== null}
          className="label flex min-h-[46px] items-center justify-center gap-2 border border-line text-dim hover:text-amber disabled:opacity-50">
          <Volume2 className="h-4 w-4" strokeWidth={1.5} /> TÜRKÇE ANLAM
        </button>
        <button type="button" onClick={() => void playChain()} disabled={busy !== null}
          className="label flex min-h-[46px] items-center justify-center gap-2 border border-amber text-amber hover:bg-amber hover:text-black disabled:opacity-50">
          <Play className="h-4 w-4" strokeWidth={1.5} /> SIRALI TEST
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-px">
        {[35, 40, 45].map((minutes) => (
          <button key={minutes} type="button" onClick={() => void simulateTransition(minutes as 35 | 40 | 45)} disabled={busy !== null}
            className="label flex min-h-[42px] items-center justify-center border border-line text-dim hover:text-amber disabled:opacity-50">
            {minutes} DK SONU
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-line bg-black/30 p-3 text-[12px] leading-relaxed text-dim">
        <p><span className="label text-bone">DİL</span> <span className="text-bone">{label}</span></p>
        <p className="mt-2"><span className="label text-bone">YABANCI</span> {source}</p>
        <p className="mt-1"><span className="label text-bone">TÜRKÇE</span> {meaning}</p>
        {note && <p className="mt-3 border-l-2 border-amber/60 pl-2 text-amber/90">{note}</p>}
      </div>
    </div>
  );
}
