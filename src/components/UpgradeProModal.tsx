import React, { useEffect, useState } from "react";
import { Check, Copy, CreditCard, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { authorizedFetch } from "../services/apiClient";
import { formatIDR } from "../data/initialState";

interface MidtransConfigResponse {
  configured: boolean;
  clientKey: string;
  isProduction: boolean;
  keyModeMismatch?: boolean;
  serverKeyValid?: boolean | null;
  snapJsUrl: string;
  priceIDR: number;
  proCreditsLimit: number;
  webhookUrl: string;
}

interface SnapResult {
  order_id?: string;
  transaction_status?: string;
  status_message?: string;
}

declare global {
  interface Window {
    snap?: {
      pay: (
        snapToken: string,
        callbacks?: {
          onSuccess?: (result: SnapResult) => void;
          onPending?: (result: SnapResult) => void;
          onError?: (result: SnapResult) => void;
          onClose?: () => void;
        }
      ) => void;
    };
  }
}

interface UpgradeProModalProps {
  open: boolean;
  onClose: () => void;
  pendingOrderId: string | null;
  onSaveReceipt: (
    orderId: string,
    status: "pending" | "settlement" | "capture"
  ) => Promise<void>;
  onVerifiedPro: (orderId: string, aiCreditsLimit: number) => void;
}

function loadSnapScript(snapJsUrl: string, clientKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("midtrans-snap-script") as HTMLScriptElement | null;
    if (existing) {
      const sameUrl = existing.getAttribute("src") === snapJsUrl;
      const sameKey = existing.getAttribute("data-client-key") === clientKey;
      if (sameUrl && sameKey && window.snap) {
        resolve();
        return;
      }
      if (!sameUrl || !sameKey || existing.dataset.status === "error" || !window.snap) {
        existing.remove();
        delete window.snap;
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Gagal memuat Midtrans Snap.js")),
          { once: true }
        );
        return;
      }
    }

    if (window.snap) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = "midtrans-snap-script";
    script.src = snapJsUrl;
    script.setAttribute("data-client-key", clientKey);
    script.async = true;
    script.dataset.status = "loading";
    script.onload = () => {
      script.dataset.status = "loaded";
      resolve();
    };
    script.onerror = () => {
      script.dataset.status = "error";
      reject(new Error("Gagal memuat Midtrans Snap.js"));
    };
    document.body.appendChild(script);
  });
}

