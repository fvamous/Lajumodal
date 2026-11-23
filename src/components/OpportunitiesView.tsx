import React, { useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Copy,
  FileText,
  Loader2,
  PlusCircle,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  ActiveSprintItem,
  AIOfferKit,
  OpportunityBlueprint,
} from "../types/finance";
import { CURATED_OPPORTUNITIES, formatIDR } from "../data/initialState";
import { authorizedFetch } from "../services/apiClient";

interface OpportunitiesViewProps {
  activeSprints: ActiveSprintItem[];
  onActivateOpportunity: (opp: OpportunityBlueprint) => void;
  onToggleStep: (sprintId: string, stepIndex: number) => void;
  onToggleSweepToPortfolio: (sprintId: string) => void;
  onRemoveSprint: (sprintId: string) => void;
  canUseAI: boolean;
  onConsumeAiCredit: (quota?: {
    planTier: "free" | "pro";
    aiCreditsUsed: number;
    aiCreditsLimit: number;
  }) => Promise<void>;
}

type CategoryFilter = "all" | "Jasa Komputer" | "Produk Digital";

export const OpportunitiesView: React.FC<OpportunitiesViewProps> = ({
  activeSprints,
  onActivateOpportunity,
  onToggleStep,
  onToggleSweepToPortfolio,
  onRemoveSprint,
  canUseAI,
  onConsumeAiCredit,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [capitalInput, setCapitalInput] = useState("0");
  const [hoursInput, setHoursInput] = useState("3");
  const [skillsInput, setSkillsInput] = useState(
    "Hanya bermodal komputer, internet, spreadsheet, browser, penulisan/desain ringan"
  );
  const [targetIncomeInput, setTargetIncomeInput] = useState("3000000");

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiStrategyNote, setAiStrategyNote] = useState<string | null>(null);
  const [aiOpportunities, setAiOpportunities] = useState<OpportunityBlueprint[]>([]);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // AI Offer Kit Modal State
  const [selectedForKit, setSelectedForKit] = useState<OpportunityBlueprint | null>(
    null
  );
  const [customNiche, setCustomNiche] = useState("UMKM kuliner & toko online lokal");
  const [kitLoading, setKitLoading] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);
  const [offerKit, setOfferKit] = useState<AIOfferKit | null>(null);

  const allBlueprints = [...aiOpportunities, ...CURATED_OPPORTUNITIES];
  const filteredBlueprints =
    categoryFilter === "all"
      ? allBlueprints
      : allBlueprints.filter((b) => b.categoryTag === categoryFilter);

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Fallback ignored if clipboard permission denied
    }
  };

  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseAI) {
      setAiError(
        "Kuota analisis AI Anda sudah habis. Aktifkan Paket Pro di sidebar untuk membuka 50 kuota AI."
      );
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await authorizedFetch("/api/ai/opportunities", {
        method: "POST",
        body: JSON.stringify({
          availableCapitalIDR: Number(capitalInput) || 0,
          hoursPerDay: Number(hoursInput) || 2,
          skills: skillsInput,
          targetMonthlyIncomeIDR: Number(targetIncomeInput) || 3000000,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat rekomendasi peluang AI.");
      }

      const mapped: OpportunityBlueprint[] = (data.opportunities || []).map(
        (
          item: {
            title: string;
            categoryTag?: string;
            modelType: string;
            requiredCapitalIDR: number;
            daysToFirstCash: number;
            projectedMonthlyRecurringIDR: number;
            autoSweepPercent: number;
            whereToFindBuyers?: string;
            sampleOfferScript?: string;
            whyItWorks: string;
            first7DaysSteps: string[];
          },
          idx: number
        ) => {
          const cap = Number(item.requiredCapitalIDR) || 0;
          const tier: OpportunityBlueprint["capitalTier"] =
            cap <= 500000
              ? "0-500rb"
              : cap <= 2000000
              ? "500rb-2jt"
              : "2jt-5jt";
          const catTag: OpportunityBlueprint["categoryTag"] =
            item.categoryTag === "Produk Digital"
              ? "Produk Digital"
              : "Jasa Komputer";
          return {
            id: `ai-opp-${Date.now()}-${idx}`,
            title: item.title,
            categoryTag: catTag,
            modelType: item.modelType,
            capitalTier: tier,
            requiredCapitalIDR: cap,
            daysToFirstCash: Number(item.daysToFirstCash) || 7,
            projectedMonthlyRecurringIDR:
              Number(item.projectedMonthlyRecurringIDR) || 2000000,
            autoSweepPercent: Number(item.autoSweepPercent) || 40,
            whereToFindBuyers:
              item.whereToFindBuyers ||
              "Google Maps bisnis lokal, marketplace seller, dan grup komunitas.",
            sampleOfferScript:
              item.sampleOfferScript ||
              "Halo, saya bantu selesaikan kebutuhan operasional usaha Anda lebih cepat dengan biaya terjangkau.",
            whyItWorks: item.whyItWorks,
            first7DaysSteps: item.first7DaysSteps || [],
            isAI: true,
          };
        }
      );

      setAiStrategyNote(data.strategyNote || null);
      setAiOpportunities(mapped);
      await onConsumeAiCredit(data.quota);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menghubungi server."
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleOpenOfferKit = (opp: OpportunityBlueprint) => {
    setSelectedForKit(opp);
    setOfferKit(null);
    setKitError(null);
  };

  const handleGenerateOfferKit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForKit) return;
    if (!canUseAI) {
      setKitError(
        "Kuota analisis AI Anda sudah habis. Aktifkan Paket Pro di sidebar untuk melanjutkan."
      );
      return;
    }
    setKitLoading(true);
    setKitError(null);
    try {
      const res = await authorizedFetch("/api/ai/offer-kit", {
        method: "POST",
        body: JSON.stringify({
          opportunityTitle: selectedForKit.title,
          categoryTag: selectedForKit.categoryTag,
          customNiche,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat paket penawaran AI.");
      }
      setOfferKit(data);
      await onConsumeAiCredit(data.quota);
    } catch (err) {
      setKitError(
        err instanceof Error ? err.message : "Gagal menghubungi server AI."
      );
    } finally {
      setKitLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Active 30-Day Execution Sprints */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Sprint Eksekusi 30 Hari Anda ({activeSprints.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Fokus menghasilkan uang tunai pertama bermodal komputer, lalu hubungkan persentase profitnya ke portofolio investasi
            </p>
          </div>
        </div>

        {activeSprints.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-slate-900">
              Belum ada sprint penghasil uang yang diaktifkan
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Pilih salah satu Jasa Komputer atau Produk Digital di bawah ini, salin naskah penawarannya, dan mulai eksekusi hari ini.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-5">
            {activeSprints.map((sprint) => {
              const completedCount = sprint.completedSteps.filter(Boolean).length;
              const sweptCash = Math.round(
                sprint.projectedMonthlyRecurringIDR * (sprint.autoSweepPercent / 100)
              );
              return (
                <div
                  key={sprint.id}
                  className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between bg-slate-50/40"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-500">
                          {sprint.categoryTag} · Modal {formatIDR(sprint.requiredCapitalIDR)}
                        </p>
                        <h3 className="font-display text-sm font-semibold text-slate-900 mt-1">
                          {sprint.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveSprint(sprint.id)}
                        aria-label={`Hapus ${sprint.title}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-medium text-slate-700">
                        Kemajuan 7 Hari Pertama ({completedCount}/{sprint.first7DaysSteps.length})
                      </p>
                      {sprint.first7DaysSteps.map((step, idx) => {
                        const done = sprint.completedSteps[idx];
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => onToggleStep(sprint.id, idx)}
                            className="w-full flex items-start gap-2.5 text-left text-xs py-1 text-slate-700 hover:text-slate-900"
                          >
                            {done ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <Circle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
                            )}
                            <span className={done ? "line-through text-slate-400" : ""}>
                              {step}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs">
                      <span className="text-slate-500">Auto-Sweep ({sprint.autoSweepPercent}%): </span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        +{formatIDR(sweptCash)}/bln
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleSweepToPortfolio(sprint.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        sprint.sweptToPortfolio
                          ? "bg-emerald-700 text-white hover:bg-emerald-800"
                          : "bg-white border border-slate-200 text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      {sprint.sweptToPortfolio && <Check className="h-3.5 w-3.5" />}
                      <span>
                        {sprint.sweptToPortfolio
                          ? "Terhubung ke Portofolio"
                          : "Simulasikan ke Portofolio"}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* AI Personalized Computer-Only Opportunity Generator */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="pb-4 border-b border-slate-100">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Generator Peluang Bermodal Komputer &amp; Produk Digital (AI)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Masukkan modal uang (bisa Rp 0), jam tersedia, dan kemampuan dasar Anda untuk menghasilkan jalur tercepat memperoleh uang tunai
          </p>
        </div>

        <form onSubmit={handleGenerateAI} className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Modal Tunai (Rp)
            </label>
            <input
              type="number"
              min={0}
              step={50000}
              value={capitalInput}
              onChange={(e) => setCapitalInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Waktu Luang (Jam / Hari)
            </label>
            <input
              type="number"
              min={1}
              max={12}
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Target Pemasukan / Bln (Rp)
            </label>
            <input
              type="number"
              min={500000}
              step={500000}
              value={targetIncomeInput}
              onChange={(e) => setTargetIncomeInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Keahlian / Alat yang Dimiliki
            </label>
            <input
              type="text"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="Misal: komputer, excel, canva, nulis"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-500">
              AI memprioritaskan jasa B2B bermodal komputer dan produk digital praktis yang bisa dijual dalam 5–14 hari.
            </p>
            <button
              type="submit"
              disabled={aiLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {aiLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>{aiLoading ? "Menyusun Peluang..." : "Buat Rencana Uang Pertama"}</span>
            </button>
          </div>
        </form>

        {aiError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {aiError}
          </div>
        )}

        {aiStrategyNote && (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Catatan Eksekusi AI: </span>
            {aiStrategyNote}
          </div>
        )}
      </section>

      {/* Catalog of Computer-Only Services & Digital Products */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Katalog Jasa Komputer &amp; Produk Digital Siap Jual
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Lengkap dengan lokasi mencari pembeli, estimasi hari cair pertama, dan naskah penawaran siap salin
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start sm:self-auto">
            {(
              [
                { id: "all", label: "Semua" },
                { id: "Jasa Komputer", label: "Jasa Komputer" },
                { id: "Produk Digital", label: "Produk Digital" },
              ] as { id: CategoryFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === tab.id
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredBlueprints.map((opp) => {
            const alreadyActive = activeSprints.some((s) => s.title === opp.title);
            return (
              <article
                key={opp.id}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{opp.categoryTag}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{opp.modelType}</span>
                    <span aria-hidden="true"> · </span>
                    <span>Cair ~{opp.daysToFirstCash} hari</span>
                  </div>

                  <h3 className="font-display text-base font-semibold text-slate-900 mt-1.5">
                    {opp.title}
                  </h3>

                  <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                    {opp.whyItWorks}
                  </p>

                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
                    <div>
                      <p className="text-[11px] text-slate-500">Modal Tunai</p>
                      <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                        {formatIDR(opp.requiredCapitalIDR)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Potensi / Bln</p>
                      <p className="font-mono text-sm font-semibold text-emerald-700 tabular-nums mt-0.5">
                        {formatIDR(opp.projectedMonthlyRecurringIDR)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Auto-Sweep</p>
                      <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                        {opp.autoSweepPercent}% ke Aset
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    <p className="text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">Tempat Cari Pembeli: </span>
                      {opp.whereToFindBuyers}
                    </p>
                  </div>

                  <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-semibold text-slate-700">
                        Contoh Naskah Penawaran Siap Kirim:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(opp.sampleOfferScript, opp.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap shrink-0"
                      >
                        {copiedId === opp.id ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span className="text-emerald-700">Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 italic leading-relaxed">
                      &ldquo;{opp.sampleOfferScript}&rdquo;
                    </p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-700 mb-2">
                      3 Langkah Eksekusi Minggu Pertama:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-xs text-slate-600">
                      {opp.first7DaysSteps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenOfferKit(opp)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Sesuaikan Niche AI</span>
                  </button>

                  <button
                    type="button"
                    disabled={alreadyActive}
                    onClick={() => onActivateOpportunity(opp)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      alreadyActive
                        ? "bg-slate-100 text-slate-500 cursor-default"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>
                      {alreadyActive ? "Sudah di Sprint Aktif" : "Aktifkan Sprint"}
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* AI Offer Kit Modal */}
      {selectedForKit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offer-kit-title"
        >
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-white border border-slate-200 p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-500">
                  {selectedForKit.categoryTag} · Pembuat Paket Penawaran AI
                </p>
                <h3
                  id="offer-kit-title"
                  className="font-display text-base font-semibold text-slate-900 mt-0.5"
                >
                  {selectedForKit.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedForKit(null)}
                aria-label="Tutup modal"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateOfferKit} className="space-y-3">
              <label className="block text-xs font-medium text-slate-700">
                Target Pembeli / Niche Spesifik yang Ingin Anda Tuju Hari Ini:
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  required
                  value={customNiche}
                  onChange={(e) => setCustomNiche(e.target.value)}
                  placeholder="Contoh: Klinik gigi, bengkel motor, kedai kopi, atau reseller skincare"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={kitLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {kitLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{kitLoading ? "Menyusun..." : "Buat Paket & Script"}</span>
                </button>
              </div>
            </form>

            {kitError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                {kitError}
              </div>
            )}

            {offerKit && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-display text-sm font-semibold text-slate-900">
                    {offerKit.offerTitle}
                  </h4>
                  <span className="font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                    Harga Saran: {formatIDR(offerKit.suggestedPriceIDR)}
                  </span>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">
                    3 Sumber Pembeli Hari Ini ({offerKit.targetNiche}):
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-xs text-slate-600">
                    {offerKit.whereToFindBuyersToday.map((src, i) => (
                      <li key={i}>{src}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Naskah Penawaran Siap Kirim (WhatsApp / DM / Deskripsi):
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(offerKit.readyToSendScript, "kit-script")
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900"
                    >
                      {copiedId === "kit-script" ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Salin Naskah</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {offerKit.readyToSendScript}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">
                    Checklist Pengiriman Hasil agar Pembeli Puas:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-slate-600">
                    {offerKit.deliveryChecklist.map((chk, i) => (
                      <li key={i}>{chk}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
