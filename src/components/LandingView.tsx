import React, { useMemo, useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { formatCompactIDR, formatIDR } from "../data/initialState";

interface LandingViewProps {
  onSignIn: () => void;
  authLoading: boolean;
  authError: string | null;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onSignIn,
  authLoading,
  authError,
}) => {
  const [monthlyExtra, setMonthlyExtra] = useState(2000000);
  const [annualReturn, setAnnualReturn] = useState(10);

  const tenYearProjection = useMemo(() => {
    const monthlyRate = annualReturn / 100 / 12;
    let total = 5000000;
    for (let m = 0; m < 120; m++) {
      total = total * (1 + monthlyRate) + monthlyExtra;
    }
    const principal = 5000000 + monthlyExtra * 120;
    return {
      total,
      principal,
      passiveMonthly: (total * (annualReturn / 100)) / 12,
    };
  }, [monthlyExtra, annualReturn]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            LajuModal
          </a>

          <nav
            aria-label="Navigasi landing"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <a
              href="#cara-kerja"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Cara Kerja
            </a>
            <a
              href="#fitur"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Fitur Utama
            </a>
            <a
              href="#paket"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Paket Akses
            </a>
            <a
              href="#faq"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              FAQ
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              disabled={authLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {authLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{authLoading ? "Menghubungkan..." : "Masuk dengan Google"}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Split */}
        <section className="max-w-[1200px] mx-auto px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <p className="text-xs font-medium text-slate-500">
              Wadah Finansial &amp; Peluang Digital untuk Umum · Berbasis Akun Cloud
            </p>
            <h1
              className="font-display font-bold tracking-tight text-slate-900 leading-[1.12] max-w-2xl"
              style={{ fontSize: "clamp(2.25rem, 4vw, 3.5rem)", textWrap: "balance" }}
            >
              Bangun arus kas digital dan kelola portofolio investasi dalam satu wadah.
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              LajuModal membantu siapa saja menghasilkan pendapatan pertama bermodal komputer melalui katalog jasa B2B dan produk digital siap jual, lalu menyisihkannya otomatis ke portofolio investasi agar uang menghasilkan uang.
            </p>

            {authError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 max-w-xl">
                {authError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={onSignIn}
                disabled={authLoading}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {authLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                <span>Mulai Gratis dengan Google</span>
              </button>
              <a
                href="#paket"
                className="px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Lihat Paket Gratis vs Pro
              </a>
            </div>
          </div>

          {/* Interactive Value Preview */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="pb-4 border-b border-slate-100">
              <p className="text-xs text-slate-500">Simulasi Cepat Model Uang</p>
              <h2 className="font-display text-base font-semibold text-slate-900 mt-0.5">
                Dampak Arus Kas Digital selama 10 Tahun
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-600">Setoran Rutin dari Jasa / Produk Digital</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatIDR(monthlyExtra)} / bln
                  </span>
                </div>
                <input
                  type="range"
                  min={500000}
                  max={10000000}
                  step={250000}
                  value={monthlyExtra}
                  onChange={(e) => setMonthlyExtra(Number(e.target.value))}
                  className="w-full accent-slate-900 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-600">Estimasi Imbal Hasil Portofolio</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {annualReturn}% / tahun
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={16}
                  step={1}
                  value={annualReturn}
                  onChange={(e) => setAnnualReturn(Number(e.target.value))}
                  className="w-full accent-slate-900 cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500">Total Portofolio Tahun ke-10</span>
                <span className="font-mono text-xl font-semibold text-slate-900 tabular-nums">
                  {formatCompactIDR(tenYearProjection.total)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500">Keuntungan Efek Majemuk</span>
                <span className="font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                  +{formatCompactIDR(tenYearProjection.total - tenYearProjection.principal)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500">Potensi Arus Pasif Bulanan</span>
                <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {formatIDR(tenYearProjection.passiveMonthly)} / bln
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Mechanism / Cara Kerja */}
        <section id="cara-kerja" className="border-t border-slate-200 bg-white">
          <div className="max-w-[1200px] mx-auto px-6 py-16">
            <div className="max-w-2xl mb-12">
              <h2 className="font-display text-2xl font-semibold text-slate-900">
                Alur Kerja Terpadu dari Nol hingga Mandiri Finansial
              </h2>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Dirancang praktis agar pengguna tidak berhenti di teori—setiap peluang langsung terhubung dengan naskah penawaran dan alokasi portofolio.
              </p>
            </div>

            <div id="fitur" className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <p className="font-mono text-xs font-semibold text-slate-400">01</p>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Katalog Peluang &amp; Naskah Jualan
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Akses cetak biru jasa komputer dan produk digital siap jual—mulai dari optimasi Google Maps bisnis lokal, laporan kas UMKM, hingga sistem digitalisasi kandang ayam petelur—lengkap dengan script WhatsApp/DM siap salin.
                </p>
              </div>

              <div className="space-y-2">
                <p className="font-mono text-xs font-semibold text-slate-400">02</p>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Aturan Auto-Sweep &amp; Portofolio
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Tentukan porsi penyisihan otomatis ke Dana Darurat, SBN Ritel, ETF/Saham Dividen, dan Kas Putar. Lacak ketahanan likuid dan proyeksi 10 tahun secara real-time di akun cloud Anda.
                </p>
              </div>

              <div className="space-y-2">
                <p className="font-mono text-xs font-semibold text-slate-400">03</p>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Audit Rebalance &amp; Strategis AI
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Jalankan audit portofolio otomatis, buat paket penawaran khusus niche dengan AI, dan konsultasikan langkah finansial langsung dengan konteks angka portofolio Anda.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Tiers */}
        <section id="paket" className="border-t border-slate-200 bg-slate-50">
          <div className="max-w-[1200px] mx-auto px-6 py-16">
            <div className="max-w-2xl mb-10">
              <h2 className="font-display text-2xl font-semibold text-slate-900">
                Paket Akses Pengguna
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                Mulai gratis dengan akun Google Anda. Data portofolio, sprint eksekusi, dan aturan otomatisasi tersimpan aman di cloud per pengguna.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
              <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-6">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Untuk Mulai Membangun Fondasi
                  </p>
                  <h3 className="font-display text-lg font-semibold text-slate-900 mt-1">
                    Paket Gratis
                  </h3>
                  <p className="font-mono text-3xl font-bold text-slate-900 mt-3 tabular-nums">
                    Rp 0
                    <span className="text-xs font-sans font-normal text-slate-500">
                      {" "}
                      / selamanya
                    </span>
                  </p>

                  <ul className="mt-6 space-y-2.5 text-sm text-slate-700">
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>Manajemen aset &amp; kalkulator efek majemuk tanpa batas</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>Akses penuh katalog peluang bermodal komputer &amp; script penawaran</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>Pelacak Sprint 30 Hari &amp; sinkronisasi cloud</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>5× kuota analisis &amp; generasi script AI per akun</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={authLoading}
                  className="w-full px-4 py-2.5 text-xs font-medium text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Masuk Gratis dengan Google
                </button>
              </div>

              <div className="bg-white border border-slate-900 rounded-xl p-6 flex flex-col justify-between space-y-6">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Untuk Eksekusi Intensif &amp; Skala
                  </p>
                  <h3 className="font-display text-lg font-semibold text-slate-900 mt-1">
                    Paket Pro
                  </h3>
                  <p className="font-mono text-3xl font-bold text-slate-900 mt-3 tabular-nums">
                    Rp 49.000
                    <span className="text-xs font-sans font-normal text-slate-500">
                      {" "}
                      / bulan
                    </span>
                  </p>

                  <ul className="mt-6 space-y-2.5 text-sm text-slate-700">
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>Semua fitur Paket Gratis dengan penyimpanan cloud pribadi</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>50× kuota analisis AI (Audit Rebalance, Peluang, Script Niche, Konsultan)</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>Simulasi penuh perubahan alokasi otomatis multi-instrumen</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>Aktivasi instan di dalam workspace untuk uji coba akun</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={authLoading}
                  className="w-full px-4 py-2.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Mulai &amp; Uji Paket Pro
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-slate-200 bg-white">
          <div className="max-w-[1200px] mx-auto px-6 py-16">
            <h2 className="font-display text-xl font-semibold text-slate-900 mb-8">
              Pertanyaan Umum
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
              <div className="space-y-1.5">
                <h3 className="font-semibold text-slate-900">
                  Apakah data portofolio dan usaha saya aman dari pengguna lain?
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  Ya. Setiap akun memiliki ruang dokumen terisolasi yang hanya dapat dibaca dan diubah oleh pemilik akun terverifikasi.
                </p>
              </div>
              <div className="space-y-1.5">
                <h3 className="font-semibold text-slate-900">
                  Apakah LajuModal cocok jika saya belum punya modal investasi besar?
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  Sangat cocok. Fokus utama wadah ini adalah membantu Anda membangun arus kas pertama lewat jasa komputer atau produk digital bermodal minimal, lalu mengalirkan keuntungannya ke aset produktif.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span className="font-display font-semibold text-slate-700">LajuModal</span>
          <span>Wadah Manajemen Portofolio &amp; Peluang Digital untuk Umum</span>
        </div>
      </footer>
    </div>
  );
};
