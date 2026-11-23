import React, { useState } from "react";
import {
  BarChart3,
  Briefcase,
  Cpu,
  LogOut,
  MessageSquareText,
  X,
} from "lucide-react";
import { UserAccountProfile, WorkspaceTab } from "../types/finance";

interface SidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeSprintCount: number;
  profile: UserAccountProfile;
  userPhotoUrl?: string | null;
  onUpgradePro: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: {
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "overview", label: "Portofolio & Arus Kas", icon: BarChart3 },
  { id: "opportunities", label: "Peluang Minim Modal", icon: Briefcase },
  { id: "automation", label: "Otomatisasi AI", icon: Cpu },
  { id: "advisor", label: "Strategis Keuangan", icon: MessageSquareText },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
  activeSprintCount,
  profile,
  userPhotoUrl,
  onUpgradePro,
  onSignOut,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const initials = (profile.displayName || "LM")
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");

  const remainingAI = Math.max(0, profile.aiCreditsLimit - profile.aiCreditsUsed);

  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200 px-4 py-6">
      <div>
        <div className="flex items-center justify-between px-2 pb-6 border-b border-slate-100">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            LajuModal
          </span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Tutup navigasi"
            className="lg:hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-6 space-y-1" aria-label="Menu utama">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? "text-white" : "text-slate-500"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === "opportunities" && activeSprintCount > 0 && (
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      isActive ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    {activeSprintCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="pt-4 border-t border-slate-100 space-y-3">
        <div className="px-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">
              {profile.planTier === "pro" ? "Paket Pro" : "Paket Gratis"}
            </span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {remainingAI}/{profile.aiCreditsLimit} Kuota AI
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-all"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    (profile.aiCreditsUsed / Math.max(1, profile.aiCreditsLimit)) *
                      100
                  )
                )}%`,
              }}
            />
          </div>
          {profile.planTier === "free" && (
            <button
              type="button"
              onClick={onUpgradePro}
              className="w-full mt-1 px-3 py-1.5 text-xs font-medium text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              Upgrade Paket Pro (Rp 49rb)
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            {userPhotoUrl && !imgFailed ? (
              <img
                src={userPhotoUrl}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="h-9 w-9 rounded-lg object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {initials || "LM"}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {profile.displayName}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {profile.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Keluar dari akun"
            title="Keluar"
            className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] h-full z-10">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
