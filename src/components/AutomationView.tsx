import React, { useMemo } from "react";
import { AllocationSplit, AutomationRule } from "../types/finance";
import { formatIDR } from "../data/initialState";

interface AutomationViewProps {
  rules: AutomationRule[];
  onToggleRule: (id: string) => void;
  split: AllocationSplit;
  onUpdateSplit: (newSplit: AllocationSplit) => void;
  monthlyTotalInflowIDR: number;
}

export const AutomationView: React.FC<AutomationViewProps> = ({
  rules,
  onToggleRule,
  split,
  onUpdateSplit,
  monthlyTotalInflowIDR,
}) => {
  const totalPercent =
    split.emergencyPercent +
    split.fixedIncomePercent +
    split.equityDividendPercent +
    split.businessSeedPercent;

  const isBalanced = totalPercent === 100;

  const handleFieldChange = (field: keyof AllocationSplit, val: number) => {
    onUpdateSplit({
      ...split,
      [field]: Math.max(0, Math.min(100, val)),
    });
  };

  const handleNormalize = () => {
    if (totalPercent === 0) {
      onUpdateSplit({
        emergencyPercent: 35,
        fixedIncomePercent: 25,
        equityDividendPercent: 30,
        businessSeedPercent: 10,
      });
      return;
    }
    const e = Math.round((split.emergencyPercent / totalPercent) * 100);
    const f = Math.round((split.fixedIncomePercent / totalPercent) * 100);
    const q = Math.round((split.equityDividendPercent / totalPercent) * 100);
    const b = 100 - e - f - q;
    onUpdateSplit({
      emergencyPercent: e,
      fixedIncomePercent: f,
      equityDividendPercent: q,
      businessSeedPercent: Math.max(0, b),
    });
  };

  const monthlyBuckets = useMemo(() => {
    const base = monthlyTotalInflowIDR;
    return [
      {
        label: "Dana Darurat & Pasar Uang",
        pct: split.emergencyPercent,
        monthlyIDR: Math.round((base * split.emergencyPercent) / 100),
        annualIDR: Math.round(((base * split.emergencyPercent) / 100) * 12),
        purpose: "Penyangga likuiditas 4–6 bulan agar investasi tidak pernah dijual terpaksa",
      },
      {
        label: "Obligasi & SBN Ritel",
        pct: split.fixedIncomePercent,
        monthlyIDR: Math.round((base * split.fixedIncomePercent) / 100),
        annualIDR: Math.round(((base * split.fixedIncomePercent) / 100) * 12),
        purpose: "Arus kupon bulanan stabil sebagai penggerak pendapatan pasif awal",
      },
      {
        label: "Saham Dividen & ETF Indeks",
        pct: split.equityDividendPercent,
        monthlyIDR: Math.round((base * split.equityDividendPercent) / 100),
        annualIDR: Math.round(((base * split.equityDividendPercent) / 100) * 12),
        purpose: "Mesin pertumbuhan jangka panjang usia 30–40 tahun + dividen tahunan",
      },
      {
        label: "Kas Putar Peluang Usaha",
        pct: split.businessSeedPercent,
        monthlyIDR: Math.round((base * split.businessSeedPercent) / 100),
        annualIDR: Math.round(((base * split.businessSeedPercent) / 100) * 12),
        purpose: "Modal mikro untuk menguji jasa digital, iklan uji coba, atau tools AI",
      },
    ];
  }, [monthlyTotalInflowIDR, split]);

  return (
    <div className="space-y-8">
      {/* Cash Sweep Auto-Splitter */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Aturan Penyisihan Otomatis Arus Kas (Auto-Sweep)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Setiap rupiah yang masuk dari gaji atau peluang sampingan dibagi otomatis ke 4 kantong produktif sebelum dikonsumsi
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className={`font-mono text-xs font-semibold tabular-nums ${
                isBalanced ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              Total Alokasi: {totalPercent}%
            </span>
            {!isBalanced && (
              <button
                type="button"
                onClick={handleNormalize}
                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Sesuaikan ke 100%
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5">
          {[
            {
              key: "emergencyPercent" as const,
              title: "Dana Darurat & RDPU",
              val: split.emergencyPercent,
            },
            {
              key: "fixedIncomePercent" as const,
              title: "Obligasi & SBN Ritel",
              val: split.fixedIncomePercent,
            },
            {
              key: "equityDividendPercent" as const,
              title: "Saham Dividen & ETF Indeks",
              val: split.equityDividendPercent,
            },
            {
              key: "businessSeedPercent" as const,
              title: "Kas Putar Peluang Usaha",
              val: split.businessSeedPercent,
            },
          ].map((item) => (
            <div key={item.key} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{item.title}</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {item.val}% · {formatIDR((monthlyTotalInflowIDR * item.val) / 100)}/bln
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={item.val}
                onChange={(e) => handleFieldChange(item.key, Number(e.target.value))}
                className="w-full accent-slate-900 cursor-pointer"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Toggleable Automation Triggers */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Aturan Otomatisasi Portofolio &amp; Arus Uang
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Aktifkan disiplin eksekusi otomatis agar keputusan investasi bebas emosi
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {rule.title}
                  </h3>
                  <span className="text-xs text-slate-500">
                    · {rule.enabled ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Pemicu: {rule.trigger}
                </p>
                <p className="text-xs text-slate-700">{rule.actionSummary}</p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={rule.enabled}
                onClick={() => onToggleRule(rule.id)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  rule.enabled ? "bg-slate-900" : "bg-slate-200"
                }`}
              >
                <span className="sr-only">Aktifkan {rule.title}</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                    rule.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 12-Month Automated Allocation Ledger */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Jadwal Akumulasi Otomatis 12 Bulan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Berdasarkan arus masuk berulang saat ini sebesar {formatIDR(monthlyTotalInflowIDR)} / bulan
            </p>
          </div>
          <span className="font-mono text-sm font-semibold text-emerald-700 tabular-nums">
            Total Setoran 1 Tahun: {formatIDR(monthlyTotalInflowIDR * 12)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-6">Kantong Aset &amp; Fungsi</th>
                <th className="py-3 px-4 text-right">Porsi</th>
                <th className="py-3 px-4 text-right">Setoran / Bulan</th>
                <th className="py-3 px-6 text-right">Akumulasi 12 Bulan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {monthlyBuckets.map((bucket) => (
                <tr key={bucket.label} className="hover:bg-slate-50/80">
                  <td className="py-3.5 px-6">
                    <div className="font-medium text-slate-900">{bucket.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{bucket.purpose}</div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-700 tabular-nums">
                    {bucket.pct}%
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-900 tabular-nums">
                    {formatIDR(bucket.monthlyIDR)}
                  </td>
                  <td className="py-3.5 px-6 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {formatIDR(bucket.annualIDR)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
