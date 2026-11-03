/**
 * Dinlenme için yumuşak bir ses ve tekrar planı.
 * İlk 35–45 dakika konuşma yoktur; seçilen süre bitince düşük seviyeli
 * dil okunuşları başlar. Frekanslar EEG ölçümü değildir ve belirli bir uyku
 * ya da bilinç durumunu garanti etmez. Dil öğrenmenin de yerini tutmaz.
 *
 * Beyin dalgası bantları (yaklaşık):
 *  ALFA  : 8–13 Hz  (rahatlama, hafif odaklanma)
 *  TETA  : 4–8 Hz   (sakin dinlenme, hafif uyku)
 *  DELTA : 0.5–4 Hz (derin uyku,ARN)
 */

export interface Anchor {
  /** geçiş evresinin oranı (0-1) */
  at: number;
  hz: number;
  band: string;
  label: string;
}

/**
 * Gece: alfa'dan delta'ya yumuşak iniş.
 * 10 Hz'den başlayarak yavaş yavaş derin uykuya doğru iner.
 */
export const DESCENT: Anchor[] = [
  { at: 0.00, hz: 10, band: "ALFA", label: "Gevşeme başlangıcı" },
  { at: 0.12, hz: 9, band: "ALFA", label: "Hafif alfa" },
  { at: 0.25, hz: 8, band: "ALFA", label: "Alfa tavanı" },
  { at: 0.40, hz: 6, band: "TETA", label: "Teta eşiği" },
  { at: 0.58, hz: 4.5, band: "TETA", label: "Derin teta" },
  { at: 0.75, hz: 3, band: "DELTA", label: "Delta giriş" },
  { at: 0.90, hz: 2, band: "DELTA", label: "Derin delta" },
  { at: 1.00, hz: 1.5, band: "DELTA", label: "Derin uyku" },
];

/**
 * Sabah: delta'dan alfa'ya bilinç yükselişi.
 * Yumuşak uyanış, sonrada tam bilinç.
 */
export const ASCENT: Anchor[] = [
  { at: 0.00, hz: 2, band: "DELTA", label: "Derin uyku sonu" },
  { at: 0.15, hz: 4, band: "TETA", label: "Yumuşak uyanış" },
  { at: 0.35, hz: 6, band: "TETA", label: "Bilinç döşeniyor" },
  { at: 0.55, hz: 8, band: "ALFA", label: "Uyanık halsizlik" },
  { at: 0.75, hz: 10, band: "ALFA", label: "Güneşe hazır" },
  { at: 1.00, hz: 10, band: "ALFA", label: "Tam bilinç" },
];

/**
 * Akşam: alfa'dan teta'ya, bilinci açık bırakan huzur.
 * Bedeni uyutturur ama zihni uyanık tutar.
 */
export const EVENING: Anchor[] = [
  { at: 0.00, hz: 10, band: "ALFA", label: "Hafif gevşeme" },
  { at: 0.25, hz: 8, band: "ALFA", label: "Birikim" },
  { at: 0.50, hz: 6, band: "TETA", label: "Beden dinleniyor" },
  { at: 0.75, hz: 4.5, band: "TETA", label: "Uyku eşiği, bilinç açık" },
  { at: 1.00, hz: 4.5, band: "TETA", label: "Derin huzur, hafif bilinç" },
];

/**
 * Derin uyku: delta yoğunluğu.
 * En derin evreye doğru iner ve orada kalır.
 */
export const DEEP_SLEEP: Anchor[] = [
  { at: 0.00, hz: 4, band: "TETA", label: "Uyku başlangıcı" },
  { at: 0.20, hz: 2.5, band: "DELTA", label: "Derinleşme" },
  { at: 0.45, hz: 1.5, band: "DELTA", label: "Derin delta" },
  { at: 0.70, hz: 1, band: "DELTA", label: "En derin evre" },
  { at: 1.00, hz: 1, band: "DELTA", label: "Sürükleyici uyku" },
];

