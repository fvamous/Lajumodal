import express, { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRO_PRICE_IDR = 49000;
const FREE_AI_LIMIT = 5;
const PRO_AI_LIMIT = 50;

function loadFirebaseProjectId(): string {
  const cfgPath = path.resolve(__dirname, "firebase-applet-config.json");
  if (!fs.existsSync(cfgPath)) {
    throw new Error("firebase-applet-config.json tidak ditemukan.");
  }
  const raw = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as {
    projectId?: string;
  };
  const projectId = raw.projectId || "";
  if (!projectId || projectId === "remixed-project-id") {
    throw new Error("Firebase projectId belum dikonfigurasi.");
  }
  return projectId;
}

const firebaseAdminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: loadFirebaseProjectId() });

interface AuthenticatedRequest extends Request {
  uid?: string;
  userEmail?: string;
  userName?: string;
}

// Server-side authoritative entitlement & quota store (verified via Midtrans API / webhook)
interface UserQuotaState {
  planTier: "free" | "pro";
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  verifiedOrderId: string | null;
}

const userEntitlements = new Map<string, UserQuotaState>();

function getOrCreateEntitlement(uid: string): UserQuotaState {
  const existing = userEntitlements.get(uid);
  if (existing) return existing;
  const fresh: UserQuotaState = {
    planTier: "free",
    aiCreditsUsed: 0,
    aiCreditsLimit: FREE_AI_LIMIT,
    verifiedOrderId: null,
  };
  userEntitlements.set(uid, fresh);
  return fresh;
}

function grantProEntitlement(uid: string, orderId: string): UserQuotaState {
  const current = getOrCreateEntitlement(uid);
  current.planTier = "pro";
  current.aiCreditsLimit = PRO_AI_LIMIT;
  current.verifiedOrderId = orderId;
  userEntitlements.set(uid, current);
  return current;
}

function getMidtransConfig() {
  const serverKey = (process.env.MIDTRANS_SERVER_KEY || "").trim();
  const clientKey = (process.env.MIDTRANS_CLIENT_KEY || "").trim();
  const isProduction =
    (process.env.MIDTRANS_IS_PRODUCTION || "false").toLowerCase() === "true";

  const snapBaseUrl = isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
  const apiBaseUrl = isProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

  const isSandboxServerKey = serverKey.startsWith("SB-");
  const isSandboxClientKey = clientKey.startsWith("SB-");
  const keyModeMismatch = Boolean(
    serverKey &&
      clientKey &&
      ((isProduction && (isSandboxServerKey || isSandboxClientKey)) ||
        (!isProduction && (!isSandboxServerKey || !isSandboxClientKey)))
  );

  return {
    configured: Boolean(serverKey && clientKey),
    serverKey,
    clientKey,
    isProduction,
    keyModeMismatch,
    snapBaseUrl,
    apiBaseUrl,
  };
}

async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Autentikasi diperlukan. Silakan masuk terlebih dahulu." });
      return;
    }
    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      res.status(401).json({ error: "Token autentikasi tidak valid." });
      return;
    }

    const decoded = await getAuth(firebaseAdminApp).verifyIdToken(idToken);
    if (!decoded.uid || decoded.email_verified !== true) {
      res.status(403).json({
        error: "Akun Google Anda harus terverifikasi untuk mengakses layanan ini.",
      });
      return;
    }

    req.uid = decoded.uid;
    req.userEmail = decoded.email || "";
    req.userName = decoded.name || "Pengguna LajuModal";
    next();
  } catch {
    res.status(401).json({
      error: "Sesi login tidak valid atau kedaluwarsa. Silakan muat ulang atau masuk kembali.",
    });
  }
}

