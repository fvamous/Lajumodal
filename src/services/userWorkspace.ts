import { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import {
  ActiveSprintItem,
  AllocationSplit,
  AssetCategory,
  AutomationRule,
  OpportunityBlueprint,
  PortfolioAsset,
  UserAccountProfile,
} from "../types/finance";
import {
  INITIAL_ASSETS,
  INITIAL_RULES,
  INITIAL_SPLIT,
} from "../data/initialState";

function clampStr(value: string, maxLen: number, fallback = "-"): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export async function ensureUserWorkspaceInitialized(user: User): Promise<void> {
  const uid = user.uid;
  const profilePath = `users/${uid}/private/profile`;
  const profileRef = doc(db, "users", uid, "private", "profile");

  try {
    const snap = await getDoc(profileRef);
    if (snap.exists()) return;

    const batch = writeBatch(db);
    batch.set(profileRef, {
      ownerId: uid,
      displayName: clampStr(user.displayName || "Pengguna LajuModal", 120),
      email: clampStr(user.email || "user@lajumodal.app", 160),
      planTier: "free",
      aiCreditsUsed: 0,
      aiCreditsLimit: 5,
      monthlyExpenseIDR: 4000000,
      splitEmergencyPercent: INITIAL_SPLIT.emergencyPercent,
      splitFixedIncomePercent: INITIAL_SPLIT.fixedIncomePercent,
      splitEquityPercent: INITIAL_SPLIT.equityDividendPercent,
      splitBusinessPercent: INITIAL_SPLIT.businessSeedPercent,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    INITIAL_ASSETS.forEach((asset) => {
      const assetRef = doc(db, "users", uid, "assets", asset.id);
      batch.set(assetRef, {
        ownerId: uid,
        name: clampStr(asset.name, 120),
        ticker: clampStr(asset.ticker, 24),
        category: clampStr(asset.category, 80),
        balanceIDR: clampNum(asset.balanceIDR, 0, 100_000_000_000),
        targetPercent: clampNum(asset.targetPercent, 0, 100),
        annualYieldPercent: clampNum(asset.annualYieldPercent, 0, 100),
        autoDcaMonthlyIDR: clampNum(asset.autoDcaMonthlyIDR, 0, 10_000_000_000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    INITIAL_RULES.forEach((rule) => {
      const ruleRef = doc(db, "users", uid, "rules", rule.id);
      batch.set(ruleRef, {
        ownerId: uid,
        title: clampStr(rule.title, 120),
        trigger: clampStr(rule.trigger, 200),
        actionSummary: clampStr(rule.actionSummary, 400),
        enabled: Boolean(rule.enabled),
        allocationPercent: clampNum(rule.allocationPercent ?? 0, 0, 100),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }
}

export function subscribeUserWorkspace(
  uid: string,
  callbacks: {
    onProfile: (profile: UserAccountProfile) => void;
    onAssets: (assets: PortfolioAsset[]) => void;
    onSprints: (sprints: ActiveSprintItem[]) => void;
    onRules: (rules: AutomationRule[]) => void;
  }
): () => void {
  const profilePath = `users/${uid}/private/profile`;
  const unsubProfile = onSnapshot(
    doc(db, "users", uid, "private", "profile"),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      callbacks.onProfile({
        ownerId: String(d.ownerId || uid),
        displayName: String(d.displayName || "Pengguna"),
        email: String(d.email || ""),
        planTier: d.planTier === "pro" ? "pro" : "free",
        aiCreditsUsed: Number(d.aiCreditsUsed || 0),
        aiCreditsLimit: Number(d.aiCreditsLimit || 5),
        monthlyExpenseIDR: Number(d.monthlyExpenseIDR || 4000000),
        split: {
          emergencyPercent: Number(d.splitEmergencyPercent ?? 35),
          fixedIncomePercent: Number(d.splitFixedIncomePercent ?? 25),
          equityDividendPercent: Number(d.splitEquityPercent ?? 30),
          businessSeedPercent: Number(d.splitBusinessPercent ?? 10),
        },
      });
    },
    (error) => handleFirestoreError(error, OperationType.GET, profilePath)
  );

  const assetsPath = `users/${uid}/assets`;
  const assetsQuery = query(
    collection(db, "users", uid, "assets"),
    where("ownerId", "==", uid)
  );
  const unsubAssets = onSnapshot(
    assetsQuery,
    (snapshot) => {
      const list: PortfolioAsset[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: String(d.name || ""),
          ticker: String(d.ticker || ""),
          category: d.category as AssetCategory,
          balanceIDR: Number(d.balanceIDR || 0),
          targetPercent: Number(d.targetPercent || 0),
          annualYieldPercent: Number(d.annualYieldPercent || 0),
          autoDcaMonthlyIDR: Number(d.autoDcaMonthlyIDR || 0),
        };
      });
      callbacks.onAssets(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, assetsPath)
  );

  const sprintsPath = `users/${uid}/sprints`;
  const sprintsQuery = query(
    collection(db, "users", uid, "sprints"),
    where("ownerId", "==", uid)
  );
  const unsubSprints = onSnapshot(
    sprintsQuery,
    (snapshot) => {
      const list: ActiveSprintItem[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const steps = [
          String(d.step1Text || ""),
          String(d.step2Text || ""),
          String(d.step3Text || ""),
        ].filter(Boolean);
        return {
          id: docSnap.id,
          title: String(d.title || ""),
          categoryTag:
            d.categoryTag === "Produk Digital"
              ? "Produk Digital"
              : "Jasa Komputer",
          modelType: String(d.modelType || ""),
          capitalTier: "0-500rb",
          requiredCapitalIDR: Number(d.requiredCapitalIDR || 0),
          daysToFirstCash: Number(d.daysToFirstCash || 7),
          projectedMonthlyRecurringIDR: Number(
            d.projectedMonthlyRecurringIDR || 0
          ),
          autoSweepPercent: Number(d.autoSweepPercent || 40),
          whereToFindBuyers: String(d.whereToFindBuyers || ""),
          sampleOfferScript: String(d.sampleOfferScript || ""),
          whyItWorks: String(d.whyItWorks || ""),
          first7DaysSteps: steps,
          activatedAt: String(d.createdAt?.toDate?.()?.toISOString?.() || ""),
          completedSteps: [
            Boolean(d.step1Done),
            Boolean(d.step2Done),
            Boolean(d.step3Done),
          ].slice(0, steps.length),
          sweptToPortfolio: Boolean(d.sweptToPortfolio),
        };
      });
      callbacks.onSprints(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, sprintsPath)
  );

  const rulesPath = `users/${uid}/rules`;
  const rulesQuery = query(
    collection(db, "users", uid, "rules"),
    where("ownerId", "==", uid)
  );
  const unsubRules = onSnapshot(
    rulesQuery,
    (snapshot) => {
      const list: AutomationRule[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          title: String(d.title || ""),
          trigger: String(d.trigger || ""),
          actionSummary: String(d.actionSummary || ""),
          enabled: Boolean(d.enabled),
          allocationPercent: Number(d.allocationPercent || 0),
        };
      });
      callbacks.onRules(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, rulesPath)
  );

  return () => {
    unsubProfile();
    unsubAssets();
    unsubSprints();
    unsubRules();
  };
}

export async function upsertUserAsset(
  uid: string,
  assetData: Omit<PortfolioAsset, "id">,
  existingId?: string
): Promise<void> {
  const assetId = existingId || `asset-${Date.now()}`;
  const path = `users/${uid}/assets/${assetId}`;
  const ref = doc(db, "users", uid, "assets", assetId);

  try {
    if (existingId) {
      await updateDoc(ref, {
        name: clampStr(assetData.name, 120),
        ticker: clampStr(assetData.ticker, 24),
        category: clampStr(assetData.category, 80),
        balanceIDR: clampNum(assetData.balanceIDR, 0, 100_000_000_000),
        targetPercent: clampNum(assetData.targetPercent, 0, 100),
        annualYieldPercent: clampNum(assetData.annualYieldPercent, 0, 100),
        autoDcaMonthlyIDR: clampNum(
          assetData.autoDcaMonthlyIDR,
          0,
          10_000_000_000
        ),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        name: clampStr(assetData.name, 120),
        ticker: clampStr(assetData.ticker, 24),
        category: clampStr(assetData.category, 80),
        balanceIDR: clampNum(assetData.balanceIDR, 0, 100_000_000_000),
        targetPercent: clampNum(assetData.targetPercent, 0, 100),
        annualYieldPercent: clampNum(assetData.annualYieldPercent, 0, 100),
        autoDcaMonthlyIDR: clampNum(
          assetData.autoDcaMonthlyIDR,
          0,
          10_000_000_000
        ),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      existingId ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

export async function deleteUserAsset(uid: string, assetId: string): Promise<void> {
  const path = `users/${uid}/assets/${assetId}`;
  try {
    await deleteDoc(doc(db, "users", uid, "assets", assetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function activateUserSprint(
  uid: string,
  opp: OpportunityBlueprint
): Promise<void> {
  const sprintId = `sprint-${Date.now()}`;
  const path = `users/${uid}/sprints/${sprintId}`;
  const ref = doc(db, "users", uid, "sprints", sprintId);

  const steps = opp.first7DaysSteps || [];
  try {
    await setDoc(ref, {
      ownerId: uid,
      title: clampStr(opp.title, 160),
      categoryTag:
        opp.categoryTag === "Produk Digital"
          ? "Produk Digital"
          : "Jasa Komputer",
      modelType: clampStr(opp.modelType, 100),
      requiredCapitalIDR: clampNum(opp.requiredCapitalIDR, 0, 1_000_000_000),
      daysToFirstCash: clampNum(opp.daysToFirstCash, 1, 365),
      projectedMonthlyRecurringIDR: clampNum(
        opp.projectedMonthlyRecurringIDR,
        0,
        1_000_000_000
      ),
      autoSweepPercent: clampNum(opp.autoSweepPercent, 0, 100),
      whereToFindBuyers: clampStr(opp.whereToFindBuyers, 500),
      sampleOfferScript: clampStr(opp.sampleOfferScript, 1000),
      whyItWorks: clampStr(opp.whyItWorks, 1000),
      step1Text: (steps[0] || "").slice(0, 400),
      step1Done: false,
      step2Text: (steps[1] || "").slice(0, 400),
      step2Done: false,
      step3Text: (steps[2] || "").slice(0, 400),
      step3Done: false,
      sweptToPortfolio: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserSprintSteps(
  uid: string,
  sprintId: string,
  completedSteps: boolean[]
): Promise<void> {
  const path = `users/${uid}/sprints/${sprintId}`;
  try {
    await updateDoc(doc(db, "users", uid, "sprints", sprintId), {
      step1Done: Boolean(completedSteps[0]),
      step2Done: Boolean(completedSteps[1]),
      step3Done: Boolean(completedSteps[2]),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserSprintSweep(
  uid: string,
  sprintId: string,
  sweptToPortfolio: boolean
): Promise<void> {
  const path = `users/${uid}/sprints/${sprintId}`;
  try {
    await updateDoc(doc(db, "users", uid, "sprints", sprintId), {
      sweptToPortfolio,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserSprint(
  uid: string,
  sprintId: string
): Promise<void> {
  const path = `users/${uid}/sprints/${sprintId}`;
  try {
    await deleteDoc(doc(db, "users", uid, "sprints", sprintId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function updateUserRule(
  uid: string,
  ruleId: string,
  enabled: boolean,
  allocationPercent = 0
): Promise<void> {
  const path = `users/${uid}/rules/${ruleId}`;
  try {
    await updateDoc(doc(db, "users", uid, "rules", ruleId), {
      enabled,
      allocationPercent: clampNum(allocationPercent, 0, 100),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserFinancialSettings(
  uid: string,
  monthlyExpenseIDR: number,
  split: AllocationSplit
): Promise<void> {
  const path = `users/${uid}/private/profile`;
  try {
    await updateDoc(doc(db, "users", uid, "private", "profile"), {
      monthlyExpenseIDR: clampNum(monthlyExpenseIDR, 0, 10_000_000_000),
      splitEmergencyPercent: clampNum(split.emergencyPercent, 0, 100),
      splitFixedIncomePercent: clampNum(split.fixedIncomePercent, 0, 100),
      splitEquityPercent: clampNum(split.equityDividendPercent, 0, 100),
      splitBusinessPercent: clampNum(split.businessSeedPercent, 0, 100),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function incrementUserAiCredit(uid: string): Promise<void> {
  const path = `users/${uid}/private/profile`;
  try {
    await updateDoc(doc(db, "users", uid, "private", "profile"), {
      aiCreditsUsed: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveUserPaymentReceipt(
  uid: string,
  orderId: string,
  status: "pending" | "settlement" | "capture"
): Promise<void> {
  const path = `users/${uid}/payments/${orderId}`;
  const ref = doc(db, "users", uid, "payments", orderId);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        status,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        orderId: clampStr(orderId, 80),
        amountIDR: 49000,
        planTier: "pro",
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getLatestUserPaymentOrderId(
  uid: string
): Promise<string | null> {
  const path = `users/${uid}/payments`;
  try {
    const q = query(
      collection(db, "users", uid, "payments"),
      where("ownerId", "==", uid)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const sorted = snap.docs
      .map((d) => ({
        id: d.id,
        status: String(d.data().status || "pending"),
        ms: d.data().createdAt?.toMillis?.() || 0,
      }))
      .sort((a, b) => {
        if (a.status !== "pending" && b.status === "pending") return -1;
        if (a.status === "pending" && b.status !== "pending") return 1;
        return b.ms - a.ms;
      });
    return sorted[0]?.id || null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