/**
 * Yoğun tekrar: sabit alfa, yüksek odaklanma.
 * Öğrenme ve pekiştirme için Alfa plateau.
 */
export const FOCUS_ALFA: Anchor[] = [
  { at: 0.00, hz: 10, band: "ALFA", label: "Yoğun alfa" },
  { at: 0.50, hz: 10, band: "ALFA", label: "Sürdürülen alfa" },
  { at: 1.00, hz: 10, band: "ALFA", label: "Sabatlı alfa" },
];

/**
 * Kısa güçlü uyku (power nap): 20 dk'lık delta pulsu.
 * Hızlı dinlenme, sonra uyanık bilinç.
 */
export const POWER_NAP: Anchor[] = [
  { at: 0.00, hz: 10, band: "ALFA", label: "Hazırlık" },
  { at: 0.15, hz: 8, band: "ALFA", label: "Hafif gevşeme" },
  { at: 0.35, hz: 4, band: "TETA", label: "Hızlı teta" },
  { at: 0.55, hz: 2, band: "DELTA", label: "Kısa delta pulsu" },
  { at: 0.75, hz: 6, band: "TETA", label: "Uyanış" },
  { at: 1.00, hz: 10, band: "ALFA", label: "Tam uyanık" },
];

/** Sesin yavaş nabız hızı; ölçülen beyin salınımı değildir. */
export const SO_HZ = 0.8;
export const SO_PERIOD = 1 / SO_HZ;

export interface ProtocolState {
  hz: number;
  band: string;
  label: string;
  stageIndex: number;
  /** geçiş evresi ilerlemesi 0-1 */
  progress: number;
}

export function protocolAt(elapsed: number, prepSeconds: number): ProtocolState {
  if (elapsed >= prepSeconds) {
    return {
      hz: SO_HZ,
      band: "YAVAŞ SALINIM",
      label: "Aralıklı dil tekrarı",
      stageIndex: DESCENT.length,
      progress: 1,
    };
  }
  const p = Math.max(0, Math.min(1, elapsed / prepSeconds));
  let i = 0;
  while (i < DESCENT.length - 2 && p > DESCENT[i + 1].at) i++;
  const a = DESCENT[i];
  const b = DESCENT[i + 1];
  const k = (p - a.at) / Math.max(0.0001, b.at - a.at);
  const hz = Number((a.hz + (b.hz - a.hz) * k).toFixed(2));
  // bant etiketi anlık frekanstan türetilir (alfa ≥8, teta 4–8, delta <4)
  const band = hz >= 8 ? "ALFA" : hz >= 4 ? "TETA" : "DELTA";
  return { hz, band, label: a.label, stageIndex: i, progress: p };
}

export interface Slot {
  /** yükleme evresi içindeki saniye */
  t: number;
  line: number;
  pass: number;
  /** önceki bloktan tekrar mı */
  review: boolean;
}

/**
 * Artan aralıklı tekrar: ilk geçişler sık, sonra seyrekleşir.
 * Çift geçişler yeni blok, tek geçişler önceki bloktan tekrardır
 * (araya serpiştirme / interleaving). Zamanlar sesin ritim ızgarasına
 * oturtulur; kişiden ölçülen bir beyin dalgasına eşlenmez.
 */
export function buildSchedule(lineCount: number, blockSeconds: number): Slot[] {
  const gaps = [10, 16, 26, 40, 56];
  const slots: Slot[] = [];
  let t = 2.5;
  let pass = 0;
  while (t < blockSeconds && pass < 40) {
    const gap = gaps[Math.min(pass, gaps.length - 1)];
    for (let line = 0; line < lineCount; line++) {
      const snapped = Math.round(t / SO_PERIOD) * SO_PERIOD;
      if (snapped >= blockSeconds) break;
      slots.push({ t: snapped, line, pass, review: pass % 2 === 1 });
      t += gap;
    }
    pass++;
  }
  return slots;
}

