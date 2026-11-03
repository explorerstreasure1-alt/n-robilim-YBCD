"use client";

import { AudioLines, Mic, MicOff } from "lucide-react";
import { microphone, useMicrophone } from "@/lib/microphone";

/** Açık izin + mikrofonla eşit kanal davranışı; kayıt/geri dinleme yok. */
export default function MicrophoneControl() {
  const state = useMicrophone();
  const active = state.status === "on";
  const pending = state.status === "requesting";
  return (
    <div className={`border p-3.5 transition-colors ${active ? "border-amber/45 bg-[#17110a]" : "border-line bg-[#0a0907]"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center border ${active ? "border-amber/45 text-amber" : "border-line text-dim"}`}>
          {active ? <Mic className="h-4 w-4" strokeWidth={1.6} /> : <MicOff className="h-4 w-4" strokeWidth={1.6} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label text-bone">MİKROFON</span>
            <span className={`num text-[10px] ${active ? "text-amber" : "text-dim2"}`}>
              {active ? "AÇIK · EŞİT SES" : pending ? "İZİN BEKLENİYOR" : "KAPALI"}
            </span>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-dim">
            {active
              ? "3D geçici kapalı; tüm ses iki kulağa eşit veriliyor."
              : "Açınca 3D geçici kapanır ve tüm ses iki kulağa eşit dağılır."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => active || pending ? microphone.close() : void microphone.open()}
          aria-pressed={active}
          className={`label min-h-[40px] shrink-0 border px-3 transition-colors ${active ? "border-amber text-amber" : "border-line2 text-dim hover:border-amber hover:text-amber"}`}
        >
          {active ? "KAPAT" : pending ? "İPTAL" : "AÇ"}
        </button>
      </div>
      {state.message && <p role="alert" className="mt-3 border-l-2 border-amber/70 pl-2 text-[11px] leading-relaxed text-amber">{state.message}</p>}
      <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-dim2">
        <AudioLines className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
        Mikrofon sesi kaydedilmez, gönderilmez veya hoparlöre verilmez. Sadece bu uygulamada açılan mikrofon algılanır.
      </p>
    </div>
  );
}
