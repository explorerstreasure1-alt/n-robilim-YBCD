"use client";

import { useEffect, useState } from "react";
import { Flame, Pause, Rows3, SlidersHorizontal, Sunrise, Waves } from "lucide-react";
import { useStore } from "@/lib/store";
import { LANG_BY_CODE, type LangCode } from "@/lib/languages";
import SessionView from "./SessionView";
import VocabView from "./VocabView";
import ProgressView from "./ProgressView";
import SettingsView from "./SettingsView";
import MorningNote from "./MorningNote";
import InstallApp from "./InstallApp";

export type Tab = "session" | "vocab" | "progress" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Waves }[] = [
  { id: "session", label: "GECE", icon: Waves },
  { id: "vocab", label: "KELİMELER", icon: Rows3 },
  { id: "progress", label: "İLERLEME", icon: Flame },
  { id: "settings", label: "AYARLAR", icon: SlidersHorizontal },
];

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M2.8 12c2.3 0 2.2-4.4 4.6-4.4S9.6 16.4 12 16.4s2.3-8.8 4.7-8.8 2.2 4.4 4.5 4.4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function useClock() {
  const [now, setNow] = useState("--:--");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const i = window.setInterval(tick, 15000);
    return () => window.clearInterval(i);
  }, []);
  return now;
}

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Shell() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>("session");
  const [status, setStatus] = useState<{ running: boolean; phase: "prep" | "sub"; elapsed: number; lang: LangCode }>({
    running: false,
    phase: "prep",
    elapsed: 0,
    lang: "en",
  });
  const [stopRequest, setStopRequest] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteSession, setNoteSession] = useState<number | null>(null);
  const clock = useClock();
  const meta = LANG_BY_CODE[status.running ? status.lang : store.lang];

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const urls = Array.from(document.querySelectorAll("script[src], link[rel='stylesheet']"))
          .map((element) => (element as HTMLScriptElement).src || (element as HTMLLinkElement).href)
          .filter(Boolean);
        registration.active?.postMessage({ type: "CACHE_ASSETS", urls });
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-bone">
      <div className="tex pointer-events-none fixed inset-0 z-0" />

      <div className="relative z-10 flex h-full">
        {/* ---------- masaüstü ray ---------- */}
        <nav className="hidden w-16 shrink-0 flex-col items-center justify-between border-r border-line py-4 md:flex">
          <div className="flex flex-col items-center gap-4">
            <Mark className="h-6 w-6 text-amber" />
            <div className="h-px w-6 bg-line" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-10">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="group flex items-center gap-2 focus:outline-none"
                  style={{ writingMode: "vertical-rl" }}
                  aria-current={active}
                >
                  <span className={`label transition-colors ${active ? "text-amber" : "text-dim2 group-hover:text-dim"}`}>
                    {t.label}
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full transition-all ${active ? "bg-amber" : "bg-line2"}`} />
                </button>
              );
            })}
          </div>
          <span className="label-sm" style={{ writingMode: "vertical-rl" }}>v2.0</span>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ---------- okuma şeridi ---------- */}
          <header
            className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-line px-3 md:gap-4 md:overflow-x-auto md:px-4"
            style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.25rem + env(safe-area-inset-top))" }}
          >
            <span className="flex shrink-0 items-center gap-2">
              <Mark className="h-5 w-5 text-amber md:hidden" />
              <span className="label text-bone">NOCTA</span>
            </span>
            <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 md:hidden">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.running ? "bg-amber pulse-amber" : "bg-line2"}`} />
              <span className="label-sm truncate">
                {tab !== "session" ? TABS.find((item) => item.id === tab)?.label : status.running ? (status.phase === "prep" ? "DİNLENME" : "DİL TEKRARI") : meta.name}
              </span>
            </span>
            <div className="hidden shrink-0 items-center gap-4 md:flex">
              <Readout k="SAAT" v={clock} />
              <Readout k="DİL" v={meta.name} />
              <Readout k="FAZ" v={status.running ? (status.phase === "prep" ? "1 · DİNLENME" : "2 · DİL TEKRARI") : "—"} accent={status.phase === "sub" && status.running} />
              <Readout k="SERİ" v={`${store.streak.streak} GECE`} />
            </div>
            <div className="hidden flex-1 md:block" />
            <InstallApp />
            <button onClick={() => setNoteOpen(true)} aria-label="Sabah notu"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 border border-line text-dim transition-colors hover:border-amber hover:text-amber md:px-2.5">
              <Sunrise className="h-4 w-4" strokeWidth={1.5} />
              <span className="label hidden md:inline">SABAH NOTU</span>
            </button>
          </header>

          {/* ---------- görünümler (seans arka planda çalışmaya devam etsin diye hepsi bağlı kalır) ---------- */}
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <div className={tab === "session" ? "h-full" : "hidden"}>
              <SessionView
                onStatus={setStatus}
                visible={tab === "session"}
                stopRequest={stopRequest}
                onSessionEnd={(id) => {
                  setNoteSession(id);
                  setNoteOpen(true);
                }}
              />
            </div>
            <div className={tab === "vocab" ? "h-full" : "hidden"}>
              <VocabView />
            </div>
            <div className={tab === "progress" ? "h-full" : "hidden"}>
              <ProgressView active={tab === "progress"} />
            </div>
            <div className={tab === "settings" ? "h-full" : "hidden"}>
              <SettingsView active={tab === "settings"} />
            </div>
          </main>

          {/* ---------- mini transport ---------- */}
          {status.running && tab !== "session" && (
            <div className="flex shrink-0 items-center gap-3 border-t border-amber/40 bg-[#120d07] px-3 py-2">
              <button onClick={() => setTab("session")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber pulse-amber" />
                <span className="min-w-0 flex-1">
                  <span className="label block text-amber">
                    {status.phase === "prep" ? "UYKUYA GEÇİŞ" : "DİL TEKRARI"}
                  </span>
                  <span className="num mt-0.5 block text-[12px] text-bone">
                    {mmss(status.elapsed)} · {meta.name}
                  </span>
                </span>
              </button>
              <button
                onClick={() => setStopRequest((n) => n + 1)}
                className="label flex min-h-[40px] shrink-0 items-center gap-1.5 border border-line px-3 text-dim hover:border-amber hover:text-amber"
              >
                <Pause className="h-3.5 w-3.5" strokeWidth={1.6} />
                BİTİR
              </button>
            </div>
          )}

          {/* ---------- mobil sekme çubuğu ---------- */}
          <nav
            className="flex shrink-0 items-stretch border-t border-line bg-[#080705] md:hidden"
            style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom))" }}
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-[62px] flex-1 flex-col items-center justify-center gap-1 ${
                    active ? "text-amber" : "text-dim2"
                  }`}
                >
                  <span className={`flex h-8 w-12 items-center justify-center rounded-full ${active ? "bg-[#21170d]" : ""}`}>
                    <Icon className="h-[19px] w-[19px]" strokeWidth={1.5} />
                  </span>
                  <span className="label-sm" style={{ color: "inherit" }}>{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {noteOpen && <MorningNote open sessionId={noteSession} onClose={() => setNoteOpen(false)} />}
    </div>
  );
}

function Readout({ k, v, accent = false }: { k: string; v: string; accent?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="label-sm">{k}</span>
      <span className={`num text-[11px] ${accent ? "text-amber" : "text-bone/80"}`}>{v}</span>
    </span>
  );
}
