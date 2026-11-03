"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { LANGUAGES } from "@/lib/languages";
import { NOTES_CHANGED, pendingNotes } from "@/lib/offline-notes";

interface SessionRow {
  id: number;
  lang: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  mode: string;
  scheme: string | null;
  blocks: number;
}
interface NoteRow {
  id: number | string;
  lang: string;
  createdAt: string;
  rating: number;
  recalled: string | null;
  feeling: string | null;
  pending?: boolean;
}
interface ProgressRow {
  lang: string;
  blockIndex: number;
  listenedSeconds: number;
}

const TOTAL_BLOCKS = 858; // Alt sınır; gerçek blok sayısı API'den alınır.

export default function ProgressView({ active = true }: { active?: boolean }) {
  const { deviceId, sync, syncState, cloud, streak, progress: localProgress } = useStore();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [prog, setProg] = useState<ProgressRow[]>([]);
  const [blockTotals, setBlockTotals] = useState<Record<string, number>>({});

  const q = `device=${encodeURIComponent(deviceId)}`;
  const refreshNotes = useCallback(() => {
    const local: NoteRow[] = pendingNotes(deviceId).map((note) => ({
      id: note.clientKey, lang: note.lang, createdAt: note.createdAt, rating: note.rating,
      recalled: note.recalled, feeling: note.feeling, pending: true,
    }));
    fetch(`/api/notes?${q}`).then((r) => {
      if (!r.ok) throw new Error("offline");
      return r.json();
    }).then((d) => setNotes([...local, ...(Array.isArray(d.items) ? d.items : [])]))
      .catch(() => setNotes(local));
  }, [deviceId, q]);

  useEffect(() => {
    if (!deviceId) return;
    fetch(`/api/sessions?${q}`).then((r) => r.json()).then((d) => setSessions(d.sessions ?? [])).catch(() => undefined);
    refreshNotes();
    window.addEventListener(NOTES_CHANGED, refreshNotes);
    fetch(`/api/progress?${q}`).then((r) => r.json()).then((d) => setProg(d.items ?? [])).catch(() => undefined);
    if (active) Promise.all(LANGUAGES.map(async (l) => {
      const data = await fetch(`/api/blocks?lang=${l.code}&index=0`).then((r) => r.json());
      return [l.code, data.totalBlocks || TOTAL_BLOCKS] as const;
    })).then((items) => setBlockTotals(Object.fromEntries(items))).catch(() => undefined);
    return () => window.removeEventListener(NOTES_CHANGED, refreshNotes);
  }, [deviceId, active, q, refreshNotes]);

  const byLang: Record<string, ProgressRow> = Object.fromEntries(prog.map((p) => [p.lang, p]));
  for (const [lang, local] of Object.entries(localProgress)) {
    const server = byLang[lang];
    byLang[lang] = {
      lang,
      blockIndex: Math.max(server?.blockIndex ?? 0, local.blockIndex),
      listenedSeconds: Math.max(server?.listenedSeconds ?? 0, local.listenedSeconds),
    };
  }
  const nights = new Set(sessions.map((s) => new Date(s.startedAt).toISOString().slice(0, 10)));
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const totalMinutes = sessions.reduce((a, s) => a + (s.minutes || 0), 0);

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="px-4 pb-1 pt-5 lg:hidden">
        <span className="label text-amber">GECE GÜNLÜĞÜ</span>
        <h1 className="mt-2 font-display text-[30px] italic leading-none text-bone">İlerlemen.</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-dim">Her dilin kaldığı yer ve dinleme geçmişin burada.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 px-3 pb-3 pt-3 lg:grid-cols-3 lg:gap-0 lg:border-b lg:border-line lg:p-0">
        {/* seri */}
        <div className="rounded-2xl border border-line bg-[#0c0a08] p-5 lg:rounded-none lg:border-0 lg:border-r lg:bg-transparent lg:p-6">
          <span className="label">ARALIKSIZ SERİ</span>
          <div className="mt-3 flex items-end gap-3">
            <span className="num text-6xl leading-none text-amber">{streak.streak}</span>
            <span className="label mb-2">GECE</span>
          </div>
          <p className="mt-3 text-[13px] text-dim">
            En uzun seri: <span className="num text-bone">{streak.longest || streak.streak}</span> gece · toplam{" "}
            <span className="num text-bone">{totalMinutes}</span> dakika
          </p>
          <div className="mt-5 flex gap-2">
            {last7.map((d) => (
              <div key={d} className="flex flex-col items-center gap-1.5">
                <span
                  className={`h-7 w-[7px] ${nights.has(d) ? "bg-amber" : "bg-line"}`}
                  title={d}
                />
                <span className="label-sm">{d.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* dil ilerlemesi */}
        <div className="rounded-2xl border border-line bg-[#0c0a08] p-5 lg:rounded-none lg:border-0 lg:border-r lg:bg-transparent lg:p-6">
          <span className="label">DİL BAĞIMSIZ İLERLEME</span>
          <div className="mt-4 space-y-3.5">
            {LANGUAGES.map((l) => {
              const p = byLang[l.code];
              const block = p?.blockIndex ?? 0;
              const totalBlocks = blockTotals[l.code] ?? TOTAL_BLOCKS;
              const pct = Math.min(100, (block / totalBlocks) * 100);
              return (
                <div key={l.code}>
                  <div className="flex items-baseline justify-between">
                    <span className="label text-bone">{l.name.toUpperCase()}</span>
                    <span className="num text-[10px] text-dim2">
                      BLOK {block}/{totalBlocks}
                    </span>
                  </div>
                  <div className="mt-1.5 h-[3px] w-full bg-line">
                    <div className="h-full bg-amber" style={{ width: `${Math.max(pct, block ? 1 : 0)}%` }} />
                  </div>
                  <div className="mt-1 label-sm">
                    {(block * 7).toLocaleString("tr-TR")} kelime işlendi
                    {p?.listenedSeconds ? ` · ${Math.round(p.listenedSeconds / 3600)} sa dinleme` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* senkron */}
        <div className="rounded-2xl border border-line bg-[#0c0a08] p-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-6">
          <span className="label">BULUT SENKRON</span>
          <p className="mt-3 text-[13px] leading-relaxed text-dim">
            {cloud
              ? "Ayarlar Supabase uç noktasına gönderildi. Cihazlar arası hesap eşleştirmesi henüz etkin değil."
              : "İlerlemen bu cihazda ve yerel sunucuda saklanır. Cihazlar arası hesap eşleştirmesi henüz etkin değil."}
          </p>
          <div className="mt-4 space-y-1.5">
            <KV k="CİHAZ" v={deviceId.slice(0, 18) || "—"} />
            <KV k="DURUM" v={syncState === "sending" ? "GÖNDERİLİYOR" : syncState === "ok" ? "GÜNCEL" : syncState === "error" ? "HATA" : "BAĞLI"} />
            <KV k="PAKET" v="7 DİL · 6.000+ KAYIT / DİL" />
          </div>
          <button
            onClick={sync}
            className="label mt-4 w-full border border-line py-2.5 text-dim transition-colors hover:border-amber hover:text-amber"
          >
            ŞİMDİ SENKRONLA
          </button>

          {notes.length > 0 && (
            <div className="mt-6">
              <span className="label">SABAH NOTLARI</span>
              <ul className="mt-3 space-y-2">
                {notes.slice(0, 4).map((n) => (
                  <li key={n.id} className="border-l border-line pl-3">
                    <div className="flex items-center gap-2">
                      <span className="num text-[10px] text-dim2">{new Date(n.createdAt).toLocaleDateString("tr-TR")}</span>
                      <span className="flex gap-[3px]">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={`h-2 w-[3px] ${i < n.rating ? "bg-amber" : "bg-line"}`} />
                        ))}
                      </span>
                      {n.feeling && <span className="label-sm text-amber/70">{n.feeling}</span>}
                      {n.pending && <span className="label-sm text-amber">CİHAZDA</span>}
                    </div>
                    {n.recalled && <p className="mt-1 text-[12px] text-dim">{n.recalled}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* gece günlüğü */}
      <div className="p-4">
        <span className="label">GECE GÜNLÜĞÜ</span>
        <div className="mt-3 space-y-2 md:hidden">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-[#0c0a08] px-4 py-3">
              <div>
                <p className="num text-[13px] text-bone">{new Date(session.startedAt).toLocaleString("tr-TR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
                <p className="label-sm mt-1.5">{session.lang.toUpperCase()} · {session.blocks} BLOK · {session.mode === "binaural" ? "KULAKLIK" : "HOPARLÖR"}</p>
              </div>
              <span className="num shrink-0 text-[13px] text-amber">{session.minutes} dk</span>
            </div>
          ))}
          {!sessions.length && <div className="rounded-xl border border-line bg-[#0c0a08] px-4 py-7 text-center">
            <p className="font-display text-2xl italic text-dim">İlk gece seni bekliyor.</p>
            <p className="mt-2 text-[13px] text-dim2">Dinleme geçmişin burada görünecek.</p>
          </div>}
        </div>
        <table className="mt-3 hidden w-full border-collapse text-left md:table">
          <thead>
            <tr className="border-b border-line">
              <th className="label px-3 py-2 font-normal">TARİH</th>
              <th className="label px-3 py-2 font-normal">DİL</th>
              <th className="label px-3 py-2 font-normal">SÜRE</th>
              <th className="label hidden px-3 py-2 font-normal sm:table-cell">ÇIKIŞ</th>
              <th className="label hidden px-3 py-2 font-normal md:table-cell">KAFİYE</th>
              <th className="label px-3 py-2 text-right font-normal">BLOK</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="row border-b border-line/60">
                <td className="num px-3 py-2.5 text-[12px] text-bone">
                  {new Date(s.startedAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="label px-3 py-2.5">{s.lang.toUpperCase()}</td>
                <td className="num px-3 py-2.5 text-[12px] text-dim">{s.minutes} dk</td>
                <td className="label-sm hidden px-3 py-2.5 sm:table-cell">{s.mode === "binaural" ? "BİNAURAL" : "STEREO"}</td>
                <td className="label-sm hidden px-3 py-2.5 md:table-cell">{s.scheme ?? "—"}</td>
                <td className="num px-3 py-2.5 text-right text-[12px] text-dim">{s.blocks}</td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center">
                  <p className="font-display text-2xl italic text-dim">İlk gece seni bekliyor.</p>
                  <p className="mt-2 text-[13px] text-dim2">
                    Seansı başlat; sabah hatırladıklarını not edebilirsin.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 pb-1.5">
      <span className="label-sm">{k}</span>
      <span className="num text-[11px] text-bone/80">{v}</span>
    </div>
  );
}
