"use client";

import { useEffect, useState } from "react";
import { Headphones, Radio, Speaker, Volume2, Waves, Zap } from "lucide-react";
import { useStore } from "@/lib/store";
import { engine, pickDeviceVoice, TTS_LANG } from "@/lib/audio";
import { playLine } from "@/lib/voice";
import { LANG_BY_CODE } from "@/lib/languages";
import { useMicrophone } from "@/lib/microphone";
import MicrophoneControl from "./MicrophoneControl";

const SAMPLE: Record<string, string> = {
  en: "I rest my thoughts at the end of the day.",
  fr: "Je ferme les yeux au bout du soir.",
  it: "Ripeto le parole per imparare.",
  es: "Repito las palabras para hablar.",
  ru: "Ğ¯ ÑƒÑ‡Ñƒ ÑĞ»Ğ¾Ğ²Ğ°, Ñ‡Ñ‚Ğ¾Ğ±Ñ‹ Ğ¸Ñ… Ğ·Ğ½Ğ°Ñ‚ÑŒ.",
  ja: "è¨€è‘‰ã¯å¤œã«æµã‚Œã¾ã™ã€‚",
  zh: "è¯å¥åœ¨å¤œé‡Œè½»è½»åœ°æ¥äº†ã€‚",
};

export default function SettingsView({ active = true }: { active?: boolean }) {
  const { settings, patch, sync, syncState, cloud, deviceId, lang } = useStore();
  const [busy, setBusy] = useState(false);
  const [seedInfo, setSeedInfo] = useState("");
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [ctxState, setCtxState] = useState("kapalÄ±");
  const [deviceVoice, setDeviceVoice] = useState<string>("â€”");
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

  const checkPackets = async () => {
    setBusy(true);
    try {
      const d = await fetch("/api/seed").then((r) => r.json());
      setSeedInfo(
        d.seeded
          ? `${d.count.toLocaleString("tr-TR")} kayÄ±t yazÄ±ldÄ±`
          : `Paketler yerinde: ${d.count?.toLocaleString("tr-TR") ?? "â€”"} kayÄ±t`,
      );
    } catch {
      setSeedInfo("Paket durumu alÄ±namadÄ±");
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setVoiceNote("yÃ¼kleniyorâ€¦");
    const used = await playLine({
      lang,
      text: SAMPLE[lang] ?? SAMPLE.en,
      source: settings.voiceSource,
      rate: settings.voiceRate,
      level: settings.voiceLevel,
    });
    if (used === "cancelled") return;
    setVoiceNote(
      used === "cloud"
        ? microphone.status === "on" ? "iÅŸlenmiÅŸ ses Â· iki kulaÄŸa eÅŸit" : "iÅŸlenmiÅŸ ses Â· hafif yankÄ± aktif"
        : used === "unavailable"
          ? "Ses alÄ±namadÄ±. Ä°nternet baÄŸlantÄ±sÄ±nÄ± kontrol et."
          : used === "suppressed"
            ? "HazÄ±rlÄ±k fazÄ±nda konuÅŸma kapalÄ±. Seans baÅŸlamadan veya dil fazÄ±nda dinleyebilirsin."
            : "cihaz sesi Â· yankÄ± ve 3D uygulanmaz",
    );
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto pb-6">
      <div className="px-4 pb-1 pt-5 lg:hidden">
        <span className="label text-amber">KÄ°ÅÄ°SELLEÅTÄ°R</span>
        <h1 className="mt-2 font-display text-[30px] italic leading-none text-bone">AyarlarÄ±n.</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-dim">Sesini ve gece rutinini kendine gÃ¶re ayarla.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 px-3 pt-3 lg:grid-cols-2 lg:gap-0 lg:p-0">
        {/* SES TANI */}
        <section className="rounded-2xl border border-line bg-[#0c0a08] p-4 lg:rounded-none lg:border-0 lg:border-b lg:border-r lg:bg-transparent lg:p-6">
          <div className="flex items-center gap-2 text-amber/80">
            <Volume2 className="h-4 w-4" strokeWidth={1.5} />
            <h2 className="label text-bone">SES TANI VE Ã‡IKIÅ</h2>
          </div>

          <div className="mt-4 border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="label">Ã‡IKIÅ SEVÄ°YESÄ°</span>
              <span className="num text-[11px] text-amber">{Math.round(level * 100)}%</span>
            </div>
            <div className="mt-2 flex h-8 items-end gap-[3px]">
              {Array.from({ length: 28 }).map((_, i) => (
                <span
                  key={i}
                  className={`flex-1 transition-all duration-100 ${level * 28 > i ? "bg-amber" : "bg-line2"}`}
                  style={{ height: `${18 + (i % 7) * 11}%` }}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-px">
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
                {testing ? "SÄ°NYAL Ã‡ALIYORâ€¦" : "SES TESTÄ° (3 SN)"}
              </button>
              <button
                onClick={preview}
                className="label flex min-h-[44px] flex-1 items-center justify-center gap-2 border border-line text-dim hover:border-amber hover:text-amber"
              >
                <Waves className="h-3.5 w-3.5" strokeWidth={1.6} />
                OKUNUÅU DÄ°NLE
              </button>
            </div>
            {voiceNote && <p className="label-sm mt-2 text-amber">{voiceNote}</p>}
            <div className="mt-3 space-y-1.5">
              <KV k="SES MOTORU" v={ctxState === "running" ? "Ã‡ALIÅIYOR" : ctxState.toUpperCase()} />
              <KV k="CÄ°HAZ SESÄ°" v={deviceVoice} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-dim2">
              Ses duyulmuyorsa: sistem sesini aÃ§, sekmenin sesini kapatmadÄ±ÄŸÄ±ndan emin ol, Ã§Ä±kÄ±ÅŸÄ± HOPARLÃ–R
              seÃ§ ve SES TESTÄ°â€™ne bas. Test sÄ±rasÄ±nda seviye Ã§ubuklarÄ± hareket ediyorsa motor Ã§alÄ±ÅŸÄ±yordur.
            </p>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <span className="label">Ã‡IKIÅ MODU</span>
              <div className="mt-2 grid grid-cols-3 gap-px">
                {([
                  { id: "auto", label: "OTO", icon: Radio },
                  { id: "binaural", label: "3D KULAKLIK", icon: Headphones },
                  { id: "speaker", label: "HOPARLÃ–R", icon: Speaker },
                ] as const).map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => patch({ output: m.id })}
                      className={`flex min-h-[58px] flex-col items-center justify-center gap-1.5 border transition-colors ${
                        settings.output === m.id ? "border-amber bg-[#140f08] text-amber" : "border-line text-dim hover:text-bone"
                      }`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.5} />
                      <span className="label" style={{ color: "inherit" }}>{m.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-dim2">
                KulaklÄ±kta konuÅŸma ve ortam HRTF ile hafifÃ§e uzamsallaÅŸtÄ±rÄ±lÄ±r. Otomatik algÄ±lama
                cihaz ve tarayÄ±cÄ±ya baÄŸlÄ±dÄ±r; gerekirse 3D KULAKLIKâ€™Ä± elle seÃ§.
              </p>
            </div>

            <MicrophoneControl />

            <Row label="3D DERÄ°NLÄ°K" value={`${Math.round(settings.spatialDepth * 100)}%`}>
              <input type="range" min={0} max={0.8} step={0.01} value={settings.spatialDepth}
                onChange={(e) => patch({ spatialDepth: Number(e.target.value) })} aria-label="3D derinlik" />
            </Row>
            <Row label="SEVÄ°YE" value={`${Math.round(settings.volume * 100)}%`}>
              <input type="range" min={0.05} max={1} step={0.01} value={settings.volume}
                onChange={(e) => patch({ volume: Number(e.target.value) })} aria-label="Seviye" />
            </Row>
            <Row label="YANKI (REVERB + DELAY)" value={`${Math.round(settings.reverb * 100)}%`}>
              <input type="range" min={0} max={0.9} step={0.01} value={settings.reverb}
                onChange={(e) => patch({ reverb: Number(e.target.value) })} aria-label="YankÄ±" />
            </Row>
            <Row label="FADE-OUT SÃœRESÄ°" value={`${settings.fadeMinutes} DK`}>
              <input type="range" min={1} max={5} step={1} value={settings.fadeMinutes}
                onChange={(e) => patch({ fadeMinutes: Number(e.target.value) })} aria-label="Fade sÃ¼resi" />
            </Row>
          </div>
        </section>

        {/* OKUNUÅ */}
        <section className="rounded-2xl border border-line bg-[#0c0a08] p-4 lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent lg:p-6">
          <div className="flex items-center gap-2 text-amber/80">
            <Waves className="h-4 w-4" strokeWidth={1.5} />
            <h2 className="label text-bone">DÄ°L SESLENDÄ°RME</h2>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-px">
            {([
              { id: "cloud", label: "STÃœDYO SESÄ°", hint: "yankÄ± + delay" },
              { id: "device", label: "CÄ°HAZ SESÄ°", hint: "efektsiz yedek" },
            ] as const).map((v) => (
              <button
                key={v.id}
                onClick={() => patch({ voiceSource: v.id })}
                className={`flex min-h-[62px] flex-col items-center justify-center border transition-colors ${
                  settings.voiceSource === v.id ? "border-amber bg-[#140f08] text-amber" : "border-line text-dim hover:text-bone"
                }`}
              >
                <span className="label" style={{ color: "inherit" }}>{v.label}</span>
                <span className="label-sm mt-1">{v.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-dim2">
            Ä°ÅŸlenmiÅŸ ses kÄ±sa bir oda yankÄ±sÄ±, yumuÅŸak dengeleme ve kulaklÄ±kta 3D konum kullanÄ±r.
            Cihaz sesi tarayÄ±cÄ±nÄ±n yedeÄŸidir ve efektlerden geÃ§mez. 3D veya eÅŸit kanal gerektiÄŸinde
            otomatik olarak iÅŸlenmiÅŸ ses kullanÄ±lÄ±r; alÄ±namazsa durum bildirilir.
          </p>

          <div className="mt-5 space-y-5">
            <Row label="OKUMA HIZI" value={`${settings.voiceRate.toFixed(2)}Ã—`}>
              <input type="range" min={0.85} max={1.1} step={0.01} value={settings.voiceRate}
                onChange={(e) => patch({ voiceRate: Number(e.target.value) })} aria-label="Okuma hÄ±zÄ±" />
            </Row>
            <Row label="OKUMA SEVÄ°YESÄ°" value={`${Math.round(settings.voiceLevel * 100)}%`}>
              <input type="range" min={0.2} max={1.4} step={0.01} value={settings.voiceLevel}
                onChange={(e) => patch({ voiceLevel: Number(e.target.value) })} aria-label="Okuma seviyesi" />
            </Row>
          </div>

          <div className="mt-6 space-y-5 border-t border-line pt-5">
            <span className="label text-bone">OTURUM TÃœRÃœ</span>
            <div className="grid grid-cols-2 gap-px">
              {([
                { id: "sleep", label: "GECE", hint: "Ã¶nce dinlen" },
                { id: "focus", label: "YOÄUN TEKRAR", hint: "anÄ±nda alfa + okuma" },
              ] as const).map((mode) => (
                <button key={mode.id} onClick={() => patch({ sessionMode: mode.id })}
                  className={`flex min-h-[60px] flex-col items-center justify-center border ${settings.sessionMode === mode.id ? "border-amber bg-[#140f08] text-amber" : "border-line text-dim hover:text-bone"}`}>
                  <span className="label" style={{ color: "inherit" }}>{mode.label}</span>
                  <span className="label-sm mt-1">{mode.hint}</span>
                </button>
              ))}
            </div>
            <span className="label text-bone">GECE DÃœZENÄ°</span>
            <div>
              <span className="label">UYKUYA GEÃ‡Ä°Å FAZI</span>
              <div className="mt-2 grid grid-cols-3 gap-px">
                {[35, 40, 45].map((v) => (
                  <button key={v} onClick={() => patch({ prepMinutes: v })}
                    className={`label min-h-[44px] border transition-colors ${settings.prepMinutes === v ? "border-amber text-amber" : "border-line text-dim hover:text-bone"}`}>
                    {v} DK
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-dim2">
                Bu sÃ¼re boyunca yalnÄ±zca yumuÅŸak arka plan sesi Ã§alar; dil seslendirmeleri sonra baÅŸlar.
              </p>
            </div>
            <div>
              <span className="label">ZAMANLAYICI</span>
              <div className="mt-2 flex flex-wrap gap-px">
                {[0, 30, 90, 120, 240].map((v) => (
                  <button key={v} onClick={() => patch({ timerMinutes: v })}
                    className={`label min-h-[42px] border px-3 transition-colors ${settings.timerMinutes === v ? "border-amber text-amber" : "border-line text-dim hover:text-bone"}`}>
                    {v === 0 ? "SABAHA KADAR" : `${v} DK`}
                  </button>
                ))}
              </div>
            </div>
            <Toggle label="HAREKETE GÃ–RE SESÄ° KIS" hint="Ä°steÄŸe baÄŸlÄ±: cihaz hareketsiz kalÄ±rsa dil fazÄ±nda ses azalÄ±r. Bu, uyku evresini Ã¶lÃ§mez."
              value={settings.sleepDetect} onChange={(v) => patch({ sleepDetect: v })} />
            <Toggle label="PÄ°L Ä°YÄ°LEÅTÄ°RME" hint="GÃ¶rsel animasyonlarÄ± azaltÄ±r; ekranÄ± normal ÅŸekilde kapatabilirsin."
              value={settings.batterySaver} onChange={(v) => patch({ batterySaver: v })} />
            <Toggle label="OKUNUÅ AÃ‡IK" hint="KapalÄ±yken yalnÄ±z frekans akar; aÃ§Ä±kken okunuÅŸlar geÃ§iÅŸ fazÄ±ndan sonra baÅŸlar."
              value={settings.speak} onChange={(v) => patch({ speak: v })} />
            <div>
              <span className="label">GÃœNLÃœK HATIRLATICI</span>
              <div className="mt-2 flex items-center gap-3">
                <input type="time" value={settings.reminderAt} onChange={(e) => patch({ reminderAt: e.target.value })}
                  className="num min-h-[44px] border border-line bg-transparent px-3 text-[14px] text-bone focus:border-amber focus:outline-none" />
                <span className="text-[12px] text-dim2">her gece nazik bildirim</span>
              </div>
            </div>
          </div>
        </section>

        {/* VERÄ° */}
        <section className="rounded-2xl border border-line bg-[#0c0a08] p-4 lg:rounded-none lg:border-0 lg:border-b lg:border-r lg:bg-transparent lg:p-6">
          <span className="label text-bone">VERÄ° VE SENKRON</span>
          <div className="mt-4 space-y-2.5">
            <KV k="CÄ°HAZ ANAHTARI" v={deviceId.slice(0, 18) || "â€”"} />
            <KV k="BULUT" v={cloud ? "SUPABASE ETKÄ°N" : "YEREL POSTGRESQL"} />
            <KV k="DURUM" v={syncState === "sending" ? "GÃ–NDERÄ°LÄ°YOR" : syncState === "ok" ? "GÃœNCEL" : syncState === "error" ? "HATA" : "HAZIR"} />
            <KV k="PAKET" v="7 DÄ°L Â· A1â€“C1" />
            <KV k="DÄ°L BAÅINA" v="6.000+ KELÄ°ME VE CÃœMLE" />
            <KV k="AKTÄ°F DÄ°L" v={LANG_BY_CODE[lang].name.toUpperCase()} />
            <div className="flex gap-px pt-2">
              <button onClick={sync} className="label min-h-[44px] flex-1 border border-line text-dim hover:border-amber hover:text-amber">
                SENKRONLA
              </button>
              <button onClick={checkPackets} disabled={busy}
                className="label min-h-[44px] flex-1 border border-line text-dim hover:border-amber hover:text-amber disabled:opacity-40">
                {busy ? "KONTROLâ€¦" : "PAKETLERÄ° DOÄRULA"}
              </button>
            </div>
            {seedInfo && <p className="label-sm text-amber">{seedInfo}</p>}
            <p className="text-[11px] leading-relaxed text-dim2">
              Frekanslar cihazda Ã¼retilir. Daha Ã¶nce aÃ§tÄ±ÄŸÄ±n bloklar ve indirilen sesler Ã§evrimdÄ±ÅŸÄ± kullanÄ±labilir;
              henÃ¼z aÃ§Ä±lmamÄ±ÅŸ iÃ§erikler internet gerektirebilir.
            </p>
          </div>
        </section>

        {/* FREKANS ÅEMASI */}
        <section className="rounded-2xl border border-line bg-[#0c0a08] p-4 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-6">
          <span className="label text-bone">GECE PROTOKOLÃœ</span>
          <div className="mt-4 space-y-px">
            <PhaseCard
              title={`1 Â· UYKUYA GEÃ‡Ä°Å  Â·  0â€“${settings.prepMinutes} DK`}
              lines={[
                "10 Hz'den 2.5 Hz'e yumuÅŸak frekans geÃ§iÅŸi",
                "SeÃ§tiÄŸin sÃ¼re boyunca konuÅŸma yok Â· hafif arka plan sesi",
                "Uygulama beyin dalgasÄ±nÄ± veya uyku evresini Ã¶lÃ§mez", 
              ]}
            />
            <PhaseCard
              title={`2 Â· DÄ°L TEKRARI  Â·  ${settings.prepMinutes}+ DK`}
              lines={[
                "Arka plan seviyesi dÃ¼ÅŸer Â· sakin seslendirme baÅŸlar",
                "OkunuÅŸlar dÃ¼zenli aralÄ±klarla planlanÄ±r",
                "AralÄ±k 10â†’16â†’26â†’40â†’56 sn Â· tek geÃ§iÅŸler Ã¶nceki blok tekrarÄ±",
                "Zor kelimeler 3. ve 6. sÄ±raya serpiÅŸtirilir",
              ]}
            />
            <PhaseCard
              title="KAPANIÅ"
              lines={[`YavaÅŸÃ§a kÄ±sÄ±lma Â· ${settings.fadeMinutes} dk`, "Ses seÃ§ilen bitiÅŸe doÄŸru azalÄ±r"]}
            />
          </div>

          <div className="mt-5">
            <span className="label">HOPARLÃ–R DALGA BÄ°Ã‡Ä°MÄ°</span>
            <div className="mt-2 grid grid-cols-2 gap-px">
              {([
                { id: "isochronic", label: "NABIZ", hint: "isokronik Â· belirgin ritim" },
                { id: "monaural", label: "YUMUÅAK", hint: "monaural Â· daha sakin" },
              ] as const).map((s) => (
                <button
                  key={s.id}
                  onClick={() => patch({ speakerStyle: s.id })}
                  className={`flex min-h-[58px] flex-col items-center justify-center border px-2 transition-colors ${
                    settings.speakerStyle === s.id ? "border-amber bg-[#140f08] text-amber" : "border-line text-dim hover:text-bone"
                  }`}
                >
                  <span className="label" style={{ color: "inherit" }}>{s.label}</span>
                  <span className="label-sm mt-1 text-center">{s.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-dim2">
              HoparlÃ¶rde ritim, yumuÅŸak ses seviyesi deÄŸiÅŸimiyle oluÅŸturulur. RahatlÄ±k iÃ§in YUMUÅAK
              modunu seÃ§ebilir ve cihazÄ±n sesini dÃ¼ÅŸÃ¼k tutabilirsin.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function PhaseCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="border border-line p-3">
      <div className="label text-amber">{title}</div>
      <ul className="mt-2 space-y-1">
        {lines.map((l) => (
          <li key={l} className="flex gap-2 text-[12px] leading-relaxed text-dim">
            <span className="mt-[7px] h-1 w-1 shrink-0 bg-line2" />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="num text-[11px] text-amber">{value}</span>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label, hint, value, onChange,
}: {
  label: string; hint: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-[48px] cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="label block">{label}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-dim2">{hint}</span>
      </span>
      <span className={`mt-1 flex h-6 w-11 shrink-0 items-center border px-[3px] transition-colors ${value ? "border-amber" : "border-line"}`}>
        <span className={`h-4 w-4 transition-transform ${value ? "translate-x-5 bg-amber" : "bg-line2"}`} />
      </span>
      <input type="checkbox" className="sr-only" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
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

