"use client";

import { useEffect, useState } from "react";
import { Headphones, Moon, Speaker, Sun, Volume2, Waves, Zap } from "lucide-react";
import { useStore } from "@/lib/store";
import { engine, pickDeviceVoice, TTS_LANG } from "@/lib/audio";
import { playLine } from "@/lib/voice";
import { LANGUAGES, LANG_BY_CODE, type LangCode } from "@/lib/languages";
import { useMicrophone } from "@/lib/microphone";
import MicrophoneControl from "./MicrophoneControl";

const SAMPLE: Record<string, string> = {
  en: "I rest my thoughts at the end of the day.",
  fr: "Je ferme les yeux au bout du soir.",
  it: "Ripeto le parole per imparare.",
  es: "Repito las palabras para hablar.",
  ru: "Я отдыхаю в конце дня.",
  ja: "私は一日の終わりに考えを休める。",
  zh: "我在一天结束时安抚我的思绪。",
};

export default function SettingsView({ active = true }: { active?: boolean }) {
  const { settings, patch, lang, setLang } = useStore();
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [ctxState, setCtxState] = useState("kapalı");
  const [deviceVoice, setDeviceVoice] = useState<string>("—");
  const [voiceNote, setVoiceNote] = useState("");
  const microphone = useMicrophone();

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      setLevel(engine.getLevel());
      setCtxState(engine.contextState);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  useEffect(() => {
    const read = () => {
      const v = pickDeviceVoice(TTS_LANG[lang] ?? "en-US");
      setDeviceVoice(v ? `${v.name} (${v.lang})` : "cihazda ses yok");
    };
    read();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.addEventListener?.("voiceschanged", read);
      return () => window.speechSynthesis.removeEventListener?.("voiceschanged", read);
    }
  }, [lang]);

  const preview = async () => {
    setVoiceNote("yükleniyor…");
    const used = await playLine({
      lang,
      text: SAMPLE[lang] ?? SAMPLE.en,
      source: settings.voiceSource,
      rate: settings.voiceRate,
      level: settings.voiceLevel,
    });
    setVoiceNote(
      used === "cloud"
        ? "işlenmiş ses · yankı aktif"
        : used === "unavailable"
          ? "Ses alınamadı. İnternet bağlantınızı kontrol edin."
          : "cihaz sesi · yankı ve 3D uygulanmaz",
    );
  };

  const modeHint =
    settings.sessionMode === "sleep"
      ? "Önce yalnız arka plan sesi (dinlenme), ardından dil tekrarı başlar"
      : "İlk 15 dk alfa dalgası, ardından okumalar başlar";

  return (
    <div className="scroll-thin h-full overflow-y-auto pb-6 px-4">
      <div className="pt-5 lg:hidden">
        <span className="label text-amber">AYARLAR</span>
        <h1 className="mt-2 font-display text-[30px] italic leading-none text-bone">Basit.</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-dim">
          Yatağınca geçtiğinde gece modunu seç, dinlenme süresini ayarla, yat.
        </p>
      </div>

      {/* MOD SEÇ */}
      <section className="rounded-2xl border border-line bg-[#0c0a08] p-4 mt-4">
        <div className="flex items-center gap-2 text-amber/80 mb-3">
          <Moon className="h-4 w-4" strokeWidth={1.5} />
          <h2 className="label text-bone">MOD SEÇ</h2>
        </div>
        <div className="grid grid-cols-2 gap-px">
          <button
            onClick={() => patch({ sessionMode: "sleep" })}
            className={`flex min-h-[84px] flex-col items-center justify-center gap-2 border transition-colors ${settings.sessionMode === "sleep" ? "border-amber bg-[#140f08] text-amber" : "border-line text-dim hover:text-bone"}`}
          >
            <Moon className="h-5 w-5" strokeWidth={1.6} />
            <span className="label font-semibold" style={{ color: "inherit" }}>GECE</span>
            <span className="label-sm mt-1 text-center">önce dinlen, sonra dil</span>
          </button>
          <button
            onClick={() => patch({ sessionMode: "morning" })}
            className={`flex min-h-[84px] flex-col items-center justify-center gap-2 border transition-colors ${settings.sessionMode === "morning" ? "border-amber bg-[#140f08] text-amber" : "border-line text-dim hover:text-bone"}`}
          >
            <Sun className="h-5 w-5" strokeWidth={1.6} />
            <span className="label font-semibold" style={{ color: "inherit" }}>SABAH</span>
            <span className="label-sm mt-1 text-center">alfa ile bilinç, sonra okuma</span>
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-dim2">{modeHint}</p>
      </section>

      {/* DINLENME SÜRESİ */}
      <section className="rounded-2xl border border-line bg-[#0c0a08] p-4 mt-4">
        <div className="flex items-center gap-2 text-amber/80 mb-3">
          <Volume2 className="h-4 w-4" strokeWidth={1.5} />
          <h2 className="label text-bone">DİNLENME SÜRESİ</h2>
        </div>
        <div className="grid grid-cols-3 gap-px">
          {[35, 40, 45].map((v) => (
            <button
              key={v}
              onClick={() => patch({ prepMinutes: v })}
              className={`label min-h-[56px] border transition-colors ${settings.prepMinutes === v ? "border-amber text-amber" : "border-line text-dim hover:text-bone"}`}
            >
              {v} DK
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-dim2">
          Bu süre boyunca yalnız yumuşak arka plan sesi çalar; dil seslendirmeleri sonra başlar.
        </p>
      </section>

      {/* SES TESTİ */}
      <section className="rounded-2xl border border-line bg-[#0c0a08] p-4 mt-4">
        <div className="flex items-center gap-2 text-amber/80 mb-3">
          <Waves className="h-4 w-4" strokeWidth={1.5} />
          <h2 className="label text-bone">SES TESTİ</h2>
        </div>
        <div className="mt-4 border border-line p-3">
          <div className="flex flex-wrap gap-px">
            <button
              onClick={async () => {
                setTesting(true);
                await engine.testTone();
                setTesting(false);
              }}
              disabled={testing}
              className="label flex min-h-[44px] flex-1 items-center justify-center gap-2 border border-amber text-amber transition-colors hover:bg-amber hover:text-black disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" strokeWidth={1.6} />
              {testing ? "SİNYAL…" : "SES TESTİ (3 SN)"}
            </button>
            <button
              onClick={preview}
              className="label flex min-h-[44px] flex-1 items-center justify-center gap-2 border border-line text-dim hover:border-amber hover:text-amber"
            >
              <Waves className="h-3.5 w-3.5" strokeWidth={1.6} />
              OKUNUŞU DİNLE
            </button>
          </div>
          {voiceNote && <p className="label-sm mt-2 text-amber">{voiceNote}</p>}
          <div className="mt-3 space-y-1">
            <KV k="SES MOTORU" v={ctxState === "running" ? "ÇALIŞIYOR" : ctxState.toUpperCase()} />
            <KV k="CİHAZ SESİ" v={deviceVoice} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-dim2">
            Ses duyulmuyorsa: sistem sesini aç, sekmeyi susturma, çıkışı hoparlör seç ve SES TESTİ'ne bas.
          </p>
        </div>
      </section>

      {/* DİL */}
      <section className="rounded-2xl border border-line bg-[#0c0a08] p-4 mt-4">
        <div className="flex items-center gap-2 text-amber/80 mb-3">
          <Headphones className="h-4 w-4" strokeWidth={1.5} />
          <h2 className="label text-bone">DİL</h2>
        </div>
        <div className="grid grid-cols-4 gap-px">
          {LANGUAGES.map((l) => {
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`label min-h-[52px] border px-2 py-2 transition-colors ${active ? "border-amber text-amber" : "border-line text-dim hover:text-bone"}`}
              >
                {l.code.toUpperCase()}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-dim2">
          Seçilen dilde kelime ve örnek cümleler oynatılır.
        </p>
      </section>

      <MicrophoneControl />

      {/* TEST MODU */}
      <section className="rounded-2xl border border-line bg-[#0c0a08] p-4 mt-4">
        <div className="flex items-center gap-2 text-amber/80 mb-3">
          <Zap className="h-4 w-4" strokeWidth={1.5} />
          <h2 className="label text-bone">TEST MODU</h2>
        </div>
        <label className="flex min-h-[48px] cursor-pointer items-center justify-between border-b border-line/60">
          <span className="label block">TEST MODU AÇIK</span>
          <input type="checkbox" checked={settings.testMode} onChange={(e) => patch({ testMode: e.target.checked })} className="h-5 w-5 accent-[#ffb35c]" />
        </label>
        <p className="mt-2 text-[11px] leading-relaxed text-dim2">
          Açıkken bekleme süresi sıfırlanır ve okumalar hemen başlar. Seans ekranında okunan kelime listesi görünür.
        </p>
      </section>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/60 pb-1.5">
      <span className="label-sm shrink-0">{k}</span>
      <span className="num truncate text-[11px] text-bone/80">{v}</span>
    </div>
  );
}