export const UpgradeProModal: React.FC<UpgradeProModalProps> = ({
  open,
  onClose,
  pendingOrderId,
  onSaveReceipt,
  onVerifiedPro,
}) => {
  const [config, setConfig] = useState<MidtransConfigResponse | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(
    pendingOrderId
  );
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  useEffect(() => {
    setActiveOrderId(pendingOrderId);
  }, [pendingOrderId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStatusMessage(null);
    setRedirectUrl(null);
    setLoadingConfig(true);
    fetch("/api/payments/midtrans/config?check=1")
      .then((res) => res.json())
      .then((data: MidtransConfigResponse) => {
        setConfig(data);
      })
      .catch(() => {
        setError("Gagal memuat konfigurasi Midtrans dari server.");
      })
      .finally(() => setLoadingConfig(false));
  }, [open]);

  if (!open) return null;

  const verifyOrder = async (orderId: string) => {
    setVerifying(true);
    setError(null);
    try {
      const res = await authorizedFetch("/api/payments/midtrans/verify", {
        method: "POST",
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memverifikasi transaksi Midtrans.");
      }

      if (data.verified) {
        await onSaveReceipt(orderId, "settlement");
        onVerifiedPro(orderId, data.aiCreditsLimit || 50);
        setStatusMessage(
          "Pembayaran terverifikasi. Paket Pro (50 Kuota AI) kini aktif."
        );
      } else {
        setStatusMessage(
          `Status transaksi ${orderId}: ${data.transactionStatus}. Selesaikan pembayaran lalu klik Cek Status.`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat memverifikasi pembayaran."
      );
    } finally {
      setVerifying(false);
    }
  };

  const handlePayNow = async () => {
    if (!config?.configured) return;
    setPaying(true);
    setError(null);
    setStatusMessage(null);

    try {
      await loadSnapScript(config.snapJsUrl, config.clientKey);
      const res = await authorizedFetch("/api/payments/midtrans/create", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.token || !data.orderId) {
        throw new Error(data.error || "Gagal membuat transaksi Midtrans.");
      }

      const orderId: string = data.orderId;
      setActiveOrderId(orderId);
      setRedirectUrl(data.redirectUrl || null);
      onSaveReceipt(orderId, "pending").catch((err) => {
        console.error("Gagal menyimpan receipt pending:", err);
      });

      if (!window.snap) {
        throw new Error("Midtrans Snap belum siap di browser.");
      }

      window.snap.pay(data.token, {
        onSuccess: async () => {
          await verifyOrder(orderId);
        },
        onPending: async () => {
          setStatusMessage(
            `Order ${orderId} menunggu pembayaran. Setelah transfer/QRIS selesai, klik Cek Status Pembayaran.`
          );
        },
        onError: () => {
          setError(
            "Pembayaran gagal atau dibatalkan di Midtrans. Anda dapat mencoba membuat transaksi baru."
          );
        },
        onClose: () => {
          setStatusMessage(
            `Jendela pembayaran ditutup. Jika sudah membayar untuk order ${orderId}, klik Cek Status Pembayaran.`
          );
        },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memulai pembayaran Midtrans."
      );
    } finally {
      setPaying(false);
    }
  };

  const copyWebhookUrl = async () => {
    if (!config?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(config.webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-pro-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <p className="text-xs text-slate-500">Pembayaran Aman via Midtrans</p>
            <h2
              id="upgrade-pro-title"
              className="font-display text-lg font-semibold text-slate-900 mt-0.5"
            >
              Upgrade ke Paket Pro
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal upgrade"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-900">
              LajuModal Paket Pro
            </span>
            <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
              {formatIDR(config?.priceIDR || 49000)}
            </span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-700 pt-1">
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>50× kuota analisis AI (Rebalance, Peluang, Script Niche, Strategis)</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Verifikasi pembayaran otomatis melalui QRIS, Virtual Account, atau e-Wallet</span>
            </li>
          </ul>
        </div>

        {loadingConfig ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Memeriksa status gateway Midtrans...</span>
          </div>
        ) : !config?.configured ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2.5 text-xs text-amber-900">
            <p className="font-semibold">
              Kunci Midtrans belum ditambahkan di Settings &gt; Secrets
            </p>
            <p className="leading-relaxed">
              Tambahkan variabel berikut di panel <strong>Settings &gt; Secrets</strong> AI Studio (Sandbox atau Production dari Midtrans Dashboard Anda):
            </p>
            <ul className="list-disc list-inside font-mono space-y-0.5 text-[11px]">
              <li>MIDTRANS_SERVER_KEY</li>
              <li>MIDTRANS_CLIENT_KEY</li>
              <li>MIDTRANS_IS_PRODUCTION (false / true)</li>
            </ul>
            {config?.webhookUrl && (
              <div className="pt-2 border-t border-amber-200/70 space-y-1">
                <p className="font-medium">Payment Notification URL (Webhook):</p>
                <div className="flex items-center justify-between gap-2 bg-white border border-amber-200 rounded-md px-2.5 py-1.5">
                  <span className="font-mono text-[11px] truncate text-slate-800">
                    {config.webhookUrl}
                  </span>
                  <button
                    type="button"
                    onClick={copyWebhookUrl}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 shrink-0"
                  >
                    {copiedWebhook ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Mode Midtrans aktif:{" "}
              <strong className="text-slate-700">
                {config.isProduction ? "Production" : "Sandbox"}
              </strong>
            </p>

            {config.webhookUrl && (
              <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500">Webhook Notification URL</p>
                  <p className="font-mono text-[11px] text-slate-700 truncate">
                    {config.webhookUrl}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyWebhookUrl}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 shrink-0"
                >
                  {copiedWebhook ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>
            )}
            {(config.keyModeMismatch || config.serverKeyValid === false) && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 space-y-1">
                <p className="font-semibold">Konfigurasi Midtrans tidak cocok</p>
                <p>
                  {config.keyModeMismatch
                    ? `Mode saat ini ${config.isProduction ? "Production" : "Sandbox"}, tetapi Client Key / Server Key berasal dari mode berbeda (Sandbox memakai awalan SB-Mid-...).`
                    : `Server Key Midtrans ditolak oleh API ${config.isProduction ? "Production" : "Sandbox"}. Periksa kembali MIDTRANS_SERVER_KEY dan MIDTRANS_IS_PRODUCTION di Settings > Secrets.`}
                </p>
              </div>
            )}
          </div>
        )}

        {redirectUrl && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-600">
              Popup Snap tidak muncul? Buka halaman pembayaran langsung:
            </span>
            <a
              href={redirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-slate-900 hover:underline shrink-0"
            >
              <span>Buka Midtrans</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {statusMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
            {statusMessage}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100">
          {activeOrderId && config?.configured && (
            <button
              type="button"
              onClick={() => verifyOrder(activeOrderId)}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${verifying ? "animate-spin" : ""}`}
              />
              <span>{verifying ? "Memeriksa..." : "Cek Status Pembayaran"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePayNow}
            disabled={!config?.configured || paying}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {paying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CreditCard className="h-3.5 w-3.5" />
            )}
            <span>
              {paying
                ? "Membuka Midtrans..."
                : `Bayar ${formatIDR(config?.priceIDR || 49000)} via Midtrans`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