export function slotAt(slots: Slot[], seconds: number): number {
  let lo = 0;
  let hi = slots.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (slots[mid].t <= seconds) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export const PROTOCOL_NOTES = [
  {
    title: "İlk bölüm neden konuşmasız?",
    body: "Seçtiğin süre boyunca yalnızca arka plan sesi çalar. Daha sakin bir başlangıç sağlamak amaçlanır; uygulama uyku evresini ölçmez ve uykuya geçişi garanti etmez.",
  },
  {
    title: "Dil sesleri ne zaman başlar?",
    body: "Hazırlık süresi bitince kısa dil sesleri düşük seviyede çalınır. Uykuda yeni bir dili öğrenmenin veya frekanslarla dikkati artırmanın etkisi kesin değildir.",
  },
  {
    title: "Neden aralıklı tekrar?",
    body: "Yedi satır tekrar edilir; önceki bloktan örnekler de araya girer. Aralıklı tekrar özellikle uyanık öğrenme sırasında yararlıdır; gece tekrarları bunun yerine geçmez.",
  },
  {
    title: "Sabah hatırlama",
    body: "Uyanınca anlamı görüp sözcüğü hatırlamaya çalışabilirsin. Zorlandığın sözcükler sonraki tekrarlar için havuza eklenir.",
  },
];

/** Ortak profil hesaplayıcı: belirtilen anchor dizisi üzerinden interpolasyon yapar. */
function protocolProfile(elapsed: number, prepSeconds: number, profile: Anchor[]): ProtocolState {
  if (elapsed >= prepSeconds) {
    const last = profile[profile.length - 1];
    return {
      hz: last.hz,
      band: last.band,
      label: last.label,
      stageIndex: profile.length - 1,
      progress: 1,
    };
  }
  const p = Math.max(0, Math.min(1, elapsed / prepSeconds));
  let i = 0;
  while (i < profile.length - 2 && p > profile[i + 1].at) i++;
  const a = profile[i];
  const b = profile[i + 1];
  const k = (p - a.at) / Math.max(0.0001, b.at - a.at);
  const hz = Number((a.hz + (b.hz - a.hz) * k).toFixed(2));
  const band = hz >= 8 ? "ALFA" : hz >= 4 ? "TETA" : "DELTA";
  return { hz, band, label: a.label, stageIndex: i, progress: p };
}

/** Gece modu: alfa'dan delta'ya uykuya geçiş. */
export function protocolSleep(elapsed: number, prepSeconds: number): ProtocolState {
  return protocolProfile(elapsed, prepSeconds, DESCENT);
}

/** Sabah modu: alfa dalgaları ile bilinç yükselişi. */
export function protocolMorning(elapsed: number, prepSeconds: number): ProtocolState {
  return protocolProfile(elapsed, prepSeconds, ASCENT);
}

/** Akşam modu: bedeni uyutturan, bilinci açık bırakan theta sınırı. */
export function protocolEvening(elapsed: number, prepSeconds: number): ProtocolState {
  return protocolProfile(elapsed, prepSeconds, EVENING);
}

/** Derin uyku modu: delta yoğun derinleşme. */
export function protocolDeepSleep(elapsed: number, prepSeconds: number): ProtocolState {
  return protocolProfile(elapsed, prepSeconds, DEEP_SLEEP);
}

/** Yoğun tekrar modu: sabit alfa ile odaklanma. */
export function protocolFocus(elapsed: number, prepSeconds: number): ProtocolState {
  return protocolProfile(elapsed, prepSeconds, FOCUS_ALFA);
}

/** Güçlü kısa uyku modu: 20 dakikalık delta pulsu. */
export function protocolPowerNap(elapsed: number, prepSeconds: number): ProtocolState {
  return protocolProfile(elapsed, prepSeconds, POWER_NAP);
}
