"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, Star, Volume2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { LANGUAGES } from "@/lib/languages";
import { LEVELS, TOPICS } from "@/data/curriculum";
import { playLine } from "@/lib/voice";
import type { AttributedExample } from "@/lib/examples";

interface Row {
  id: number;
  text: string;
  translation: string;
  pos: string | null;
  tier: number;
  rhyme: string | null;
  blockIndex: number;
  level?: string | null;
  topic?: string | null;
}

type Filter = "all" | 0 | 1 | 2 | 3 | "fav";

const FILTERS: { id: Filter; label: string }[] = [
  { id: 0, label: "KAFİYELİ" },
  { id: 3, label: "KALIPLAR" },
  { id: 1, label: "KELİMELER" },
  { id: 2, label: "SAYILAR" },
  { id: "fav", label: "ZOR KELİMELER" },
];

const PAGE = 60;

export default function VocabView() {
  const { lang, setLang, favorites, toggleFavorite, deviceId, settings } = useStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [meaningfulTotal, setMeaningfulTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [playing, setPlaying] = useState<number | null>(null);
  const [expandedKey, setExpandedKey] = useState("");
  const [example, setExample] = useState<AttributedExample | null>(null);
  const [exampleState, setExampleState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [exampleCounts, setExampleCounts] = useState<Record<string, number>>({});
  const requestId = useRef(0);
  const exampleRequestId = useRef(0);

  const isFav = filter === "fav";

  const load = useCallback(
    async (nextOffset: number) => {
      const id = ++requestId.current;
      setLoading(true);
      setLoadError("");
      try {
        if (isFav) {
          const response = await fetch(`/api/favorites?device=${encodeURIComponent(deviceId)}&lang=${lang}`);
          if (!response.ok) throw new Error("offline");
          const d = await response.json();
          if (id !== requestId.current) return;
          const items: Row[] = (Array.isArray(d.items) ? d.items : [])
            .filter((f: { text: string | null; level?: string; topic?: string }) =>
              f.text && (!level || f.level === level) && (!topic || f.topic === topic))
            .map((f: { wordId: number; text: string; translation: string; pos: string | null; level?: string; topic?: string }) => ({
              id: f.wordId, text: f.text, translation: f.translation, pos: f.pos, tier: 1, rhyme: null, blockIndex: 0,
              level: f.level, topic: f.topic,
            }));
          setRows(items);
          setTotal(items.length);
          return;
        }
        const params = new URLSearchParams({ lang, offset: String(nextOffset), limit: String(PAGE) });
        if (q) params.set("q", q);
        if (filter !== "all") params.set("tier", String(filter));
        if (level) params.set("level", level);
        if (topic) params.set("topic", topic);
        const response = await fetch(`/api/words?${params.toString()}`);
        if (!response.ok) throw new Error("offline");
        const d = await response.json();
        if (id !== requestId.current) return;
        if (!Array.isArray(d.items)) throw new Error("invalid-data");
        setTotal(d.total ?? 0);
        setMeaningfulTotal(d.meaningfulTotal ?? 0);
        setRows((prev) => (nextOffset === 0 ? d.items : [...prev, ...d.items]));
        setOffset(nextOffset + PAGE);
      } catch {
        if (id !== requestId.current) return;
        if (nextOffset === 0) {
          setRows([]);
          setTotal(0);
        }
        setLoadError("Bu içerik şu anda kullanılamıyor. Çevrimdışıyken daha önce açtığın sayfalara ulaşabilirsin.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [lang, q, filter, isFav, deviceId, level, topic],
  );

  useEffect(() => {
    requestId.current += 1;
    const timer = window.setTimeout(() => void load(0), q ? 200 : 0);
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [load, q]);

  const displayRows = isFav ? rows.filter((row) => favorites.includes(row.id)) : rows;

  useEffect(() => {
    fetch("/api/examples?summary=1").then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.counts) setExampleCounts(data.counts); }).catch(() => undefined);
  }, []);

  const toggleExample = async (row: Row) => {
    const key = `${lang}:${row.id}`;
    const id = ++exampleRequestId.current;
    if (expandedKey === key) {
      setExpandedKey("");
      setExample(null);
      setExampleState("idle");
      return;
    }
    setExpandedKey(key);
    setExample(null);
    setExampleState("loading");
    try {
      const response = await fetch(`/api/examples?lang=${encodeURIComponent(lang)}&word=${encodeURIComponent(row.text)}`);
      if (!response.ok) throw new Error("example-unavailable");
      const data = await response.json();
      if (id !== exampleRequestId.current) return;
      setExample(data.example ?? null);
      setExampleState("ready");
    } catch {
      if (id === exampleRequestId.current) setExampleState("error");
    }
  };

  const listen = async (r: Row) => {
    setPlaying(r.id);
    await playLine({
      lang,
      text: r.text,
      source: settings.voiceSource,
      rate: settings.voiceRate,
      level: settings.voiceLevel,
    });
    window.setTimeout(() => setPlaying((p) => (p === r.id ? null : p)), 1800);
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      {/* başlık şeridi */}
      <div className="sticky top-0 z-10 border-b border-line bg-black/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-3 py-2.5 md:px-4 md:py-3">
          <span className="label hidden text-bone md:inline">DİL PAKETİ</span>
          <div className="scroll-thin -mx-1 flex w-full gap-px overflow-x-auto px-1 md:w-auto">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                aria-label={l.name}
                aria-pressed={lang === l.code}
                className={`label min-h-[48px] shrink-0 rounded-lg border px-4 min-w-[48px] transition-colors md:min-h-[38px] md:rounded-none ${
                  lang === l.code ? "border-amber bg-[#1b140c] text-amber" : "border-line text-dim hover:text-bone"
                }`}
              >
                {l.code.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-line bg-[#0c0a08] px-3 md:rounded-none md:bg-transparent">
            <Search className="h-4 w-4 shrink-0 text-dim2" strokeWidth={1.5} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Kelime, cümle veya Türkçe ara…"
              className="min-h-[42px] w-full bg-transparent text-[14px] text-bone placeholder:text-dim2 focus:outline-none"
            />
          </div>
          <span className="num hidden shrink-0 text-[11px] text-dim md:inline">
            {total.toLocaleString("tr-TR")} SONUÇ {meaningfulTotal > 0 && `· ${meaningfulTotal.toLocaleString("tr-TR")} KELİME / CÜMLE`}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 md:hidden">
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}
            className="label flex min-h-[42px] items-center gap-2 rounded-full border border-line2 px-3 text-bone">
            <SlidersHorizontal className="h-4 w-4 text-amber" strokeWidth={1.5} />
            FİLTRELER{level || topic ? " · AKTİF" : ""}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} strokeWidth={1.5} />
          </button>
          <span className="num text-right text-[10px] leading-relaxed text-dim">
            {(isFav ? displayRows.length : total).toLocaleString("tr-TR")} sonuç
            {exampleCounts[lang] ? ` · ${exampleCounts[lang].toLocaleString("tr-TR")} örnek` : ""}
          </span>
        </div>
        <div className={`${filtersOpen ? "flex" : "hidden"} flex-wrap items-center gap-2 border-t border-line px-3 py-2 md:flex md:px-4`}>
          <span className="label-sm">SEVİYE</span>
          <div className="flex gap-px">
            <button onClick={() => setLevel("")} className={`label min-h-[36px] border px-2.5 ${!level ? "border-amber text-amber" : "border-line text-dim"}`}>TÜMÜ</button>
            {LEVELS.map((item) => (
              <button key={item} onClick={() => setLevel(item)}
                className={`label min-h-[36px] border px-2.5 ${level === item ? "border-amber text-amber" : "border-line text-dim hover:text-bone"}`}>
                {item}
              </button>
            ))}
          </div>
          <select value={topic} onChange={(event) => setTopic(event.target.value)} aria-label="Konu seç"
            className="min-h-[36px] min-w-[160px] flex-1 border border-line bg-black px-3 text-[12px] text-dim focus:border-amber focus:outline-none md:flex-none">
            <option value="">Tüm konular</option>
            {TOPICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <p className={`${filtersOpen ? "block" : "hidden"} px-3 pb-2 text-[10px] leading-relaxed text-dim2 md:block md:px-4`}>
          Seviye ve konu etiketleri yol gösteren tahminlerdir; sözlük karşılıkları makine çevirisi içerebilir.
        </p>
        <div className="scroll-thin flex gap-px overflow-x-auto border-t border-line px-2 md:px-4">
          <button
            onClick={() => setFilter("all")}
            className={`label min-h-[40px] shrink-0 px-3 ${filter === "all" ? "text-amber" : "text-dim2 hover:text-dim"}`}
          >
            TÜMÜ
          </button>
          {FILTERS.map((f) => (
            <button
              key={String(f.id)}
              onClick={() => setFilter(f.id)}
              className={`label min-h-[40px] shrink-0 px-3 ${filter === f.id ? "text-amber" : "text-dim2 hover:text-dim"}`}
            >
              {f.label}
              {f.id === "fav" && favorites.length ? ` (${favorites.length})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- mobil liste ---------- */}
      <ul className="space-y-2 px-3 py-3 md:hidden">
        {displayRows.map((r, i) => {
          const fav = favorites.includes(r.id);
          return (
            <li key={r.id} className="flex items-start gap-3 rounded-xl border border-line bg-[#0c0a08] px-3 py-3">
              <span className="num w-8 shrink-0 pt-1 text-[10px] text-dim2">{String(i + 1).padStart(4, "0")}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] leading-snug text-bone [overflow-wrap:anywhere]">{r.text}</p>
                <p className="mt-1 text-[13px] leading-snug text-dim [overflow-wrap:anywhere]">{r.translation}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="label-sm">{r.pos ?? "—"}</span>
                  {r.level && <span className="label-sm text-amber/80">· {r.level}</span>}
                  {r.topic && <span className="label-sm">· {TOPICS.find((item) => item.id === r.topic)?.label ?? r.topic}</span>}
                  {r.rhyme && <span className="label-sm text-amber/70">· {r.rhyme}</span>}
                </div>
                {r.tier === 1 && (
                  <>
                    <button type="button" onClick={() => void toggleExample(r)} aria-expanded={expandedKey === `${lang}:${r.id}`}
                      className="label mt-3 min-h-[36px] rounded-lg border border-line2 px-2.5 text-amber/85">
                      {expandedKey === `${lang}:${r.id}` ? "CÜMLEYİ GİZLE" : "CÜMLEDE GÖR"}
                    </button>
                    {expandedKey === `${lang}:${r.id}` && <ExamplePanel state={exampleState} example={example}
                      onListen={() => example && void playLine({ lang, text: example.sentence, source: settings.voiceSource, rate: settings.voiceRate, level: settings.voiceLevel })} />}
                  </>
                )}
              </div>
              <div className="flex shrink-0 flex-col">
                <button
                  onClick={() => listen(r)}
                  aria-label="Dinle"
                  className={`flex h-11 w-11 items-center justify-center ${playing === r.id ? "text-amber" : "text-dim2"}`}
                >
                  <Volume2 className="h-4 w-4" strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => toggleFavorite(r.id, lang)}
                  aria-label="Zor kelime havuzuna ekle"
                  aria-pressed={fav}
                  className="flex h-11 w-11 items-center justify-center"
                >
                  <Star className={`h-4 w-4 ${fav ? "text-amber" : "text-dim2"}`} strokeWidth={1.5} fill={fav ? "#ffb35c" : "none"} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ---------- masaüstü tablo ---------- */}
      <table className="hidden w-full border-collapse text-left md:table">
        <thead>
          <tr className="border-b border-line">
            <th className="label w-14 px-4 py-2 font-normal">#</th>
            <th className="label px-3 py-2 font-normal">METİN</th>
            <th className="label px-3 py-2 font-normal">TÜRKÇE</th>
            <th className="label w-28 px-3 py-2 font-normal">TÜR</th>
            <th className="label w-24 px-3 py-2 font-normal">SEVİYE*</th>
            <th className="label w-24 px-3 py-2 text-right font-normal">DİNLE / ZOR</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((r, i) => {
            const fav = favorites.includes(r.id);
            return (
              <tr key={r.id} className="row group border-b border-line/60">
                <td className="relative px-4 py-2.5">
                  <span className="rowmark absolute left-0 top-0 h-full w-[2px] bg-transparent" />
                  <span className="num text-[11px] text-dim2">{String(i + 1).padStart(4, "0")}</span>
                </td>
                <td className="max-w-[28ch] px-3 py-2.5 text-[14px] text-bone">
                  <span className="block truncate">{r.text}</span>
                  {r.tier === 1 && <>
                    <button type="button" onClick={() => void toggleExample(r)} aria-expanded={expandedKey === `${lang}:${r.id}`}
                      className="label-sm mt-2 text-amber/85 underline underline-offset-4">
                      {expandedKey === `${lang}:${r.id}` ? "CÜMLEYİ GİZLE" : "CÜMLEDE GÖR"}
                    </button>
                    {expandedKey === `${lang}:${r.id}` && <ExamplePanel state={exampleState} example={example}
                      onListen={() => example && void playLine({ lang, text: example.sentence, source: settings.voiceSource, rate: settings.voiceRate, level: settings.voiceLevel })} />}
                  </>}
                </td>
                <td className="max-w-[32ch] px-3 py-2.5 text-[13px] text-dim">
                  <span className="block truncate">{r.translation}</span>
                </td>
                <td className="px-3 py-2.5"><span className="label-sm">{r.pos ?? "—"}</span></td>
                <td className="px-3 py-2.5"><span className="label-sm text-amber/70">{r.level ?? r.rhyme ?? "—"}</span></td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => listen(r)} aria-label="Dinle"
                      className={`flex h-8 w-8 items-center justify-center ${playing === r.id ? "text-amber" : "text-dim2 hover:text-dim"}`}>
                      <Volume2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                    <button onClick={() => toggleFavorite(r.id, lang)} aria-label="Zor kelime havuzuna ekle"
                      className="flex h-8 w-8 items-center justify-center">
                      <Star className={`h-3.5 w-3.5 ${fav ? "text-amber" : "text-dim2 hover:text-dim"}`} strokeWidth={1.5} fill={fav ? "#ffb35c" : "none"} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {loadError && !loading && (
        <div role="status" className="mx-4 mt-4 border border-line p-4 text-[13px] leading-relaxed text-dim">
          {loadError}
          <button onClick={() => void load(0)} className="label mt-3 block min-h-[40px] border border-line px-3 text-amber">TEKRAR DENE</button>
        </div>
      )}
      {displayRows.length === 0 && !loading && !loadError && (
        <div className="px-4 py-16 text-center">
          <p className="font-display text-2xl italic text-dim">
            {isFav ? "Havuz boş." : "Kayıt bulunamadı."}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-dim2">
            {isFav
              ? "Takıldığın kelimelere yıldız koy — gece seansında bu satırlar öncelikli okunur."
              : "Aramayı değiştir ya da başka bir tür filtresi seç."}
          </p>
        </div>
      )}

      {loading && <p className="label px-4 py-6 text-dim2">PAKET OKUNUYOR…</p>}

      {!isFav && offset < total && !loading && (
        <div className="flex justify-center py-8">
          <button
            onClick={() => load(offset)}
            className="label min-h-[46px] border border-line px-6 text-dim transition-colors hover:border-amber hover:text-amber"
          >
            DAHA FAZLA KAYIT YÜKLE
          </button>
        </div>
      )}
    </div>
  );
}

function ExamplePanel({ state, example, onListen }: {
  state: "idle" | "loading" | "ready" | "error";
  example: AttributedExample | null;
  onListen: () => void;
}) {
  if (state === "loading") return <p className="mt-2 text-[12px] text-dim">Cümle hazırlanıyor…</p>;
  if (state === "error") return <p className="mt-2 text-[12px] text-dim">Örnek alınamadı; bağlantını kontrol et.</p>;
  if (!example) return <p className="mt-2 text-[12px] text-dim">Bu kelime için henüz kaynaklı cümle yok.</p>;
  return (
    <div className="mt-2 rounded-lg border border-line2 bg-black/40 p-3 text-left">
      <p className="text-[14px] leading-relaxed text-bone [overflow-wrap:anywhere]">{example.sentence}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-dim [overflow-wrap:anywhere]">{example.translation}</p>
      <button type="button" onClick={onListen} className="label mt-2 flex min-h-[36px] items-center gap-1.5 text-amber">
        <Volume2 className="h-4 w-4" strokeWidth={1.5} /> CÜMLEYİ DİNLE
      </button>
      <details className="mt-1 text-[10px] leading-relaxed text-dim2">
        <summary className="cursor-pointer">Tatoeba · kaynak ve katkıda bulunanlar</summary>
        <p className="mt-1 [overflow-wrap:anywhere]">{example.attribution}</p>
        {example.translationAttribution && <p className="mt-1 [overflow-wrap:anywhere]">{example.translationAttribution}</p>}
        <p className="mt-1">Türkçe karşılıklar kaynak eşleştirmesi veya otomatik çeviri içerir; bağlama göre değişebilir.</p>
        <a href="/licenses/tatoeba-examples.txt" className="mt-1 inline-block text-amber/80 underline">CC BY 2.0 FR lisansı</a>
      </details>
    </div>
  );
}
