"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Eye, Star, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { playLine } from "@/lib/voice";
import { saveNote } from "@/lib/offline-notes";

const FEELINGS = ["Huzurlu", "Taze", "Yoğun", "Dağınık", "Uykusuz"];

interface Card {
  wordId: number;
  text: string;
  translation: string;
  exampleSource?: string | null;
  exampleTranslationSource?: string | null;
}

export default function MorningNote({
  open,
  sessionId,
  onClose,
}: {
  open: boolean;
  sessionId: number | null;
  onClose: () => void;
}) {
  const { lang, deviceId, progress, favorites, toggleFavorite, settings } = useStore();
  const [step, setStep] = useState<0 | 1>(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [known, setKnown] = useState<number[]>([]);
  const [difficult, setDifficult] = useState<number[]>([]);
  const [rating, setRating] = useState(0);
  const [feeling, setFeeling] = useState("");
  const [recalled, setRecalled] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "server" | "local" | "error">("idle");

  useEffect(() => {
    if (!open) return;
    const index = progress[lang]?.blockIndex ?? 0;
    fetch(`/api/blocks?lang=${lang}&index=${index}`)
      .then((r) => r.json())
      .then((d) => {
        const lines: Card[] = (d.lines ?? []).map((l: Card) => ({
          wordId: l.wordId, text: l.text, translation: l.translation,
          exampleSource: l.exampleSource, exampleTranslationSource: l.exampleTranslationSource,
        }));
        setCards([0, 2, 4, 6].map((i) => lines[i]).filter(Boolean));
      })
      .catch(() => setCards([]));
  }, [open, lang, progress]);

  if (!open) return null;

  const mark = (card: Card, ok: boolean) => {
    setRevealed((r) => (r.includes(card.wordId) ? r : [...r, card.wordId]));
    if (ok) {
      setKnown((k) => [...k, card.wordId]);
    } else {
      setDifficult((items) => [...items, card.wordId]);
      if (!favorites.includes(card.wordId)) toggleFavorite(card.wordId, lang);
    }
  };

  const save = async () => {
    if (saveStatus === "saving" || saveStatus === "server" || saveStatus === "local") return;
    setSaveStatus("saving");
    const hardOnes = cards.filter((c) => difficult.includes(c.wordId));
    const summary = [
      recalled.trim(),
      cards.length ? `Hatırlama: ${known.length}/${cards.length}` : "",
      hardOnes.length ? `Zorlanan: ${hardOnes.map((c) => c.text).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const result = await saveNote({ deviceId, lang, rating, feeling, recalled: summary, sessionId });
    setSaveStatus(result);
    if (result !== "error") window.setTimeout(onClose, 1300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog" aria-modal="true" aria-label="Sabah notu"
        className="grain scroll-thin relative max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-line bg-panel sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Image src="/images/dawn-window.jpg" alt="" width={1200} height={400} unoptimized className="absolute inset-x-0 top-0 h-36 w-full object-cover opacity-35" />
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-transparent via-panel/70 to-panel" />

        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-line text-dim transition-colors hover:border-amber hover:text-amber"
          aria-label="Kapat"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <div className="relative p-4 md:p-6">
          <div className="flex items-center gap-2">
            <span className="label text-amber">SABAH · {step === 0 ? "1/2 HATIRLAMA" : "2/2 DEĞERLENDİRME"}</span>
          </div>

          {step === 0 ? (
            <>
              <h2 className="mt-3 font-display text-[clamp(1.6rem,5vw,2.2rem)] italic leading-tight text-bone">
                Bakmadan hatırla.
              </h2>
              <p className="mt-2 max-w-md text-[13px] leading-relaxed text-dim">
                Türkçesini gör, hedef dilde söyle, sonra çevirip kontrol et. Geri çağırma, tekrar dinlemekten
                daha güçlü pekiştirir. “Zor” dediklerin bu gece öne alınır.
              </p>

              <ul className="mt-5 space-y-px">
                {cards.map((c) => {
                  const shown = revealed.includes(c.wordId);
                  const ok = known.includes(c.wordId);
                  return (
                    <li key={c.wordId} className="border border-line p-3">
                      <p className="text-[13px] text-dim">{c.translation}</p>
                      {shown ? (
                        <>
                          <p className="mt-1.5 font-display text-[19px] italic leading-snug text-bone">{c.text}</p>
                          {c.exampleSource && <details className="mt-2 text-[10px] leading-relaxed text-dim2">
                            <summary className="cursor-pointer text-amber/80">Tatoeba · kaynak ve katkıda bulunanlar</summary>
                            <p className="mt-1 [overflow-wrap:anywhere]">{c.exampleSource}{c.exampleTranslationSource ? ` · ${c.exampleTranslationSource}` : ""}</p>
                          </details>}
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`label ${ok ? "text-amber" : "text-dim2"}`}>
                              {ok ? "HATIRLADIM" : difficult.includes(c.wordId) ? "ZOR KELİMEYE EKLENDİ" : "CEVAP GÖSTERİLDİ"}
                            </span>
                            <button
                              onClick={() =>
                                void playLine({
                                  lang,
                                  text: c.text,
                                  source: settings.voiceSource,
                                  rate: settings.voiceRate,
                                  level: settings.voiceLevel,
                                })
                              }
                              className="label ml-auto min-h-[34px] border border-line px-3 text-dim hover:border-amber hover:text-amber"
                            >
                              DİNLE
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="mt-2.5 flex gap-px">
                          <button
                            onClick={() => mark(c, true)}
                            className="label flex min-h-[42px] flex-1 items-center justify-center gap-1.5 border border-line text-dim transition-colors hover:border-amber hover:text-amber"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={1.6} /> HATIRLADIM
                          </button>
                          <button
                            onClick={() => mark(c, false)}
                            className="label flex min-h-[42px] flex-1 items-center justify-center gap-1.5 border border-line text-dim transition-colors hover:border-amber hover:text-amber"
                          >
                            <Star className="h-3.5 w-3.5" strokeWidth={1.6} /> ZOR
                          </button>
                          <button
                            onClick={() => setRevealed((r) => [...r, c.wordId])}
                            className="label flex min-h-[42px] items-center justify-center border border-line px-3 text-dim2 hover:text-dim"
                            aria-label="Cevabı göster"
                          >
                            <Eye className="h-3.5 w-3.5" strokeWidth={1.6} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
                {cards.length === 0 && (
                  <li className="border border-line p-4 text-[13px] text-dim2">
                    Bu dil için henüz blok yok — ilk seanstan sonra hatırlama kartları burada oluşur.
                  </li>
                )}
              </ul>

              <div className="mt-5 flex gap-px">
                <button
                  onClick={() => setStep(1)}
                  className="label min-h-[46px] flex-1 border border-amber bg-amber text-black transition-opacity hover:opacity-85"
                >
                  DEVAM · {known.length}/{cards.length || 0} HATIRLANDI
                </button>
                <button onClick={onClose} className="label min-h-[46px] border border-line px-5 text-dim hover:text-bone">
                  GEÇ
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-3 font-display text-[clamp(1.6rem,5vw,2.2rem)] italic leading-tight text-bone">
                Gece nasıldı?
              </h2>

              <div className="mt-5">
                <span className="label">UYKU KALİTESİ</span>
                <div className="mt-3 flex items-end gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRating(n)} className="group flex flex-col items-center gap-1.5" aria-label={`${n} puan`}>
                      <span
                        className={`w-9 border transition-all ${n <= rating ? "border-amber bg-amber" : "border-line group-hover:border-dim"}`}
                        style={{ height: 10 + n * 9 }}
                      />
                      <span className="label-sm">{n}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <span className="label">HİS</span>
                <div className="mt-2.5 flex flex-wrap gap-px">
                  {FEELINGS.map((f) => (
                    <button key={f} onClick={() => setFeeling(f)}
                      className={`label min-h-[40px] border px-3 transition-colors ${feeling === f ? "border-amber text-amber" : "border-line text-dim hover:text-bone"}`}>
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <span className="label">AKILDA KALANLAR</span>
                <textarea
                  value={recalled}
                  onChange={(e) => setRecalled(e.target.value)}
                  rows={3}
                  placeholder="kelime, cümle, rüya, his…"
                  className="mt-2.5 w-full resize-none border border-line bg-transparent p-3 text-[14px] text-bone placeholder:text-dim2 focus:border-amber focus:outline-none"
                />
              </div>

              {saveStatus === "error" && <p role="alert" className="mt-3 text-[12px] text-amber">Not kaydedilemedi. Cihazda depolama iznini kontrol edip tekrar dene.</p>}
              {saveStatus === "local" && <p role="status" className="mt-3 text-[12px] text-amber">Not cihazda saklandı; bağlantı gelince gönderilecek.</p>}
              <div className="mt-5 flex gap-px">
                <button onClick={save} disabled={saveStatus === "saving" || saveStatus === "server" || saveStatus === "local"}
                  className="label min-h-[46px] flex-1 border border-amber bg-amber text-black transition-opacity hover:opacity-85 disabled:opacity-70">
                  {saveStatus === "saving" ? "KAYDEDİLİYOR…" : saveStatus === "local" ? "CİHAZA KAYDEDİLDİ ✓" : saveStatus === "server" ? "KAYDEDİLDİ ✓" : "NOTU KAYDET"}
                </button>
                <button onClick={() => setStep(0)} className="label min-h-[46px] border border-line px-5 text-dim hover:text-bone">
                  GERİ
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
