import React, { useState } from "react";
import { Loader2, Send } from "lucide-react";
import {
  ActiveSprintItem,
  AdvisorMessage,
  PortfolioAsset,
} from "../types/finance";
import { formatIDR } from "../data/initialState";
import { authorizedFetch } from "../services/apiClient";

interface AdvisorViewProps {
  assets: PortfolioAsset[];
  monthlyCashflowIDR: number;
  monthlyExpenseIDR: number;
  autoInvestPercent: number;
  activeSprints: ActiveSprintItem[];
  canUseAI: boolean;
  onConsumeAiCredit: (quota?: {
    planTier: "free" | "pro";
    aiCreditsUsed: number;
    aiCreditsLimit: number;
  }) => Promise<void>;
}

const STARTER_PROMPTS = [
  "Dengan modal Rp 500rb di usia 30, peluang apa yang paling cepat menghasilkan uang berulang dalam 14 hari?",
  "Bagaimana cara kerja model uang agar uang benar-benar menghasilkan uang tanpa mengorbankan biaya hidup?",
  "Evaluasi komposisi portofolio saya sekarang: mana yang harus saya tambah terlebih dahulu?",
  "Buatkan skema pembagian profit dari kerja sampingan supaya 50% tetap aman beranak di portofolio.",
];

export const AdvisorView: React.FC<AdvisorViewProps> = ({
  assets,
  monthlyCashflowIDR,
  monthlyExpenseIDR,
  autoInvestPercent,
  activeSprints,
  canUseAI,
  onConsumeAiCredit,
}) => {
  const totalBalanceIDR = assets.reduce((sum, a) => sum + a.balanceIDR, 0);

  const [messages, setMessages] = useState<AdvisorMessage[]>([
    {
      id: "welcome-1",
      role: "assistant",
      timestamp: "Hari ini",
      content: `Saya membaca kondisi portofolio Anda saat ini: total aset ${formatIDR(
        totalBalanceIDR
      )}, arus investasi rutin ${formatIDR(
        monthlyCashflowIDR
      )}/bulan, dan pengeluaran pokok ${formatIDR(
        monthlyExpenseIDR
      )}/bulan.\n\nTanyakan strategi spesifik apa pun—mulai dari peluang minim modal yang paling cepat dieksekusi minggu ini hingga penataan ulang portofolio menuju kebebasan finansial di usia 30-an.`,
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;
    if (!canUseAI) {
      setError(
        "Kuota analisis AI pada paket Anda sudah habis. Aktifkan Paket Pro di sidebar untuk mendapatkan 50 kuota AI."
      );
      return;
    }

    const userMsg: AdvisorMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await authorizedFetch("/api/ai/advisor", {
        method: "POST",
        body: JSON.stringify({
          question: trimmed,
          history: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          portfolioSnapshot: {
            totalBalanceIDR,
            monthlyCashflowIDR,
            monthlyExpenseIDR,
            autoInvestPercent,
            assets: assets.map((a) => ({
              name: a.name,
              balanceIDR: a.balanceIDR,
            })),
            activeOpportunities: activeSprints.map((s) => ({
              title: s.title,
              projectedMonthlyRecurringIDR: s.projectedMonthlyRecurringIDR,
            })),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menerima jawaban dari strategis AI.");
      }

      const aiMsg: AdvisorMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, aiMsg]);
      await onConsumeAiCredit(data.quota);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menghubungi server AI."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {/* Main Conversational Panel */}
      <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl flex flex-col min-h-[560px] max-h-[75vh]">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Konsultan Strategi Keuangan &amp; Portofolio AI
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Jawaban selalu dihitung berdasarkan data saldo, pengeluaran, dan sprint peluang Anda saat ini
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div className="text-[11px] text-slate-400 mb-1">
                {msg.role === "user" ? "Anda" : "Strategis AI"} · {msg.timestamp}
              </div>
              <div
                className={`max-w-[90%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-50 border border-slate-200 text-slate-800"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Menyusun analisis berbasis angka portofolio Anda...</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(input);
          }}
          className="p-4 border-t border-slate-200 flex items-center gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tulis pertanyaan strategi keuangan atau peluang usaha..."
            className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Kirim</span>
          </button>
        </form>
      </section>

      {/* Context Snapshot & Quick Prompts */}
      <aside className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Konteks Data Aktif
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Total Portofolio</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatIDR(totalBalanceIDR)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Arus Investasi / Bln</span>
              <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                {formatIDR(monthlyCashflowIDR)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pengeluaran Pokok</span>
              <span className="font-mono text-slate-900 tabular-nums">
                {formatIDR(monthlyExpenseIDR)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Sprint Peluang Aktif</span>
              <span className="font-mono text-slate-900 tabular-nums">
                {activeSprints.length} proyek
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Pertanyaan Cepat
          </h3>
          <div className="space-y-2">
            {STARTER_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => sendQuestion(prompt)}
                className="w-full text-left text-xs text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg p-3 transition-colors leading-relaxed"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
};
