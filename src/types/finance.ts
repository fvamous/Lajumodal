export enum AssetCategory {
  LIKUID_DARURAT = "Dana Darurat & Pasar Uang",
  PENDAPATAN_TETAP = "Obligasi & SBN Ritel",
  EKUITAS_DIVIDEN = "Saham Dividen & ETF Indeks",
  MODAL_USAHA = "Kas Putar Peluang Usaha",
}

export interface PortfolioAsset {
  id: string;
  name: string;
  ticker: string;
  category: AssetCategory;
  balanceIDR: number;
  targetPercent: number;
  annualYieldPercent: number;
  autoDcaMonthlyIDR: number;
}

export interface AutomationRule {
  id: string;
  title: string;
  trigger: string;
  actionSummary: string;
  enabled: boolean;
  allocationPercent?: number;
}

export interface AllocationSplit {
  emergencyPercent: number;
  fixedIncomePercent: number;
  equityDividendPercent: number;
  businessSeedPercent: number;
}

export interface OpportunityBlueprint {
  id: string;
  title: string;
  categoryTag: "Jasa Komputer" | "Produk Digital";
  modelType: string;
  capitalTier: "0-500rb" | "500rb-2jt" | "2jt-5jt";
  requiredCapitalIDR: number;
  daysToFirstCash: number;
  projectedMonthlyRecurringIDR: number;
  autoSweepPercent: number;
  whereToFindBuyers: string;
  sampleOfferScript: string;
  whyItWorks: string;
  first7DaysSteps: string[];
  isAI?: boolean;
}

export interface AIOfferKit {
  offerTitle: string;
  targetNiche: string;
  suggestedPriceIDR: number;
  whereToFindBuyersToday: string[];
  readyToSendScript: string;
  deliveryChecklist: string[];
}

export interface ActiveSprintItem extends OpportunityBlueprint {
  activatedAt: string;
  completedSteps: boolean[];
  sweptToPortfolio: boolean;
}

export interface AIRebalanceResult {
  summary: string;
  emergencyFundStatus: string;
  monthlyDcaPlan: {
    assetName: string;
    recommendedAmountIDR: number;
    recommendedTargetPercent: number;
    rationale: string;
  }[];
  nextActions: string[];
}

export interface AdvisorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export type WorkspaceTab = "overview" | "opportunities" | "automation" | "advisor";

export interface UserAccountProfile {
  ownerId: string;
  displayName: string;
  email: string;
  planTier: "free" | "pro";
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  monthlyExpenseIDR: number;
  split: AllocationSplit;
}
