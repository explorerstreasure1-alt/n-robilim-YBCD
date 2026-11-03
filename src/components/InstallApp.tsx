"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Download, Share, Smartphone, X, CheckCircle, Clock, Phone, ArrowUp } from "lucide-react";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "other";
const noSubscribe = () => () => {};
const isClient = () => true;
const isServer = () => false;
function standaloneSnapshot() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}
function subscribeStandalone(listener: () => void) {
  const display = window.matchMedia("(display-mode: standalone)");
  const add = display.addEventListener ?
    () => display.addEventListener("change", listener) :
    () => display.addListener?.(listener);
  const remove = display.removeEventListener ?
    () => display.removeEventListener("change", listener) :
    () => display.removeListener?.(listener);
  add();
  window.addEventListener("appinstalled", listener);
  return () => {
    remove();
    window.removeEventListener("appinstalled", listener);
  };
}
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : /Android/i.test(ua) ? "android" : "other";
}

/** Mobil-odaklı, görünür ve estetik bir PWA yükleme deneyimi. */
export default function InstallApp() {
  const deferred = useRef<InstallPrompt | null>(null);
  const mounted = useSyncExternalStore(noSubscribe, isClient, isServer);
  const standalone = useSyncExternalStore(subscribeStandalone, standaloneSnapshot, isServer);
  const platform = mounted ? detectPlatform() : "other";
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showBottomBar, setShowBottomBar] = useState(false);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      deferred.current = event as InstallPrompt;
      setReady(true);
      setShowBottomBar(true);
      // 5 saniye sonra alt barı gizle (kullanıcı tıklamazsa)
      const t = window.setTimeout(() => setShowBottomBar(false), 5000);
      return () => window.clearTimeout(t);
    };
    const appInstalled = () => {
      deferred.current = null;
      setReady(false);
      setInstalled(true);
      setOpen(false);
      setShowBottomBar(false);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const install = async () => {
    const prompt = deferred.current;
    if (!prompt) {
      setOpen(true);
      return;
    }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      deferred.current = null;
      setReady(false);
      setShowBottomBar(false);
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      setOpen(true);
    }
  };

  if (!mounted || installed || standalone || dismissed) return null;

  return (
    <>
      {/* ---------- mobil alt bar (tek tıkla yükle) ---------- */}
      {showBottomBar && (
        <div className="fixed left-0 right-0 bottom-0 z-[60] pointer-events-none md:hidden" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <div className="pointer-events-auto mx-4 mb-2 flex items-center gap-3 rounded-2xl border border-amber/50 bg-[#0d0b09]/90 backdrop-blur px-4 py-3 shadow-2xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber/40 bg-[#1a130c] text-amber">
              <Download className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="label text-bone">NOCTA&apos;YI YÜKLE</p>
              <p className="text-[11px] leading-tight text-dim">Ana ekranına ekle, uygulaması gibi aç.</p>
            </div>
            <button
              onClick={() => void install()}
              aria-label="Uygulamayı yükle"
              className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-amber text-amber hover:bg-amber hover:text-black transition-colors"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={1.6} />
            </button>
          </div>
        </div>
      )}

      {/* ---------- masaüstü / mobil kenar düğmesi ---------- */}
      {!showBottomBar && (
        <button type="button" onClick={() => void install()} aria-label="NOCTA uygulamasını yükle"
          className="fixed right-6 bottom-6 z-[50] flex h-11 w-11 items-center justify-center rounded-full border border-amber/40 bg-[#0d0b09]/80 backdrop-blur text-amber transition-colors hover:border-amber hover:bg-[#171109] shadow-lg md:hidden">
          <Download className="h-5 w-5" strokeWidth={1.6} />
          <span className="sr-only">YÜKLE</span>
        </button>
      )}

      {/* ---------- yükleme modalı ---------- */}
      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/85 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-[#30271c] bg-[#0d0b09]/90 backdrop-blur p-6 sm:rounded-2xl shadow-2xl"
            style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
            <div className="flex items-start justify-between gap-3 mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber/30 bg-[#1a130c] text-amber shadow-[0_0_20px_rgba(255,179,92,0.2)]">
                <Smartphone className="h-7 w-7" strokeWidth={1.5} />
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line/60 text-dim hover:text-bone hover:border-amber transition-colors">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            <p className="label text-amber mb-2">ANA EKRANINA EKLE</p>
            <h2 id="install-title" className="font-display text-[32px] leading-tight text-bone italic">NOCTA hep yanında.</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-dim">
              Telefonunun ana ekranına ekle; ayrı bir uygulama gibi, tarayıcı çubuğu olmadan aç.
            </p>

            <div className="mt-8 space-y-4">
              {platform === "ios" ? (
                <>
                  <Step n="01" label="Safari ile aç" desc="Bu sayfayı Safari tarayıcısıyla açın." />
                  <Step n="02" label="Paylaş" desc="Alttaki paylaş düğmesine dokunun." icon={<Share className="h-4 w-4" strokeWidth={1.5} />} />
                  <Step n="03" label="Ana Ekrana Ekle" desc="'Ana Ekrana Ekle' → 'Ekle' seçin." icon={<ArrowUp className="h-4 w-4" strokeWidth={1.5} />} />
                </>
              ) : platform === "android" ? (
                <>
                  <Step n="01" label="Chrome ile aç" desc="Bu sayfayı Chrome tarayıcısıyla açın." />
                  <Step n="02" label="Menü" desc="Sağ üstteki üç nokta menüsüne dokunun." icon={<Phone className="h-4 w-4" strokeWidth={1.5} />} />
                  <Step n="03" label="Uygulamayı Yükle" desc="'Uygulamayı yükle' veya 'Ana ekrana ekle' seçin." icon={<CheckCircle className="h-4 w-4" strokeWidth={1.5} />} />
                </>
              ) : (
                <>
                  <Step n="01" label="Tarayıcı" desc="Güncel bir tarayıcıda açın." />
                  <Step n="02" label="Yükle" desc="Adres çubuğundaki yükleme simgesini açın." icon={<Download className="h-4 w-4" strokeWidth={1.5} />} />
                  <Step n="03" label="Ekle" desc="'Uygulamayı yükle' / 'Ana ekrana ekle' seçin." icon={<Clock className="h-4 w-4" strokeWidth={1.5} />} />
                </>
              )}
            </div>

            <p className="mt-6 border-t border-line/50 pt-4 text-[11px] leading-relaxed text-dim2">
              Yükleme seçeneği tarayıcıya bağlıdır. Çevrimdışı kullanım için önce içeriği internetle açın.
            </p>

            <button type="button" onClick={() => setOpen(false)} className="label mt-6 w-full bg-amber text-black rounded-xl py-3 hover:opacity-90 transition-colors">
              ANLADIM
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Step({ n, label, desc, icon }: { n: string; label: string; desc: string; icon?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="num mt-1 text-[11px] text-amber">{n}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="label text-bone">{label}</span>
          {icon && <span className="text-amber/60">{icon}</span>}
        </div>
        <p className="text-[11px] leading-tight text-dim">{desc}</p>
      </div>
    </li>
  );
}
