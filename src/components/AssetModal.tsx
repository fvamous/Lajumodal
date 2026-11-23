import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { AssetCategory, PortfolioAsset } from "../types/finance";

interface AssetModalProps {
  open: boolean;
  editingAsset: PortfolioAsset | null;
  onClose: () => void;
  onSave: (asset: Omit<PortfolioAsset, "id">, existingId?: string) => void;
}

export const AssetModal: React.FC<AssetModalProps> = ({
  open,
  editingAsset,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [category, setCategory] = useState<AssetCategory>(
    AssetCategory.LIKUID_DARURAT
  );
  const [balanceIDR, setBalanceIDR] = useState("1000000");
  const [targetPercent, setTargetPercent] = useState("25");
  const [annualYieldPercent, setAnnualYieldPercent] = useState("6");
  const [autoDcaMonthlyIDR, setAutoDcaMonthlyIDR] = useState("500000");

  useEffect(() => {
    if (editingAsset) {
      setName(editingAsset.name);
      setTicker(editingAsset.ticker);
      setCategory(editingAsset.category);
      setBalanceIDR(String(editingAsset.balanceIDR));
      setTargetPercent(String(editingAsset.targetPercent));
      setAnnualYieldPercent(String(editingAsset.annualYieldPercent));
      setAutoDcaMonthlyIDR(String(editingAsset.autoDcaMonthlyIDR));
    } else {
      setName("");
      setTicker("");
      setCategory(AssetCategory.PENDAPATAN_TETAP);
      setBalanceIDR("1000000");
      setTargetPercent("20");
      setAnnualYieldPercent("6.5");
      setAutoDcaMonthlyIDR("500000");
    }
  }, [editingAsset, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(
      {
        name: name.trim(),
        ticker: (ticker.trim() || "ASET").toUpperCase(),
        category,
        balanceIDR: Math.max(0, Number(balanceIDR) || 0),
        targetPercent: Math.min(100, Math.max(0, Number(targetPercent) || 0)),
        annualYieldPercent: Math.min(100, Math.max(0, Number(annualYieldPercent) || 0)),
        autoDcaMonthlyIDR: Math.max(0, Number(autoDcaMonthlyIDR) || 0),
      },
      editingAsset?.id
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h2
            id="asset-modal-title"
            className="font-display text-lg font-semibold text-slate-900"
          >
            {editingAsset ? "Ubah Posisi Aset" : "Tambah Aset Portofolio"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Nama Instrumen
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Reksa Dana Obligasi Negara"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Kode / Ticker
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="ORI-026"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono uppercase text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Kelas Aset
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AssetCategory)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:border-slate-900 focus:outline-none"
            >
              {Object.values(AssetCategory).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Nilai Saat Ini (Rp)
              </label>
              <input
                type="number"
                min={0}
                step={50000}
                required
                value={balanceIDR}
                onChange={(e) => setBalanceIDR(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Setoran Rutin / Bulan (Rp)
              </label>
              <input
                type="number"
                min={0}
                step={50000}
                required
                value={autoDcaMonthlyIDR}
                onChange={(e) => setAutoDcaMonthlyIDR(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Target Bobot Portofolio (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                required
                value={targetPercent}
                onChange={(e) => setTargetPercent(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Estimasi Imbal Hasil / Tahun (%)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                step={0.1}
                required
                value={annualYieldPercent}
                onChange={(e) => setAnnualYieldPercent(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Simpan Aset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