function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY belum dikonfigurasi di Secrets panel. Harap atur API key terlebih dahulu."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function formatErrorMessage(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("GEMINI_API_KEY")) {
    return { status: 400, message: raw };
  }
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message:
        "Batas kuota permintaan AI tercapai sementara. Coba lagi dalam beberapa saat.",
    };
  }
  if (
    raw.includes("403") ||
    raw.includes("PERMISSION_DENIED") ||
    raw.includes("API_KEY_INVALID")
  ) {
    return {
      status: 403,
      message:
        "API key Gemini tidak valid atau belum memiliki izin. Periksa Settings > Secrets.",
    };
  }
  return {
    status: 500,
    message: `Gagal memproses analisis AI: ${raw}`,
  };
}

function checkQuotaAvailable(uid: string): UserQuotaState | null {
  const state = getOrCreateEntitlement(uid);
  if (state.aiCreditsUsed >= state.aiCreditsLimit) {
    return null;
  }
  return state;
}

function recordQuotaUsed(uid: string): UserQuotaState {
  const state = getOrCreateEntitlement(uid);
  state.aiCreditsUsed += 1;
  userEntitlements.set(uid, state);
  return state;
}

function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // --- Midtrans Payment Endpoints ---
  app.get("/api/payments/midtrans/config", async (req: Request, res: Response) => {
    const cfg = getMidtransConfig();
    const appBase =
      (process.env.APP_URL && process.env.APP_URL !== "MY_APP_URL"
        ? process.env.APP_URL
        : `${req.protocol}://${req.get("host")}`
      ).replace(/\/+$/, "");

    let serverKeyValid: boolean | null = null;
    if (cfg.configured && req.query.check === "1") {
      try {
        const authBasic = Buffer.from(`${cfg.serverKey}:`).toString("base64");
        const checkRes = await fetch(
          `${cfg.apiBaseUrl}/v2/LM-HEALTH-CHECK-000/status`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Basic ${authBasic}`,
            },
          }
        );
        // 404 means Midtrans accepted the server key (order simply doesn't exist); 401 means bad/wrong-mode key
        serverKeyValid = checkRes.status !== 401 && checkRes.status !== 403;
      } catch {
        serverKeyValid = null;
      }
    }

    res.json({
      configured: cfg.configured,
      clientKey: cfg.configured ? cfg.clientKey : "",
      isProduction: cfg.isProduction,
      keyModeMismatch: cfg.keyModeMismatch,
      serverKeyValid,
      snapJsUrl: `${cfg.snapBaseUrl}/snap/snap.js`,
      priceIDR: PRO_PRICE_IDR,
      proCreditsLimit: PRO_AI_LIMIT,
      webhookUrl: `${appBase}/api/payments/midtrans/notification`,
    });
  });

  app.get(
    "/api/payments/midtrans/entitlement",
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const uid = req.uid!;
      const clientUsedHint = Number(req.query.usedHint || 0);
      const state = getOrCreateEntitlement(uid);
      if (
        Number.isFinite(clientUsedHint) &&
        clientUsedHint > state.aiCreditsUsed &&
        clientUsedHint <= state.aiCreditsLimit
      ) {
        state.aiCreditsUsed = clientUsedHint;
        userEntitlements.set(uid, state);
      }
      res.json(state);
    }
  );

  app.post(
    "/api/payments/midtrans/create",
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const cfg = getMidtransConfig();
        if (!cfg.configured) {
          res.status(503).json({
            error:
              "MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY belum diatur di panel Settings > Secrets.",
          });
          return;
        }

        const uid = req.uid!;
        const shortUid = uid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "USER";
        const orderId = `LM-${shortUid}-${Date.now()}`;
        const authBasic = Buffer.from(`${cfg.serverKey}:`).toString("base64");

        const snapResponse = await fetch(
          `${cfg.snapBaseUrl}/snap/v1/transactions`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Basic ${authBasic}`,
            },
            body: JSON.stringify({
              transaction_details: {
                order_id: orderId,
                gross_amount: PRO_PRICE_IDR,
              },
              item_details: [
                {
                  id: "lajumodal-pro-50",
                  price: PRO_PRICE_IDR,
                  quantity: 1,
                  name: "LajuModal Paket Pro (50 Kuota AI)",
                },
              ],
              customer_details: {
                first_name: (req.userName || "Pengguna").slice(0, 60),
                email: req.userEmail || "user@lajumodal.app",
              },
              custom_field1: uid,
              custom_field2: "pro",
            }),
          }
        );

        const snapData = (await snapResponse.json()) as {
          token?: string;
          redirect_url?: string;
          error_messages?: string[];
        };

        if (!snapResponse.ok || !snapData.token) {
          res.status(snapResponse.status || 502).json({
            error:
              snapData.error_messages?.join(", ") ||
              "Gagal membuat transaksi Midtrans Snap.",
          });
          return;
        }

        res.json({
          orderId,
          token: snapData.token,
          redirectUrl: snapData.redirect_url || "",
          amountIDR: PRO_PRICE_IDR,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Gagal memulai pembayaran Midtrans: ${msg}` });
      }
    }
  );

  app.post(
    "/api/payments/midtrans/verify",
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const cfg = getMidtransConfig();
        if (!cfg.configured) {
          res.status(503).json({
            error: "Konfigurasi Midtrans belum lengkap di Settings > Secrets.",
          });
          return;
        }

        const uid = req.uid!;
        const orderId = String(req.body?.orderId || "").trim();
        if (!/^[a-zA-Z0-9_-]{4,80}$/.test(orderId)) {
          res.status(400).json({ error: "Format Order ID Midtrans tidak valid." });
          return;
        }

        const authBasic = Buffer.from(`${cfg.serverKey}:`).toString("base64");
        const statusRes = await fetch(
          `${cfg.apiBaseUrl}/v2/${encodeURIComponent(orderId)}/status`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Basic ${authBasic}`,
            },
          }
        );

        const tx = (await statusRes.json()) as {
          status_code?: string;
          transaction_status?: string;
          fraud_status?: string;
          gross_amount?: string;
          custom_field1?: string;
          status_message?: string;
        };

        if (!statusRes.ok || tx.status_code === "404") {
          res.status(404).json({
            verified: false,
            error: tx.status_message || "Transaksi belum ditemukan di Midtrans.",
          });
          return;
        }

        const shortUid = uid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "USER";
        const ownerMatches = tx.custom_field1
          ? tx.custom_field1 === uid
          : orderId.startsWith(`LM-${shortUid}-`);

        if (!ownerMatches) {
          res.status(403).json({
            verified: false,
            error: "Order ID ini bukan milik akun yang sedang masuk.",
          });
          return;
        }

        const paidAmount = Number(tx.gross_amount || 0);
        const isSettled =
          tx.transaction_status === "settlement" ||
          (tx.transaction_status === "capture" &&
            (tx.fraud_status === "accept" || !tx.fraud_status));

        if (isSettled && paidAmount >= PRO_PRICE_IDR) {
          const state = grantProEntitlement(uid, orderId);
          res.json({
            verified: true,
            transactionStatus: tx.transaction_status,
            orderId,
            ...state,
          });
          return;
        }

        const currentState = getOrCreateEntitlement(uid);
        res.json({
          verified: false,
          transactionStatus: tx.transaction_status || "pending",
          orderId,
          ...currentState,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Gagal memverifikasi pembayaran: ${msg}` });
      }
    }
  );

  app.post("/api/payments/midtrans/notification", (req: Request, res: Response) => {
    try {
      const cfg = getMidtransConfig();
      if (!cfg.configured) {
        res.status(503).json({ error: "Midtrans belum dikonfigurasi." });
        return;
      }

      const {
        order_id,
        status_code,
        gross_amount,
        signature_key,
        transaction_status,
        fraud_status,
        custom_field1,
      } = req.body || {};

      if (
        typeof order_id !== "string" ||
        typeof status_code !== "string" ||
        typeof gross_amount !== "string" ||
        typeof signature_key !== "string"
      ) {
        res.status(400).json({ error: "Payload notifikasi Midtrans tidak lengkap." });
        return;
      }

      const expectedSig = crypto
        .createHash("sha512")
        .update(`${order_id}${status_code}${gross_amount}${cfg.serverKey}`)
        .digest("hex");

      if (!safeEqualHex(expectedSig, signature_key)) {
        res.status(403).json({ error: "Signature webhook Midtrans tidak valid." });
        return;
      }

      const isSettled =
        transaction_status === "settlement" ||
        (transaction_status === "capture" &&
          (fraud_status === "accept" || !fraud_status));

      if (
        isSettled &&
        Number(gross_amount) >= PRO_PRICE_IDR &&
        typeof custom_field1 === "string" &&
        custom_field1.length > 0
      ) {
        grantProEntitlement(custom_field1, order_id);
      }

      res.status(200).json({ received: true });
    } catch {
      res.status(500).json({ error: "Gagal memproses webhook Midtrans." });
    }
  });

  // --- Authenticated AI Endpoints ---

  // 1. AI Portfolio Audit & Auto-Rebalance Engine
  app.post(
    "/api/ai/rebalance",
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const uid = req.uid!;
        const quota = checkQuotaAvailable(uid);
        if (!quota) {
          res.status(402).json({
            error:
              "Kuota analisis AI Anda sudah habis. Lakukan upgrade ke Paket Pro via Midtrans untuk melanjutkan.",
          });
          return;
        }

        const {
          assets,
          monthlyCashflowIDR,
          monthlyExpenseIDR,
          age = 30,
          riskProfile = "Moderat-Agresif",
        } = req.body;

        if (!Array.isArray(assets) || assets.length === 0) {
          res.status(400).json({ error: "Data aset portofolio tidak boleh kosong." });
          return;
        }

        const ai = getAIClient();
        const totalPortfolio = assets.reduce(
          (sum: number, a: { balanceIDR?: number }) =>
            sum + (Number(a.balanceIDR) || 0),
          0
        );

        const prompt = `Analisis portofolio investasi berikut untuk pengguna usia ${age} tahun di Indonesia dengan profil risiko "${riskProfile}".
Total Portofolio Saat Ini: Rp ${totalPortfolio.toLocaleString("id-ID")}
Arus Kas Berulang Tambahan / Bulan untuk Investasi: Rp ${Number(monthlyCashflowIDR || 0).toLocaleString("id-ID")}
Pengeluaran Pokok / Bulan: Rp ${Number(monthlyExpenseIDR || 0).toLocaleString("id-ID")}

Daftar Aset Saat Ini:
${assets
  .map(
    (a: {
      name: string;
      category: string;
      balanceIDR: number;
      targetPercent: number;
      annualYieldPercent: number;
    }) =>
      `- ${a.name} (${a.category}): Rp ${Number(a.balanceIDR).toLocaleString(
        "id-ID"
      )} | Target Bobot: ${a.targetPercent}% | Imbal Hasil/thn: ${a.annualYieldPercent}%`
  )
  .join("\n")}

Tugas Anda:
1. Evaluasi kesehatan dana darurat (idealnya 4-6x pengeluaran pokok bulanan di instrumen likuid) dan keselarasan bobot aktual vs target.
2. Hitung prioritas alokasi otomatis bulanan (DCA) dari Rp ${Number(monthlyCashflowIDR || 0).toLocaleString("id-ID")} agar portofolio seimbang menuju efek majemuk tanpa harus menjual aset yang rugi.
3. Berikan 3 langkah eksekusi konkret dalam bahasa Indonesia yang lugas dan realistis.`;

        const response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            systemInstruction:
              "Anda adalah manajer portofolio kuantitatif dan arsitek arus kas di Indonesia. Selalu gunakan data angka pengguna secara presisi, utamakan keamanan likuiditas dasar sebelum aset volatil, dan berikan rekomendasi yang langsung dapat dieksekusi.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: {
                  type: Type.STRING,
                  description:
                    "Ringkasan audit kesehatan portofolio dan rasio dana darurat (2-3 kalimat).",
                },
                emergencyFundStatus: {
                  type: Type.STRING,
                  description:
                    "Status kecukupan dana darurat: Aman, Perlu Ditambah, atau Kritis.",
                },
                monthlyDcaPlan: {
                  type: Type.ARRAY,
                  description:
                    "Rencana alokasi otomatis bulanan per kategori/aset dalam Rupiah.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      assetName: { type: Type.STRING },
                      recommendedAmountIDR: { type: Type.NUMBER },
                      recommendedTargetPercent: { type: Type.NUMBER },
                      rationale: { type: Type.STRING },
                    },
                    required: [
                      "assetName",
                      "recommendedAmountIDR",
                      "recommendedTargetPercent",
                      "rationale",
                    ],
                  },
                },
                nextActions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    "3 langkah konkret minggu ini untuk mengoptimalkan uang menghasilkan uang.",
                },
              },
              required: [
                "summary",
                "emergencyFundStatus",
                "monthlyDcaPlan",
                "nextActions",
              ],
            },
          },
        });

        const parsed = JSON.parse((response.text ?? "{}").trim());
        const updatedQuota = recordQuotaUsed(uid);
        res.json({ ...parsed, quota: updatedQuota });
      } catch (err) {
        const { status, message } = formatErrorMessage(err);
        res.status(status).json({ error: message });
      }
    }
  );

  // 2. AI Low-Capital Near-Term Opportunity Generator
  app.post(
    "/api/ai/opportunities",
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const uid = req.uid!;
        const quota = checkQuotaAvailable(uid);
        if (!quota) {
          res.status(402).json({
            error:
              "Kuota analisis AI Anda sudah habis. Lakukan upgrade ke Paket Pro via Midtrans untuk melanjutkan.",
          });
          return;
        }

        const {
          availableCapitalIDR = 500000,
          hoursPerDay = 2,
          skills = "Administrasi digital, media sosial, spreadsheet",
          targetMonthlyIncomeIDR = 3000000,
        } = req.body;

        const ai = getAIClient();
        const prompt = `Pengguna berusia 30 tahun di Indonesia ingin membangun fondasi finansial dalam waktu dekat dengan modal minimal.
Profil Pengguna:
- Modal Uang Tersedia: Rp ${Number(availableCapitalIDR).toLocaleString("id-ID")}
- Waktu Tersedia: ${hoursPerDay} jam/hari
- Keahlian / Minat Awal: ${skills}
- Target Arus Kas Berulang Tambahan: Rp ${Number(targetMonthlyIncomeIDR).toLocaleString("id-ID")} / bulan

Hasilkan 3 peluang usaha/layanan minim modal yang PALING REALISTIS dikerjakan dalam 7–30 hari ke depan untuk menghasilkan arus kas berulang (recurring cashflow), BUKAN skema cepat kaya atau spekulasi berisiko tinggi. Pastikan setiap peluang memanfaatkan otomatisasi AI atau sistem berulang agar tidak memakan waktu selamanya, dan sertakan aturan penyisihan otomatis (cash sweep %) ke portofolio investasi.`;

        const response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            systemInstruction:
              "Anda adalah praktisi bisnis arus kas berulang (recurring revenue) dan mentor finansial untuk profesional usia 30 tahun di Indonesia. Fokus pada jasa terstandarisasi, aset digital, mikro-otomatisasi AI untuk UMKM, dan model retainer berulang dengan modal sangat rendah.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                strategyNote: {
                  type: Type.STRING,
                  description:
                    "Catatan strategis singkat tentang urutan eksekusi di usia 30 dengan modal terbatas.",
                },
                opportunities: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      categoryTag: {
                        type: Type.STRING,
                        description:
                          "Harus tepat 'Jasa Komputer' atau 'Produk Digital'.",
                      },
                      modelType: {
                        type: Type.STRING,
                        description:
                          "Contoh: Jasa Setup + Retainer, Produk Digital Margin Tinggi.",
                      },
                      requiredCapitalIDR: { type: Type.NUMBER },
                      daysToFirstCash: { type: Type.NUMBER },
                      projectedMonthlyRecurringIDR: { type: Type.NUMBER },
                      autoSweepPercent: {
                        type: Type.NUMBER,
                        description:
                          "Persentase profit bersih yang otomatis dialihkan ke portofolio investasi (misal 40).",
                      },
                      whereToFindBuyers: {
                        type: Type.STRING,
                        description: "Tempat spesifik mencari pembeli/klien hari ini.",
                      },
                      sampleOfferScript: {
                        type: Type.STRING,
                        description:
                          "Contoh pesan penawaran siap salin dan kirim ke calon pembeli.",
                      },
                      whyItWorks: { type: Type.STRING },
                      first7DaysSteps: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: [
                      "title",
                      "categoryTag",
                      "modelType",
                      "requiredCapitalIDR",
                      "daysToFirstCash",
                      "projectedMonthlyRecurringIDR",
                      "autoSweepPercent",
                      "whereToFindBuyers",
                      "sampleOfferScript",
                      "whyItWorks",
                      "first7DaysSteps",
                    ],
                  },
                },
              },
              required: ["strategyNote", "opportunities"],
            },
          },
        });

        const parsed = JSON.parse((response.text ?? "{}").trim());
        const updatedQuota = recordQuotaUsed(uid);
        res.json({ ...parsed, quota: updatedQuota });
      } catch (err) {
        const { status, message } = formatErrorMessage(err);
        res.status(status).json({ error: message });
      }
    }
  );

  // 2b. AI Offer Kit & Sales Script Generator
  app.post(
    "/api/ai/offer-kit",
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const uid = req.uid!;
        const quota = checkQuotaAvailable(uid);
        if (!quota) {
          res.status(402).json({
            error:
              "Kuota analisis AI Anda sudah habis. Lakukan upgrade ke Paket Pro via Midtrans untuk melanjutkan.",
          });
          return;
        }

        const {
          opportunityTitle,
          categoryTag,
          customNiche = "UMKM lokal",
        } = req.body;
        if (!opportunityTitle) {
          res.status(400).json({ error: "Judul peluang tidak boleh kosong." });
          return;
        }

        const ai = getAIClient();
        const prompt = `Pengguna ingin langsung eksekusi menghasilkan uang bermodal komputer saja untuk peluang: "${opportunityTitle}" (${categoryTag}).
Target niche spesifik yang dipilih pengguna: "${customNiche}".

Buatkan paket penawaran siap pakai hari ini dalam bahasa Indonesia:
1. Judul paket/produk yang jelas manfaatnya.
2. Harga jual realistis dalam Rupiah agar mudah closing di pasar Indonesia.
3. 3 sumber spesifik tempat mencari pembeli/kliennya hari ini tanpa iklan berbayar.
4. Naskah pesan penawaran (WhatsApp/DM/halaman jualan) yang sopan, tidak terkesan spam, dan langsung mengarah ke transaksi.
5. 4 langkah checklist pengiriman hasil kerja/produk digital agar pembeli puas dan mau repeat order.`;

        const response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              "Anda adalah praktisi penjualan jasa digital dan produk digital di Indonesia. Buat naskah penawaran yang natural, membumi, fokus pada masalah pembeli, dan bisa langsung dikirim atau diunggah hari ini.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                offerTitle: { type: Type.STRING },
                targetNiche: { type: Type.STRING },
                suggestedPriceIDR: { type: Type.NUMBER },
                whereToFindBuyersToday: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                readyToSendScript: { type: Type.STRING },
                deliveryChecklist: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: [
                "offerTitle",
                "targetNiche",
                "suggestedPriceIDR",
                "whereToFindBuyersToday",
                "readyToSendScript",
                "deliveryChecklist",
              ],
            },
          },
        });

        const parsed = JSON.parse((response.text ?? "{}").trim());
        const updatedQuota = recordQuotaUsed(uid);
        res.json({ ...parsed, quota: updatedQuota });
      } catch (err) {
        const { status, message } = formatErrorMessage(err);
        res.status(status).json({ error: message });
      }
    }
  );

  // 3. AI Wealth & Cashflow Strategist Chat
  app.post(
    "/api/ai/advisor",
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const uid = req.uid!;
        const quota = checkQuotaAvailable(uid);
        if (!quota) {
          res.status(402).json({
            error:
              "Kuota analisis AI Anda sudah habis. Lakukan upgrade ke Paket Pro via Midtrans untuk melanjutkan.",
          });
          return;
        }

        const { question, portfolioSnapshot, history = [] } = req.body;
        if (!question || typeof question !== "string") {
          res.status(400).json({ error: "Pertanyaan tidak boleh kosong." });
          return;
        }

        const ai = getAIClient();
        const contextSummary = portfolioSnapshot
          ? `Konteks Keuangan Pengguna Saat Ini:
- Total Portofolio: Rp ${Number(portfolioSnapshot.totalBalanceIDR || 0).toLocaleString("id-ID")}
- Arus Masuk Berulang/Bulan: Rp ${Number(portfolioSnapshot.monthlyCashflowIDR || 0).toLocaleString("id-ID")}
- Pengeluaran Pokok/Bulan: Rp ${Number(portfolioSnapshot.monthlyExpenseIDR || 0).toLocaleString("id-ID")}
- Rasio Investasi Otomatis (Auto-Sweep): ${portfolioSnapshot.autoInvestPercent || 40}%
- Komposisi Aset: ${(portfolioSnapshot.assets || [])
              .map(
                (a: { name: string; balanceIDR: number }) =>
                  `${a.name} (Rp ${Number(a.balanceIDR).toLocaleString("id-ID")})`
              )
              .join(", ")}
- Sprint Peluang Aktif: ${
              (portfolioSnapshot.activeOpportunities || [])
                .map(
                  (o: {
                    title: string;
                    projectedMonthlyRecurringIDR: number;
                  }) =>
                    `${o.title} (~Rp ${Number(
                      o.projectedMonthlyRecurringIDR
                    ).toLocaleString("id-ID")}/bln)`
                )
                .join(", ") || "Belum ada"
            }`
          : "";

        const recentHistory = Array.isArray(history)
          ? history
              .slice(-6)
              .map(
                (m: { role: string; content: string }) =>
                  `${m.role === "user" ? "Pengguna" : "Strategis"}: ${m.content}`
              )
              .join("\n")
          : "";

        const fullPrompt = `${contextSummary}

${recentHistory ? `Riwayat Percakapan:\n${recentHistory}\n` : ""}
Pertanyaan Pengguna: ${question}`;

        const response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: fullPrompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            systemInstruction:
              "Anda adalah penasihat arsitektur kekayaan dan arus kas berulang untuk profesional usia 30 tahun di Indonesia. Jawab dalam bahasa Indonesia yang jernih, terstruktur (gunakan poin bernomor yang ringkas), bebas basa-basi, dan selalu hubungkan antara peluang minim modal -> arus kas berulang -> otomatisasi investasi portofolio (uang menghasilkan uang). Hindari janji imbal hasil instan yang tidak realistis.",
          },
        });

        const updatedQuota = recordQuotaUsed(uid);
        res.json({
          reply: response.text ?? "Maaf, tidak ada respons yang dihasilkan.",
          quota: updatedQuota,
        });
      } catch (err) {
        const { status, message } = formatErrorMessage(err);
        res.status(status).json({ error: message });
      }
    }
  );

  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LajuModal server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
