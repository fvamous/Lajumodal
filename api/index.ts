import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRO_PRICE_IDR = 49000;
const FREE_AI_LIMIT = 5;
const PRO_AI_LIMIT = 50;
const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString("hex");
const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null =
  null;

function loadFirebaseProjectId(): string {
  const envProjectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    ""
  ).trim();
  if (envProjectId && envProjectId !== "remixed-project-id") {
    return envProjectId;
  }

  const candidatePaths = [
    path.resolve(process.cwd(), "firebase-applet-config.json"),
    path.resolve(__dirname, "../firebase-applet-config.json"),
    path.resolve(__dirname, "firebase-applet-config.json"),
  ];

  const cfgPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!cfgPath) {
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

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Gagal mengambil sertifikat Google (${res.status}).`);
  }

  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await res.json()) as Record<string, string>;

  cachedCerts = {
    certs,
    expiresAt: now + Math.max(60, maxAgeSec) * 1000,
  };
  return certs;
}

interface VerifiedFirebaseClaims {
  uid: string;
  email: string;
  name: string;
  email_verified: boolean;
}

async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedFirebaseClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Format JWT tidak valid.");
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(
    Buffer.from(headerB64, "base64url").toString("utf8")
  ) as { alg?: string; kid?: string };

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Header token tidak didukung.");
  }

  let certs = await getGooglePublicCerts();
  let certPem = certs[header.kid];
  if (!certPem) {
    cachedCerts = null;
    certs = await getGooglePublicCerts();
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new Error("Sertifikat penanda tangan token tidak ditemukan.");
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signatureBytes = Buffer.from(signatureB64, "base64url");
  if (!verifier.verify(certPem, signatureBytes)) {
    throw new Error("Tanda tangan token tidak valid.");
  }

  const claims = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString("utf8")
  ) as {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  const projectId = loadFirebaseProjectId();
  const nowSec = Math.floor(Date.now() / 1000);

  if (claims.aud !== projectId) {
    throw new Error("Audience token tidak cocok.");
  }
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Issuer token tidak cocok.");
  }
  if (!claims.sub || typeof claims.sub !== "string" || claims.sub.length > 128) {
    throw new Error("Subject token tidak valid.");
  }
  if (!claims.exp || claims.exp <= nowSec) {
    throw new Error("Token sesi sudah kedaluwarsa.");
  }
  if (!claims.iat || claims.iat > nowSec + 300) {
    throw new Error("Waktu penerbitan token tidak valid.");
  }
  if (claims.auth_time && claims.auth_time > nowSec + 300) {
    throw new Error("Waktu autentikasi token tidak valid.");
  }

  return {
    uid: claims.sub,
    email: claims.email || "",
    name: claims.name || "Pengguna LajuModal",
    email_verified: claims.email_verified === true,
  };
}

interface AuthenticatedRequest extends Request {
  uid?: string;
  userEmail?: string;
  userName?: string;
}

export interface UserQuotaState {
  planTier: "free" | "pro";
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  verifiedOrderId: string | null;
}

const userEntitlements = new Map<string, UserQuotaState>();

function getSigningKey(): Buffer {
  const seed =
    (process.env.QUOTA_SIGNING_SECRET || "").trim() ||
    (process.env.MIDTRANS_SERVER_KEY || "").trim() ||
    (process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
      ? process.env.GEMINI_API_KEY.trim()
      : "") ||
    EPHEMERAL_FALLBACK_SECRET;

  return crypto.createHmac("sha256", seed).update("lajumodal-quota-v1").digest();
}

function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function signQuotaToken(uid: string, state: UserQuotaState): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({
      uid,
      planTier: state.planTier,
      aiCreditsUsed: state.aiCreditsUsed,
      aiCreditsLimit: state.aiCreditsLimit,
      verifiedOrderId: state.verifiedOrderId,
      iat: Date.now(),
    }),
    "utf8"
  ).toString("base64url");

  const sig = crypto
    .createHmac("sha256", getSigningKey())
    .update(payloadB64)
    .digest("hex");

  return `${payloadB64}.${sig}`;
}

function verifyQuotaToken(
  uid: string,
  rawToken: string | undefined
): UserQuotaState | null {
  if (!rawToken || typeof rawToken !== "string") return null;
  const parts = rawToken.trim().split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigHex] = parts;
  if (!payloadB64 || !sigHex) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSigningKey())
    .update(payloadB64)
    .digest("hex");

  if (!safeEqualHex(expectedSig, sigHex)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as {
      uid?: string;
      planTier?: string;
      aiCreditsUsed?: number;
      verifiedOrderId?: string | null;
    };

    if (parsed.uid !== uid) return null;

    const isPro = parsed.planTier === "pro" && Boolean(parsed.verifiedOrderId);
    const limit = isPro ? PRO_AI_LIMIT : FREE_AI_LIMIT;
    const used = Math.max(
      0,
      Math.min(limit, Math.floor(Number(parsed.aiCreditsUsed || 0)))
    );

    return {
      planTier: isPro ? "pro" : "free",
      aiCreditsUsed: used,
      aiCreditsLimit: limit,
      verifiedOrderId: isPro ? String(parsed.verifiedOrderId) : null,
    };
  } catch {
    return null;
  }
}

function getOrCreateEntitlement(
  uid: string,
  quotaTokenHeader?: string
): UserQuotaState {
  let state = userEntitlements.get(uid);
  if (!state) {
    state = {
      planTier: "free",
      aiCreditsUsed: 0,
      aiCreditsLimit: FREE_AI_LIMIT,
      verifiedOrderId: null,
    };
  }

  const fromToken = verifyQuotaToken(uid, quotaTokenHeader);
  if (fromToken) {
    if (fromToken.planTier === "pro" && state.planTier !== "pro") {
      state.planTier = "pro";
      state.aiCreditsLimit = PRO_AI_LIMIT;
      state.verifiedOrderId = fromToken.verifiedOrderId;
    }
    state.aiCreditsUsed = Math.max(state.aiCreditsUsed, fromToken.aiCreditsUsed);
  }

  userEntitlements.set(uid, state);
  return state;
}

function attachQuotaHeader(
  res: Response,
  uid: string,
  state: UserQuotaState
): void {
  res.setHeader("X-Quota-Token", signQuotaToken(uid, state));
}

function grantProEntitlement(
  uid: string,
  orderId: string,
  quotaTokenHeader?: string
): UserQuotaState {
  const current = getOrCreateEntitlement(uid, quotaTokenHeader);
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
      res.status(401).json({
        error: "Autentikasi diperlukan. Silakan masuk terlebih dahulu.",
      });
      return;
    }
    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      res.status(401).json({ error: "Token autentikasi tidak valid." });
      return;
    }

    const decoded = await verifyFirebaseIdToken(idToken);
    if (!decoded.uid || decoded.email_verified !== true) {
      res.status(403).json({
        error:
          "Akun Google Anda harus terverifikasi untuk mengakses layanan ini.",
      });
      return;
    }

    req.uid = decoded.uid;
    req.userEmail = decoded.email;
    req.userName = decoded.name;
    next();
  } catch {
    res.status(401).json({
      error:
        "Sesi login tidak valid atau kedaluwarsa. Silakan muat ulang atau masuk kembali.",
    });
  }
}

async function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY belum dikonfigurasi di Secrets / Environment Variables. Harap atur API key terlebih dahulu."
    );
  }
  const { GoogleGenAI, Type, ThinkingLevel } = await import("@google/genai");
  return {
    ai: new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    }),
    Type,
    ThinkingLevel,
  };
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
        "API key Gemini tidak valid atau belum memiliki izin. Periksa Environment Variables.",
    };
  }
  return {
    status: 500,
    message: `Gagal memproses analisis AI: ${raw}`,
  };
}

function checkQuotaAvailable(
  uid: string,
  quotaTokenHeader?: string
): UserQuotaState | null {
  const state = getOrCreateEntitlement(uid, quotaTokenHeader);
  if (state.aiCreditsUsed >= state.aiCreditsLimit) {
    return null;
  }
  return state;
}

function recordQuotaUsed(
  uid: string,
  quotaTokenHeader?: string
): UserQuotaState {
  const state = getOrCreateEntitlement(uid, quotaTokenHeader);
  state.aiCreditsUsed += 1;
  userEntitlements.set(uid, state);
  return state;
}

function resolveAppBaseUrl(req: Request): string {
  const envUrl = (process.env.APP_URL || "").trim();
  if (envUrl && envUrl !== "MY_APP_URL") {
    return envUrl.replace(/\/+$/, "");
  }
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || "https";
  const host =
    req.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.get("host") ||
    (process.env.VERCEL_URL ? process.env.VERCEL_URL : "localhost:3000");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

export function createApiApp(): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      runtime: process.env.VERCEL ? "vercel" : "node",
    });
  });

  // --- Midtrans Payment Endpoints ---
  app.get("/api/payments/midtrans/config", async (req: Request, res: Response) => {
    const cfg = getMidtransConfig();
    const appBase = resolveAppBaseUrl(req);

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
      const tokenHeader = req.get("x-quota-token");
      const clientUsedHint = Number(req.query.usedHint || 0);
      const state = getOrCreateEntitlement(uid, tokenHeader);
      if (
        Number.isFinite(clientUsedHint) &&
        clientUsedHint > state.aiCreditsUsed &&
        clientUsedHint <= state.aiCreditsLimit
      ) {
        state.aiCreditsUsed = clientUsedHint;
        userEntitlements.set(uid, state);
      }
      attachQuotaHeader(res, uid, state);
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
              "MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY belum diatur di Environment Variables.",
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
            error:
              "Konfigurasi Midtrans belum lengkap di Environment Variables.",
          });
          return;
        }

        const uid = req.uid!;
        const tokenHeader = req.get("x-quota-token");
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

        if (statusRes.status === 404 || tx.status_code === "404") {
          const currentState = getOrCreateEntitlement(uid, tokenHeader);
          attachQuotaHeader(res, uid, currentState);
          res.json({
            verified: false,
            rejected: false,
            notStarted: true,
            transactionStatus: "not_started",
            orderId,
            ...currentState,
          });
          return;
        }

        if (!statusRes.ok) {
          res.status(statusRes.status || 502).json({
            verified: false,
            error:
              tx.status_message || "Gagal memeriksa status transaksi di Midtrans.",
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
            rejected: true,
            rejectReason: "Order ID ini bukan milik akun yang sedang masuk.",
            error: "Order ID ini bukan milik akun yang sedang masuk.",
          });
          return;
        }

        const paidAmount = Number(tx.gross_amount || 0);
        const txStatus = tx.transaction_status || "pending";
        const fraudStatus = tx.fraud_status || "";
        const isSettled =
          txStatus === "settlement" ||
          (txStatus === "capture" && (!fraudStatus || fraudStatus === "accept"));

        if (isSettled && paidAmount >= PRO_PRICE_IDR) {
          const state = grantProEntitlement(uid, orderId, tokenHeader);
          attachQuotaHeader(res, uid, state);
          res.json({
            verified: true,
            rejected: false,
            transactionStatus: txStatus,
            orderId,
            ...state,
          });
          return;
        }

        const rejectedStatuses = new Set([
          "deny",
          "cancel",
          "expire",
          "failure",
          "refund",
          "partial_refund",
          "chargeback",
        ]);
        const isAmountInsufficient = isSettled && paidAmount < PRO_PRICE_IDR;
        const isFraudRejected =
          txStatus === "capture" && fraudStatus === "deny";
        const isRejected =
          rejectedStatuses.has(txStatus) ||
          isAmountInsufficient ||
          isFraudRejected;

        let rejectReason = "";
        if (isAmountInsufficient) {
          rejectReason = `Pembayaran ditolak otomatis: nominal (Rp ${paidAmount.toLocaleString("id-ID")}) kurang dari harga Paket Pro (Rp ${PRO_PRICE_IDR.toLocaleString("id-ID")}).`;
        } else if (isFraudRejected || txStatus === "deny") {
          rejectReason =
            "Pembayaran ditolak otomatis oleh sistem verifikasi Midtrans / bank penerbit.";
        } else if (txStatus === "expire") {
          rejectReason =
            "Waktu pembayaran sudah habis (kedaluwarsa). Transaksi dibatalkan otomatis.";
        } else if (txStatus === "cancel") {
          rejectReason = "Transaksi telah dibatalkan.";
        } else if (isRejected) {
          rejectReason = `Transaksi ditolak otomatis oleh Midtrans (status: ${txStatus}).`;
        }

        const currentState = getOrCreateEntitlement(uid, tokenHeader);
        attachQuotaHeader(res, uid, currentState);
        res.json({
          verified: false,
          rejected: isRejected,
          rejectReason: rejectReason || undefined,
          transactionStatus: txStatus,
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
        const tokenHeader = req.get("x-quota-token");
        const quota = checkQuotaAvailable(uid, tokenHeader);
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

        const { ai, Type, ThinkingLevel } = await getAIClient();
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
        const updatedQuota = recordQuotaUsed(uid, tokenHeader);
        attachQuotaHeader(res, uid, updatedQuota);
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
        const tokenHeader = req.get("x-quota-token");
        const quota = checkQuotaAvailable(uid, tokenHeader);
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

        const { ai, Type, ThinkingLevel } = await getAIClient();
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
        const updatedQuota = recordQuotaUsed(uid, tokenHeader);
        attachQuotaHeader(res, uid, updatedQuota);
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
        const tokenHeader = req.get("x-quota-token");
        const quota = checkQuotaAvailable(uid, tokenHeader);
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

        const { ai, Type, ThinkingLevel } = await getAIClient();
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
        const updatedQuota = recordQuotaUsed(uid, tokenHeader);
        attachQuotaHeader(res, uid, updatedQuota);
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
        const tokenHeader = req.get("x-quota-token");
        const quota = checkQuotaAvailable(uid, tokenHeader);
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

        const { ai, ThinkingLevel } = await getAIClient();
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

        const updatedQuota = recordQuotaUsed(uid, tokenHeader);
        attachQuotaHeader(res, uid, updatedQuota);
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

  return app;
}

let cachedApp: Express | null = null;

export default function handler(req: Request, res: Response) {
  try {
    if (!cachedApp) {
      cachedApp = createApiApp();
    }
    return cachedApp(req, res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      error: `Serverless initialization failed: ${msg}`,
    });
  }
}
