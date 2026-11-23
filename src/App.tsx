import { useEffect, useMemo, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import { Loader2, Menu, Plus } from "lucide-react";
import { auth, googleProvider } from "./firebase";
import {
  ActiveSprintItem,
  AllocationSplit,
  AutomationRule,
  OpportunityBlueprint,
  PortfolioAsset,
  UserAccountProfile,
  WorkspaceTab,
} from "./types/finance";
import {
  INITIAL_ASSETS,
  INITIAL_RULES,
  INITIAL_SPLIT,
} from "./data/initialState";
import {
  activateUserSprint,
  deleteUserAsset,
  deleteUserSprint,
  ensureUserWorkspaceInitialized,
  getLatestUserPaymentOrderId,
  incrementUserAiCredit,
  saveUserPaymentReceipt,
  subscribeUserWorkspace,
  updateUserFinancialSettings,
  updateUserRule,
  updateUserSprintSteps,
  updateUserSprintSweep,
  upsertUserAsset,
} from "./services/userWorkspace";
import { authorizedFetch, clearStoredQuotaToken } from "./services/apiClient";
import { LandingView } from "./components/LandingView";
import { Sidebar } from "./components/Sidebar";
import { OverviewView } from "./components/OverviewView";
import { OpportunitiesView } from "./components/OpportunitiesView";
import { AutomationView } from "./components/AutomationView";
import { AdvisorView } from "./components/AdvisorView";
import { AssetModal } from "./components/AssetModal";
import { UpgradeProModal } from "./components/UpgradeProModal";

const TAB_TITLES: Record<WorkspaceTab, { breadcrumb: string; title: string }> = {
  overview: {
    breadcrumb: "LajuModal / Portofolio & Arus Kas",
    title: "Manajemen Portofolio & Mesin Uang Berulang",
  },
  opportunities: {
    breadcrumb: "LajuModal / Peluang Minim Modal",
    title: "Wadah Peluang Digital & Jasa Bermodal Komputer",
  },
  automation: {
    breadcrumb: "LajuModal / Otomatisasi AI",
    title: "Aturan Cash Sweep & Reinvestasi Otomatis",
  },
  advisor: {
    breadcrumb: "LajuModal / Strategis Keuangan",
    title: "Konsultan Strategi Kekayaan AI",
  },
};

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);

  const [profile, setProfile] = useState<UserAccountProfile | null>(null);
  const [serverQuota, setServerQuota] = useState<{
    planTier: "free" | "pro";
    aiCreditsUsed: number;
    aiCreditsLimit: number;
  } | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const [assets, setAssets] = useState<PortfolioAsset[]>(INITIAL_ASSETS);
  const [rules, setRules] = useState<AutomationRule[]>(INITIAL_RULES);
  const [activeSprints, setActiveSprints] = useState<ActiveSprintItem[]>([]);

  const [localExpenseIDR, setLocalExpenseIDR] = useState<number>(4000000);
  const [localSplit, setLocalSplit] = useState<AllocationSplit>(INITIAL_SPLIT);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<PortfolioAsset | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const settingsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setServerQuota(null);
      setPendingOrderId(null);
      setAssets(INITIAL_ASSETS);
      setRules(INITIAL_RULES);
      setActiveSprints([]);
      return;
    }

    let active = true;
    let unsubWorkspace: (() => void) | null = null;
    setWorkspaceLoading(true);

    ensureUserWorkspaceInitialized(user)
      .then(async () => {
        if (!active) return;
        unsubWorkspace = subscribeUserWorkspace(user.uid, {
          onProfile: async (p) => {
            setProfile(p);
            setLocalExpenseIDR(p.monthlyExpenseIDR);
            setLocalSplit(p.split);
            setWorkspaceLoading(false);

            // Sync authoritative server entitlement & check any saved Midtrans order
            try {
              const entRes = await authorizedFetch(
                `/api/payments/midtrans/entitlement?usedHint=${p.aiCreditsUsed}`
              );
              if (entRes.ok) {
                const ent = await entRes.json();
                if (active) {
                  setServerQuota({
                    planTier: ent.planTier,
                    aiCreditsUsed: ent.aiCreditsUsed,
                    aiCreditsLimit: ent.aiCreditsLimit,
                  });
                }
              }

              const latestOrder = await getLatestUserPaymentOrderId(user.uid);
              if (latestOrder && active) {
                setPendingOrderId(latestOrder);
                const verifyRes = await authorizedFetch(
                  "/api/payments/midtrans/verify",
                  {
                    method: "POST",
                    body: JSON.stringify({ orderId: latestOrder }),
                  }
                );
                if (verifyRes.ok) {
                  const vData = await verifyRes.json();
                  if (vData.verified && active) {
                    setServerQuota({
                      planTier: "pro",
                      aiCreditsUsed: vData.aiCreditsUsed ?? p.aiCreditsUsed,
                      aiCreditsLimit: vData.aiCreditsLimit ?? 50,
                    });
                    await saveUserPaymentReceipt(
                      user.uid,
                      latestOrder,
                      "settlement"
                    );
                  } else if ((vData.rejected || vData.notStarted) && active) {
                    setPendingOrderId(null);
                  }
                }
              }
            } catch {
              // Keep base free quota if payment check is offline/unconfigured
            }
          },
          onAssets: (a) => setAssets(a),
          onSprints: (s) => setActiveSprints(s),
          onRules: (r) => setRules(r),
        });
      })
      .catch((err) => {
        setWorkspaceLoading(false);
        setAuthError(
          err instanceof Error ? err.message : "Gagal memuat data akun Anda."
        );
      });

    return () => {
      active = false;
      if (unsubWorkspace) unsubWorkspace();
    };
  }, [user]);

  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("popup-blocked")) {
        setAuthError(
          "Popup login diblokir oleh browser Anda. Izinkan popup untuk situs ini lalu coba masuk lagi."
        );
      } else if (msg.includes("popup-closed-by-user")) {
        setAuthError("Jendela login ditutup sebelum proses selesai.");
      } else {
        setAuthError(`Gagal masuk dengan Google: ${msg}`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    clearStoredQuotaToken(user?.uid);
    await signOut(auth);
    setActiveTab("overview");
  };

  const scheduleSettingsSync = (
    nextExpense: number,
    nextSplit: AllocationSplit
  ) => {
    if (!user) return;
    if (settingsTimerRef.current) {
      window.clearTimeout(settingsTimerRef.current);
    }
    settingsTimerRef.current = window.setTimeout(() => {
      updateUserFinancialSettings(user.uid, nextExpense, nextSplit);
    }, 350);
  };

  const handleUpdateMonthlyExpense = (val: number) => {
    setLocalExpenseIDR(val);
    scheduleSettingsSync(val, localSplit);
  };

  const handleUpdateSplit = (newSplit: AllocationSplit) => {
    setLocalSplit(newSplit);
    scheduleSettingsSync(localExpenseIDR, newSplit);
  };

  const sideCashflowIDR = useMemo(
    () =>
      activeSprints
        .filter((s) => s.sweptToPortfolio)
        .reduce(
          (sum, s) =>
            sum +
            Math.round(
              s.projectedMonthlyRecurringIDR * (s.autoSweepPercent / 100)
            ),
          0
        ),
    [activeSprints]
  );

  const baseDcaMonthlyIDR = useMemo(
    () => assets.reduce((sum, a) => sum + a.autoDcaMonthlyIDR, 0),
    [assets]
  );

  const effectiveProfile: UserAccountProfile | null = useMemo(() => {
    if (!profile) return null;
    if (!serverQuota) return profile;
    return {
      ...profile,
      planTier: serverQuota.planTier,
      aiCreditsUsed: Math.max(profile.aiCreditsUsed, serverQuota.aiCreditsUsed),
      aiCreditsLimit: serverQuota.aiCreditsLimit,
    };
  }, [profile, serverQuota]);

  const canUseAI = effectiveProfile
    ? effectiveProfile.aiCreditsUsed < effectiveProfile.aiCreditsLimit
    : false;

  const handleConsumeAiCredit = async (quota?: {
    planTier: "free" | "pro";
    aiCreditsUsed: number;
    aiCreditsLimit: number;
  }) => {
    if (quota) {
      setServerQuota(quota);
    }
    if (user && profile && profile.aiCreditsUsed < 5) {
      await incrementUserAiCredit(user.uid);
    }
  };

  const handleSaveAsset = async (
    assetData: Omit<PortfolioAsset, "id">,
    existingId?: string
  ) => {
    if (!user) return;
    await upsertUserAsset(user.uid, assetData, existingId);
  };

  const handleDeleteAsset = async (id: string) => {
    if (!user) return;
    await deleteUserAsset(user.uid, id);
  };

  const handleActivateOpportunity = async (opp: OpportunityBlueprint) => {
    if (!user) return;
    if (activeSprints.some((s) => s.title === opp.title)) return;
    await activateUserSprint(user.uid, opp);
  };

  const handleToggleStep = async (sprintId: string, stepIndex: number) => {
    if (!user) return;
    const target = activeSprints.find((s) => s.id === sprintId);
    if (!target) return;
    const nextSteps = [...target.completedSteps];
    nextSteps[stepIndex] = !nextSteps[stepIndex];
    await updateUserSprintSteps(user.uid, sprintId, nextSteps);
  };

  const handleToggleSweep = async (sprintId: string) => {
    if (!user) return;
    const target = activeSprints.find((s) => s.id === sprintId);
    if (!target) return;
    await updateUserSprintSweep(user.uid, sprintId, !target.sweptToPortfolio);
  };

  const handleRemoveSprint = async (sprintId: string) => {
    if (!user) return;
    await deleteUserSprint(user.uid, sprintId);
  };

  const handleToggleRule = async (ruleId: string) => {
    if (!user) return;
    const target = rules.find((r) => r.id === ruleId);
    if (!target) return;
    await updateUserRule(
      user.uid,
      ruleId,
      !target.enabled,
      target.allocationPercent ?? 0
    );
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Menyiapkan sesi akun...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LandingView
        onSignIn={handleSignIn}
        authLoading={authLoading}
        authError={authError}
      />
    );
  }

  if (workspaceLoading || !effectiveProfile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Memuat data portofolio cloud Anda...</span>
        </div>
      </div>
    );
  }

  const currentMeta = TAB_TITLES[activeTab];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        activeSprintCount={activeSprints.length}
        profile={effectiveProfile}
        userPhotoUrl={user.photoURL}
        onUpgradePro={() => setUpgradeModalOpen(true)}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary CTA on right */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 truncate">
                {currentMeta.breadcrumb}
              </p>
              <h1 className="font-display text-base sm:text-lg font-semibold text-slate-900 truncate">
                {currentMeta.title}
              </h1>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingAsset(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tambah Aset</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-8 max-w-[1240px] w-full mx-auto">
          {activeTab === "overview" && (
            <OverviewView
              assets={assets}
              monthlyExpenseIDR={localExpenseIDR}
              onUpdateMonthlyExpense={handleUpdateMonthlyExpense}
              sideCashflowIDR={sideCashflowIDR}
              onAddAssetClick={() => {
                setEditingAsset(null);
                setModalOpen(true);
              }}
              onEditAssetClick={(asset) => {
                setEditingAsset(asset);
                setModalOpen(true);
              }}
              onDeleteAsset={handleDeleteAsset}
              onNavigateTab={setActiveTab}
              canUseAI={canUseAI}
              onConsumeAiCredit={handleConsumeAiCredit}
            />
          )}

          {activeTab === "opportunities" && (
            <OpportunitiesView
              activeSprints={activeSprints}
              onActivateOpportunity={handleActivateOpportunity}
              onToggleStep={handleToggleStep}
              onToggleSweepToPortfolio={handleToggleSweep}
              onRemoveSprint={handleRemoveSprint}
              canUseAI={canUseAI}
              onConsumeAiCredit={handleConsumeAiCredit}
            />
          )}

          {activeTab === "automation" && (
            <AutomationView
              rules={rules}
              onToggleRule={handleToggleRule}
              split={localSplit}
              onUpdateSplit={handleUpdateSplit}
              monthlyTotalInflowIDR={baseDcaMonthlyIDR + sideCashflowIDR}
            />
          )}

          {activeTab === "advisor" && (
            <AdvisorView
              assets={assets}
              monthlyCashflowIDR={baseDcaMonthlyIDR + sideCashflowIDR}
              monthlyExpenseIDR={localExpenseIDR}
              autoInvestPercent={
                rules.find((r) => r.id === "rule-side-sweep")
                  ?.allocationPercent || 40
              }
              activeSprints={activeSprints}
              canUseAI={canUseAI}
              onConsumeAiCredit={handleConsumeAiCredit}
            />
          )}
        </main>
      </div>

      <AssetModal
        open={modalOpen}
        editingAsset={editingAsset}
        onClose={() => {
          setModalOpen(false);
          setEditingAsset(null);
        }}
        onSave={handleSaveAsset}
      />

      <UpgradeProModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        pendingOrderId={pendingOrderId}
        onSaveReceipt={async (orderId, status) => {
          setPendingOrderId(orderId);
          await saveUserPaymentReceipt(user.uid, orderId, status);
        }}
        onVerifiedPro={(orderId, aiCreditsLimit) => {
          setPendingOrderId(orderId);
          setServerQuota((prev) => ({
            planTier: "pro",
            aiCreditsUsed: prev?.aiCreditsUsed ?? effectiveProfile.aiCreditsUsed,
            aiCreditsLimit,
          }));
        }}
      />
    </div>
  );
}
