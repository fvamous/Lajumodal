import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  Edit3,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  AIRebalanceResult,
  AssetCategory,
  PortfolioAsset,
  WorkspaceTab,
} from "../types/finance";
import { formatCompactIDR, formatIDR } from "../data/initialState";
import { authorizedFetch } from "../services/apiClient";

interface OverviewViewProps {
  assets: PortfolioAsset[];
  monthlyExpenseIDR: number;
  onUpdateMonthlyExpense: (val: number) => void;
  sideCashflowIDR: number;
  onAddAssetClick: () => void;
  onEditAssetClick: (asset: PortfolioAsset) => void;
  onDeleteAsset: (id: string) => void;
  onNavigateTab: (tab: WorkspaceTab) => void;
  canUseAI: boolean;
  onConsumeAiCredit: (quota?: {
    planTier: "free" | "pro";
    aiCreditsUsed: number;
    aiCreditsLimit: number;
  }) => Promise<void>;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  assets,
  monthlyExpenseIDR,
  onUpdateMonthlyExpense,
  sideCashflowIDR,
  onAddAssetClick,
  onEditAssetClick,
  onDeleteAsset,
  onNavigateTab,
  canUseAI,
  onConsumeAiCredit,
}) => {
  const [simReturnPercent, setSimReturnPercent] = useState(10);
  const [extraMonthlyIDR, setExtraMonthlyIDR] = useState(1500000);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AIRebalanceResult | null>(null);

  const metrics = useMemo(() => {
    const totalBalance = assets.reduce((acc, a) => acc + a.balanceIDR, 0);
    const totalDca = assets.reduce((acc, a) => acc + a.autoDcaMonthlyIDR, 0);
    const weightedYield =
      totalBalance > 0
        ? assets.reduce(
            (acc, a) => acc + a.balanceIDR * (a.annualYieldPercent / 100),
            0
          ) / totalBalance
        : 0;
    const annualPassive = totalBalance * weightedYield;
    const monthlyPassive = annualPassive / 12;

    const emergencyBalance = assets
      .filter((a) => a.category === AssetCategory.LIKUID_DARURAT)
      .reduce((acc, a) => acc + a.balanceIDR, 0);
    const emergencyMonths =
      monthlyExpenseIDR > 0 ? emergencyBalance / monthlyExpenseIDR : 0;

    return {
      totalBalance,
      totalDca,
      weightedYieldPercent: weightedYield * 100,
      monthlyPassive,
      annualPassive,
      emergencyMonths,
    };
  }, [assets, monthlyExpenseIDR]);

  // 10-year compounding simulation: Age 30 to 40
  const projectionSeries = useMemo(() => {
    const years = 11; // year 0..10 (age 30..40)
    const r = simReturnPercent / 100;
    const monthlyRate = r / 12;
    const activeMonthlyInput = metrics.totalDca + sideCashflowIDR + extraMonthlyIDR;

    const points: {
      age: number;
      principalOnly: number;
      compounded: number;
      passivePerMonth: number;
    }[] = [];

    let balCompounded = metrics.totalBalance;
    let balNoYield = metrics.totalBalance;

    for (let y = 0; y < years; y++) {
      points.push({
        age: 30 + y,
        principalOnly: balNoYield,
        compounded: balCompounded,
        passivePerMonth: (balCompounded * r) / 12,
      });

      for (let m = 0; m < 12; m++) {
        balCompounded = balCompounded * (1 + monthlyRate) + activeMonthlyInput;
        balNoYield += activeMonthlyInput;
      }
    }
    return points;
  }, [metrics.totalBalance, metrics.totalDca, sideCashflowIDR, extraMonthlyIDR, simReturnPercent]);

  const age35Point = projectionSeries[5];
  const age40Point = projectionSeries[10];

  const handleRunAIAudit = async () => {
    if (!canUseAI) {
      setAuditError(
        "Kuota analisis AI pada paket Anda sudah habis. Aktifkan Paket Pro di sidebar untuk mendapatkan 50 kuota AI."
      );
      return;
    }
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await authorizedFetch("/api/ai/rebalance", {
        method: "POST",
        body: JSON.stringify({
          assets,
          monthlyCashflowIDR: metrics.totalDca + sideCashflowIDR,
          monthlyExpenseIDR,
          age: 30,
          riskProfile: "Moderat-Agresif (Bangun Fondasi Usia 30)",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menjalankan audit AI.");
      }
      setAuditResult(data);
      await onConsumeAiCredit(data.quota);
    } catch (err) {
      setAuditError(
        err instanceof Error ? err.message : "Terjadi kesalahan koneksi server."
      );
    } finally {
      setAuditLoading(false);
    }
  };

  // SVG chart scaling
  const chartWidth = 680;
  const chartHeight = 220;
  const padX = 16;
  const padY = 20;
  const maxVal = Math.max(
    ...projectionSeries.map((p) => p.compounded),
    10_000_000
  );

  const toX = (idx: number) =>
    padX + (idx / (projectionSeries.length - 1)) * (chartWidth - padX * 2);
  const toY = (val: number) =>
    chartHeight - padY - (val / maxVal) * (chartHeight - padY * 2);

  const compoundedPath = projectionSeries
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${toX(idx)} ${toY(p.compounded)}`)
    .join(" ");
  const principalPath = projectionSeries
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${toX(idx)} ${toY(p.principalOnly)}`)
    .join(" ");
  const areaPath = `${compoundedPath} L ${toX(projectionSeries.length - 1)} ${
    chartHeight - padY
  } L ${toX(0)} ${chartHeight - padY} Z`;

  return (
    <div className="space-y-8">
      {/* 3-Stage Money Model Architecture */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Arsitektur Model Uang: Dari Minim Modal ke Bunga Majemuk
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Prinsip inti di usia 30: ciptakan arus berulang minim modal terlebih dahulu, kunci penyisihan otomatis sebelum konsumsi, lalu biarkan aset produktif menggandakan diri.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab("opportunities")}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 self-start md:self-auto"
          >
            <span>Cari Peluang Minim Modal</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">
              01. Arus Masuk Berulang
            </p>
            <p className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {formatIDR(metrics.totalDca + sideCashflowIDR)} / bln
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Gabungan setoran rutin ({formatCompactIDR(metrics.totalDca)}) dan arus kas peluang aktif ({formatCompactIDR(sideCashflowIDR)}).
            </p>
          </div>

          <div className="space-y-1.5 md:border-l md:border-slate-100 md:pl-6">
            <p className="text-xs font-medium text-slate-500">
              02. Otomatisasi Alokasi AI
            </p>
            <p className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
              {metrics.emergencyMonths.toFixed(1)}x Pengeluaran
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Dana darurat likuid menjaga Anda tidak pernah mencairkan investasi saat pasar turun. Target aman: 4–6 bulan.
            </p>
          </div>

          <div className="space-y-1.5 md:border-l md:border-slate-100 md:pl-6">
            <p className="text-xs font-medium text-slate-500">
              03. Uang Menghasilkan Uang
            </p>
            <p className="font-mono text-lg font-semibold text-emerald-700 tabular-nums">
              +{formatIDR(metrics.monthlyPassive)} / bln
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Imbal hasil pasif rata-rata {metrics.weightedYieldPercent.toFixed(1)}%/tahun yang langsung diputar kembali (DRIP).
            </p>
          </div>
        </div>
      </section>

      {/* Primary KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Total Nilai Portofolio</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatIDR(metrics.totalBalance)}
          </p>
          <p className="mt-1.5 text-xs text-slate-600">
            {assets.length} instrumen aktif · Imbal hasil {metrics.weightedYieldPercent.toFixed(1)}%/thn
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Pengeluaran Pokok / Bulan</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-sm text-slate-500">Rp</span>
            <input
              type="number"
              min={500000}
              step={250000}
              aria-label="Pengeluaran pokok bulanan"
              value={monthlyExpenseIDR}
              onChange={(e) => onUpdateMonthlyExpense(Math.max(0, Number(e.target.value) || 0))}
              className="w-full font-mono text-xl font-semibold text-slate-900 tabular-nums border-b border-slate-200 focus:border-slate-900 focus:outline-none pb-0.5"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-600">
            Rasio ketahanan likuid: {metrics.emergencyMonths.toFixed(1)} bulan
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Proyeksi Usia 35 (5 Tahun)</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatCompactIDR(age35Point.compounded)}
          </p>
          <p className="mt-1.5 text-xs text-emerald-700 font-mono tabular-nums">
            Pasif ~{formatCompactIDR(age35Point.passivePerMonth)}/bln
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Proyeksi Usia 40 (10 Tahun)</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatCompactIDR(age40Point.compounded)}
          </p>
          <p className="mt-1.5 text-xs text-emerald-700 font-mono tabular-nums">
            Pasif ~{formatCompactIDR(age40Point.passivePerMonth)}/bln
          </p>
        </div>
      </section>

      {/* Interactive Compounding Trajectory Chart */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Simulasi Efek Majemuk Usia 30 ke 40
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Perbandingan total setoran tunai tanpa imbal hasil vs portofolio terkompon otomatis
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-slate-900" />
                  <span>Portofolio Majemuk</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-slate-300" />
                  <span>Akumulasi Pokok Saja</span>
                </span>
              </div>
            </div>

            <div className="w-full overflow-hidden">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-56 overflow-visible"
                role="img"
                aria-label="Grafik proyeksi pertumbuhan aset usia 30 hingga 40"
              >
                <defs>
                  <linearGradient id="compoundedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f172a" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {[0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = chartHeight - padY - ratio * (chartHeight - padY * 2);
                  return (
                    <g key={ratio}>
                      <line
                        x1={padX}
                        y1={y}
                        x2={chartWidth - padX}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padX}
                        y={y - 4}
                        className="fill-slate-400 text-[10px] font-mono"
                      >
                        {formatCompactIDR(maxVal * ratio)}
                      </text>
                    </g>
                  );
                })}

                <path d={areaPath} fill="url(#compoundedFill)" />
                <path
                  d={principalPath}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
                <path
                  d={compoundedPath}
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth={2.5}
                />

                {projectionSeries.map((pt, idx) => (
                  <g key={pt.age}>
                    <circle
                      cx={toX(idx)}
                      cy={toY(pt.compounded)}
                      r={idx === 0 || idx === 5 || idx === 10 ? 4 : 2.5}
                      className="fill-slate-900"
                    />
                    <text
                      x={toX(idx)}
                      y={chartHeight - 2}
                      textAnchor="middle"
                      className="fill-slate-500 text-[11px] font-mono"
                    >
                      {pt.age} th
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-5 lg:border-l lg:border-slate-100 lg:pl-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-700">
                    Tambahan Arus Kas Baru / Bulan
                  </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatIDR(extraMonthlyIDR)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10000000}
                  step={250000}
                  value={extraMonthlyIDR}
                  onChange={(e) => setExtraMonthlyIDR(Number(e.target.value))}
                  className="w-full accent-slate-900 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Simulasikan kenaikan arus kas dari peluang minim modal atau efisiensi biaya.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-700">
                    Target Imbal Hasil Gabungan / Tahun
                  </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {simReturnPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={18}
                  step={0.5}
                  value={simReturnPercent}
                  onChange={(e) => setSimReturnPercent(Number(e.target.value))}
                  className="w-full accent-slate-900 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Portofolio defensif 5–7% · Berimbang 8–11% · Agresif bertumbuh 12–16%.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Total Setoran Pokok (10 Thn)</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {formatCompactIDR(age40Point.principalOnly)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Keuntungan Efek Majemuk</span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                  +{formatCompactIDR(age40Point.compounded - age40Point.principalOnly)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio Holdings Table & AI Rebalance Panel */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-5 border-b border-slate-200">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Alokasi Portofolio &amp; Audit Rebalance AI
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola posisi aset Anda lalu jalankan audit otomatis untuk pembagian DCA bulanan yang optimal
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onAddAssetClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Aset</span>
            </button>
            <button
              type="button"
              onClick={handleRunAIAudit}
              disabled={auditLoading || assets.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${auditLoading ? "animate-spin" : ""}`} />
              <span>{auditLoading ? "Menganalisis..." : "Audit & Rebalance AI"}</span>
            </button>
          </div>
        </div>

        {assets.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">Belum ada aset di portofolio Anda</p>
            <p className="text-xs text-slate-500 mt-1">
              Mulai catat simpanan likuid atau instrumen investasi pertama Anda untuk menghitung proyeksi.
            </p>
            <button
              type="button"
              onClick={onAddAssetClick}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Catat Aset Pertama</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-6">Instrumen &amp; Kelas</th>
                  <th className="py-3 px-4 text-right">Saldo Saat Ini</th>
                  <th className="py-3 px-4 text-right">Bobot Aktual</th>
                  <th className="py-3 px-4 text-right">Target</th>
                  <th className="py-3 px-4 text-right">Yield / Thn</th>
                  <th className="py-3 px-4 text-right">Auto-DCA / Bln</th>
                  <th className="py-3 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {assets.map((asset) => {
                  const actualPct =
                    metrics.totalBalance > 0
                      ? (asset.balanceIDR / metrics.totalBalance) * 100
                      : 0;
                  const drift = actualPct - asset.targetPercent;
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-6">
                        <div className="font-medium text-slate-900">{asset.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <span className="font-mono">{asset.ticker}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{asset.category}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-900 tabular-nums">
                        {formatIDR(asset.balanceIDR)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span className="text-slate-900">{actualPct.toFixed(1)}%</span>
                        <span
                          className={`block text-[11px] ${
                            Math.abs(drift) > 5
                              ? "text-amber-600"
                              : "text-slate-400"
                          }`}
                        >
                          {drift >= 0 ? "+" : ""}
                          {drift.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {asset.targetPercent}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700 tabular-nums">
                        {asset.annualYieldPercent.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-900 tabular-nums">
                        {formatIDR(asset.autoDcaMonthlyIDR)}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditAssetClick(asset)}
                            aria-label={`Ubah ${asset.name}`}
                            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAsset(asset.id)}
                            aria-label={`Hapus ${asset.name}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {auditError && (
          <div className="mx-6 my-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {auditError}
          </div>
        )}

        {auditResult && (
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-900" />
                <h4 className="font-display text-sm font-semibold text-slate-900">
                  Hasil Audit Rebalance AI
                </h4>
              </div>
              <span className="text-xs font-medium text-slate-700">
                Status Dana Darurat:{" "}
                <strong
                  className={
                    auditResult.emergencyFundStatus.toLowerCase().includes("aman")
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }
                >
                  {auditResult.emergencyFundStatus}
                </strong>
              </span>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              {auditResult.summary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {auditResult.monthlyDcaPlan.map((plan, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-lg p-4 space-y-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {plan.assetName}
                    </span>
                    <span className="font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                      {formatIDR(plan.recommendedAmountIDR)} / bln
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">
                    Target Bobot Ideal: {plan.recommendedTargetPercent}%
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {plan.rationale}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <p className="text-xs font-semibold text-slate-700 mb-2">
                Langkah Prioritas Minggu Ini:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-slate-700">
                {auditResult.nextActions.map((act, i) => (
                  <li key={i}>{act}</li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
