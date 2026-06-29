import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Check,
  CreditCard,
  Download,
  Plus,
  Sparkles,
  Zap,
  Layers,
  Lock,
  Users,
  GitBranch,
  Cpu,
  FileCheck,
  Microscope,
  ArrowRight,
  X,
  AlertCircle,
  RefreshCw,
  Database,
  Loader2,
  Tag,
  Briefcase,
  Percent,
  LifeBuoy,
  ShieldCheck,
  Server,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth, canAccess } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/_app/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Plans — Quantum Studio" },
      {
        name: "description",
        content:
          "Manage your Quantum Studio subscription — Free, Basic, or Pro with collaborative chip design.",
      },
    ],
  }),
  component: BillingPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanKey = "free" | "basic" | "pro" | "test_usd" | "test_inr";
type BillingCycle = "monthly" | "annual";

interface BillingState {
  plan: PlanKey;
  billing_cycle: BillingCycle;
  subscription_status: string | null;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
}

interface SubscriptionState {
  id: string;
  plan: string;
  billing_cycle: string;
  quantity: number;
  status: string;
}

// Razorpay checkout.js type shim
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  subscription_id?: string;
  name: string;
  description: string;
  image?: string;
  currency: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: {
    ondismiss?: () => void;
  };
}

interface RazorpayInstance {
  open(): void;
  on(event: string, handler: () => void): void;
}

// ─── Plan data ────────────────────────────────────────────────────────────────

const PLANS: {
  key: PlanKey;
  name: string;
  price: { monthly: number | null; annual: number | null };
  tagline: string;
  designs: number;
  badge?: string;
  accentClass: string;
  ringClass: string;
  features: { icon: React.ElementType; text: string; muted?: boolean }[];
  cta: string;
  ctaVariant: "ghost" | "outline" | "default";
  currency?: string;
}[] = [
  {
    key: "free",
    name: "Free",
    price: { monthly: 0, annual: 0 },
    tagline: "Explore quantum chip design at no cost.",
    designs: 2,
    accentClass: "text-slate-500",
    ringClass: "border-border",
    features: [
      { icon: Layers, text: "2 active chip designs" },
      { icon: Cpu, text: "Quantum Editor access" },
      { icon: FileCheck, text: "Basic DRC checks" },
      { icon: Microscope, text: "Community support" },
      { icon: GitBranch, text: "Version control" },
      { icon: Users, text: "Collaborative mode", muted: true },
    ],
    cta: "Current Plan",
    ctaVariant: "ghost",
  },
  {
    key: "basic",
    name: "Basic",
    price: { monthly: 199, annual: 169 },
    tagline: "For engineers working on real projects.",
    designs: 5,
    badge: "Most Popular",
    accentClass: "text-violet-500",
    ringClass: "border-violet-500/60",
    features: [
      { icon: Layers, text: "5 active chip designs" },
      { icon: Cpu, text: "Full Quantum Editor + QCLang" },
      { icon: FileCheck, text: "Advanced DRC + fabrication rules" },
      { icon: Microscope, text: "Physics analysis & simulations" },
      { icon: GitBranch, text: "Version control + branch history" },
      { icon: Users, text: "Collaborative mode", muted: true },
    ],
    cta: "Upgrade to Basic",
    ctaVariant: "default",
  },
  {
    key: "pro",
    name: "Pro",
    price: { monthly: 249, annual: 209 },
    tagline: "Build together. Ship faster. Go quantum.",
    designs: 10,
    accentClass: "text-fuchsia-500",
    ringClass: "border-fuchsia-500/60",
    features: [
      { icon: Layers, text: "10 active chip designs (2× Basic)" },
      { icon: Cpu, text: "Everything in Basic" },
      { icon: FileCheck, text: "Priority DRC queue" },
      { icon: Microscope, text: "Advanced EM simulations" },
      { icon: GitBranch, text: "Full version control history" },
      { icon: Users, text: "Real-time collaborative mode ✦" },
    ],
    cta: "Upgrade to Pro",
    ctaVariant: "default",
  },
];

const TEST_PLANS = [
  {
    key: "test_usd",
    name: "Test USD",
    price: { monthly: 2, annual: 2 },
    tagline: "Test payment of 2 USD.",
    designs: 3,
    accentClass: "text-blue-500",
    ringClass: "border-blue-500/60",
    features: [{ icon: Layers, text: "Test payment USD" }],
    cta: "Pay 2 USD",
    ctaVariant: "outline" as const,
  },
  {
    key: "test_inr",
    name: "Test INR",
    price: { monthly: 2, annual: 2 },
    tagline: "Test payment of 2 INR.",
    designs: 3,
    accentClass: "text-orange-500",
    ringClass: "border-orange-500/60",
    features: [{ icon: Layers, text: "Test payment INR" }],
    cta: "Pay 2 INR",
    ctaVariant: "outline" as const,
    currency: "₹",
  },
];

const CUSTOM_PLANS: {
  key: PlanKey | string;
  name: string;
  price: { monthly: number | null; annual: number | null };
  tagline: string;
  designs: number;
  badge?: string;
  accentClass: string;
  ringClass: string;
  features: { icon: React.ElementType; text: string; muted?: boolean }[];
  cta: string;
  ctaVariant: "ghost" | "outline" | "default";
}[] = [
  {
    key: "academic",
    name: "Academic",
    price: { monthly: null, annual: null },
    tagline: "For research institutions and universities. Contact us for special discounts.",
    designs: 20,
    accentClass: "text-teal-500",
    ringClass: "border-teal-500/60",
    features: [
      { icon: Tag, text: "Special academic pricing" },
      { icon: Users, text: "Discounted multi-seat licenses" },
      { icon: LifeBuoy, text: "Dedicated research support" },
    ],
    cta: "Contact Us",
    ctaVariant: "outline",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: { monthly: null, annual: null },
    tagline: "For large organizations scaling quantum. Contact us for custom volume discounts.",
    designs: 50,
    accentClass: "text-rose-500",
    ringClass: "border-rose-500/60",
    features: [
      { icon: Tag, text: "Custom volume discounts" },
      { icon: Briefcase, text: "Tailored enterprise pricing" },
      { icon: ShieldCheck, text: "Priority dedicated support" },
    ],
    cta: "Contact Us",
    ctaVariant: "outline",
  },
  {
    key: "onpremise",
    name: "On-Premise",
    price: { monthly: null, annual: null },
    tagline:
      "Complete control and security on your servers. Contact us for custom volume discounts.",
    designs: 100,
    badge: "Maximum Security",
    accentClass: "text-slate-800 dark:text-slate-200",
    ringClass: "border-slate-800/60 dark:border-slate-200/60",
    features: [
      { icon: Tag, text: "Custom enterprise pricing" },
      { icon: Percent, text: "Volume-based discounts" },
      { icon: Server, text: "Dedicated deployment team" },
    ],
    cta: "Contact Us",
    ctaVariant: "default",
  },
];

// ─── Analytics data ────────────────────────────────────────────────────────────

const designsData = [
  { m: "Jan", v: 0 },
  { m: "Feb", v: 0 },
  { m: "Mar", v: 1 },
  { m: "Apr", v: 0 },
  { m: "May", v: 1 },
  { m: "Jun", v: 0 },
];

const spendData = [
  { m: "Jan", v: 0 },
  { m: "Feb", v: 0 },
  { m: "Mar", v: 0 },
  { m: "Apr", v: 0 },
  { m: "May", v: 0 },
  { m: "Jun", v: 0 },
];

const ACCENT = "#8B5CF6";
const MUTED = "#A3A3A3";

const tooltipStyle = {
  background: "#0A0A0A",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  fontSize: 12,
  padding: "6px 10px",
};

// ─── Razorpay checkout loader ─────────────────────────────────────────────────

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_BASE = (
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "http://localhost:5000"
).replace(/\/$/, "");

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("qs_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function DesignDots({ total, used }: { total: number; used: number }) {
  return (
    <div className="mt-4 flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 w-2 rounded-full transition-colors",
            i < used ? "bg-foreground" : "bg-border",
          )}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">
        {used}/{total} designs
      </span>
    </div>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrentPlan,
  annual,
  onUpgrade,
  upgrading,
}: {
  plan: (typeof PLANS)[0];
  isCurrentPlan: boolean;
  annual: boolean;
  onUpgrade: (planKey: PlanKey, cycle: BillingCycle) => Promise<void>;
  upgrading: boolean;
}) {
  const price = annual ? plan.price.annual : plan.price.monthly;
  const isPro = plan.key === "pro";
  const isFree = plan.key === "free";

  const handleClick = async () => {
    if (price === null) {
      window.location.href = "/#contact";
      return;
    }
    if (isCurrentPlan || isFree) return;
    await onUpgrade(plan.key as PlanKey, annual ? "annual" : "monthly");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative flex h-full flex-col"
    >
      {/* Pro glow halo */}
      {isPro && (
        <div className="pointer-events-none absolute -inset-px rounded-3xl bg-gradient-to-br from-fuchsia-500/20 via-violet-500/10 to-transparent blur-xl" />
      )}

      <Card
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-3xl border p-7 shadow-none",
          plan.ringClass,
          isPro && "bg-gradient-to-b from-fuchsia-950/5 to-background",
          isCurrentPlan && "ring-1 ring-foreground/20",
        )}
      >
        {/* Badge */}
        {plan.badge && (
          <div className="absolute right-5 top-5">
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              {plan.badge}
            </span>
          </div>
        )}

        {/* Collab badge for Pro */}
        {isPro && (
          <div className="absolute left-5 top-5">
            <span className="flex items-center gap-1 rounded-full bg-fuchsia-100 px-2.5 py-0.5 text-[11px] font-semibold text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300">
              <Users className="h-3 w-3" />
              Collaborative
            </span>
          </div>
        )}

        {/* Name + price */}
        <div className={cn("flex flex-col", isPro ? "mt-7" : "mt-0")}>
          {price !== null && (
            <div
              className={cn("text-xs font-semibold uppercase tracking-widest", plan.accentClass)}
            >
              {plan.name}
            </div>
          )}
          <div className={cn("flex items-baseline gap-1", price !== null ? "mt-2" : "mt-0")}>
            {price === null ? (
              <span className={cn("text-3xl font-bold tracking-tight", plan.accentClass)}>
                {plan.name}
              </span>
            ) : price === 0 ? (
              <span className="text-4xl font-bold tracking-tight text-foreground">Free</span>
            ) : (
              <>
                <span className="text-4xl font-bold tracking-tight text-foreground">
                  {plan.currency || "$"}
                  {price}
                </span>
                <span className="text-sm text-muted-foreground">
                  /{plan.key.startsWith("test") ? "week" : "month"}
                </span>
                {annual && (
                  <span className="ml-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Save 15%
                  </span>
                )}
              </>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{plan.tagline}</p>
        </div>

        {/* Design dots */}
        {price !== null && (
          <DesignDots
            total={plan.designs}
            used={isFree ? 1 : plan.key === "basic" ? 2 : plan.key === "pro" ? 4 : 1}
          />
        )}

        {/* Divider */}
        <div className="my-5 h-px bg-border" />

        {/* Features */}
        <ul className="flex-1 space-y-3">
          {plan.features.map((f, i) => (
            <li
              key={i}
              className={cn(
                "flex items-center gap-2.5 text-sm",
                f.muted ? "text-muted-foreground/50" : "text-foreground",
              )}
            >
              {f.muted ? (
                <Lock className="h-4 w-4 shrink-0 text-border" />
              ) : (
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isPro
                      ? "text-fuchsia-500"
                      : plan.key === "basic"
                        ? "text-violet-500"
                        : "text-slate-400",
                  )}
                />
              )}
              <span>{f.text}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Button
          id={`plan-cta-${plan.key}`}
          className={cn(
            "mt-7 h-11 w-full rounded-full text-sm font-semibold",
            isCurrentPlan && "cursor-default opacity-60",
            isPro &&
              !isCurrentPlan &&
              "bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white hover:from-fuchsia-500 hover:to-violet-500",
            plan.key === "basic" &&
              !isCurrentPlan &&
              "bg-foreground text-background hover:bg-foreground/90",
          )}
          variant={isCurrentPlan ? "outline" : plan.ctaVariant}
          disabled={isCurrentPlan || isFree || upgrading}
          onClick={handleClick}
        >
          {upgrading ? <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {isCurrentPlan ? "Current Plan" : plan.cta}
          {!isCurrentPlan && !isFree && !upgrading && <ArrowRight className="ml-1.5 h-4 w-4" />}
        </Button>
      </Card>
    </motion.div>
  );
}

// ─── Collab Mode Banner ────────────────────────────────────────────────────────

function CollabBanner({ onUpgrade }: { onUpgrade: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-fuchsia-600 via-violet-600 to-indigo-600 p-px"
      >
        <div className="relative flex items-center justify-between gap-4 rounded-[15px] bg-background px-6 py-4">
          {/* Ambient shimmer */}
          <div className="pointer-events-none absolute inset-0 rounded-[15px] bg-gradient-to-r from-fuchsia-500/5 via-violet-500/5 to-indigo-500/5" />
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Pro: Real-time collaborative chip design
              </p>
              <p className="text-xs text-muted-foreground">
                Invite teammates to co-design on the same quantum chip canvas simultaneously.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button
              id="collab-banner-try-pro"
              size="sm"
              className="h-9 rounded-full bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 text-white hover:from-fuchsia-500 hover:to-violet-500"
              onClick={onUpgrade}
            >
              Try Pro
            </Button>
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Usage Snapshot ────────────────────────────────────────────────────────────

function UsageSnapshot({ plan }: { plan: PlanKey }) {
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const designSlots = plan === "free" ? 2 : plan === "basic" ? 5 : 10;
  const designsUsed = plan === "free" ? 1 : 1;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {[
        {
          label: "Active Plan",
          value: planLabel,
          sub: `${designSlots} design slot${designSlots > 1 ? "s" : ""}`,
          icon: Sparkles,
          color:
            plan === "free"
              ? "text-slate-500"
              : plan === "basic"
                ? "text-violet-500"
                : "text-fuchsia-500",
          bg:
            plan === "free"
              ? "bg-slate-50 dark:bg-slate-900/40"
              : plan === "basic"
                ? "bg-violet-50 dark:bg-violet-900/20"
                : "bg-fuchsia-50 dark:bg-fuchsia-900/20",
        },
        {
          label: "Designs Used",
          value: `${designsUsed} / ${designSlots}`,
          sub: designsUsed >= designSlots ? "At plan limit" : "Within plan limit",
          icon: Layers,
          color: "text-violet-500",
          bg: "bg-violet-50 dark:bg-violet-900/20",
          progress: Math.round((designsUsed / designSlots) * 100),
        },
        {
          label: "API Credits",
          value: "50",
          sub: "Free monthly allocation",
          icon: Zap,
          color: "text-amber-500",
          bg: "bg-amber-50 dark:bg-amber-900/20",
          progress: 34,
        },
      ].map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07 }}
        >
          <Card className="rounded-2xl border-border p-5 shadow-none">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </span>
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", s.bg)}>
                <s.icon className={cn("h-4 w-4", s.color)} />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-foreground">{s.value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.sub}</div>
            {typeof s.progress === "number" && (
              <Progress value={s.progress} className="mt-3 h-1.5" />
            )}
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Plan comparison table ─────────────────────────────────────────────────────

const COMPARE_ROWS: {
  feature: string;
  free: string | boolean;
  basic: string | boolean;
  pro: string | boolean;
}[] = [
  { feature: "Active designs", free: "2", basic: "5", pro: "10" },
  { feature: "Quantum Editor", free: true, basic: true, pro: true },
  { feature: "QCLang compiler", free: false, basic: true, pro: true },
  { feature: "DRC checks", free: "Basic", basic: "Full", pro: "Full + Priority" },
  { feature: "EM simulation", free: false, basic: true, pro: "Advanced" },
  { feature: "Physics analysis", free: false, basic: true, pro: true },
  { feature: "Version control", free: false, basic: true, pro: true },
  { feature: "Export (GDSII, SPICE)", free: false, basic: true, pro: true },
  { feature: "Collaborative mode", free: false, basic: false, pro: true },
  { feature: "Priority support", free: false, basic: false, pro: true },
];

function CompareValue({ val }: { val: string | boolean }) {
  if (val === false) return <X className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  if (val === true) return <Check className="mx-auto h-4 w-4 text-violet-500" />;
  return <span className="text-sm font-medium text-foreground">{val}</span>;
}

function CompareTable() {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-3.5 pl-5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Feature
            </th>
            <th className="py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Free
            </th>
            <th className="py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-violet-500">
              Basic
            </th>
            <th className="py-3.5 pr-5 text-center text-xs font-semibold uppercase tracking-wider text-fuchsia-500">
              Pro
            </th>
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row, i) => (
            <tr
              key={row.feature}
              className={cn(
                "border-b border-border/50 last:border-0",
                i % 2 === 0 ? "bg-background" : "bg-muted/20",
              )}
            >
              <td className="py-3 pl-5 font-medium text-foreground">{row.feature}</td>
              <td className="py-3 text-center">
                <CompareValue val={row.free} />
              </td>
              <td className="py-3 text-center">
                <CompareValue val={row.basic} />
              </td>
              <td className="py-3 pr-5 text-center">
                <CompareValue val={row.pro} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Razorpay Payment Dialog ───────────────────────────────────────────────────

function RazorpayPaymentDialog({
  plan,
  cycle,
  open,
  onOpenChange,
  onPay,
  paying,
  quantity,
  onQuantityChange,
}: {
  plan: PlanKey | null;
  cycle: BillingCycle;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPay: () => Promise<void>;
  paying: boolean;
  quantity: number;
  onQuantityChange: (q: number) => void;
}) {
  if (!plan || plan === "free") return null;
  const allPlans = [...PLANS, ...CUSTOM_PLANS, ...TEST_PLANS];
  const planObj = allPlans.find((p) => p.key === plan);
  if (!planObj) return null;
  const unitPrice = cycle === "annual" ? planObj.price.annual : planObj.price.monthly;
  const totalPrice = (unitPrice || 0) * quantity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upgrade to {planObj.name}</DialogTitle>
          <DialogDescription>
            You'll be charged <strong>${totalPrice}/month</strong> ({cycle}) via Razorpay's secure
            checkout. No card details are stored on our servers.
          </DialogDescription>
        </DialogHeader>

        {/* Quantity Selector */}
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div>
            <label className="text-sm font-semibold text-foreground">Number of Seats</label>
            <p className="text-xs text-muted-foreground">Purchase licenses for your team.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              disabled={paying || quantity <= 1}
            >
              -
            </Button>
            <span className="w-4 text-center text-sm font-medium">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onQuantityChange(quantity + 1)}
              disabled={paying}
            >
              +
            </Button>
          </div>
        </div>

        {/* Razorpay branding block */}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 p-5 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#072654]">
            <CreditCard className="h-6 w-6 text-white" />
          </div>
          <p className="text-sm font-semibold text-foreground">Powered by Razorpay</p>
          <p className="text-xs text-muted-foreground">
            UPI · Cards · Net Banking · Wallets · EMI — all in one secure checkout.
          </p>
          <div className="flex flex-wrap justify-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="rounded-md bg-background px-2 py-0.5 border border-border">Visa</span>
            <span className="rounded-md bg-background px-2 py-0.5 border border-border">
              Mastercard
            </span>
            <span className="rounded-md bg-background px-2 py-0.5 border border-border">UPI</span>
            <span className="rounded-md bg-background px-2 py-0.5 border border-border">
              Net Banking
            </span>
            <span className="rounded-md bg-background px-2 py-0.5 border border-border">
              Wallets
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            A secure Razorpay checkout window will open. Complete payment there — your card details
            never touch our servers.
          </span>
        </div>

        <DialogFooter className="gap-2">
          <Button
            id="razorpay-cancel-btn"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={paying}
          >
            Cancel
          </Button>
          <Button
            id="razorpay-pay-btn"
            className="h-10 rounded-full bg-[#072654] px-6 text-white hover:bg-[#072654]/90"
            onClick={onPay}
            disabled={paying}
          >
            {paying ? (
              <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-1.5 h-4 w-4" />
            )}
            {paying ? "Opening Checkout…" : `Pay $${totalPrice}/mo with Razorpay`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function BillingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !canAccess(user.role, "billing")) navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  const [billingState, setBillingState] = useState<BillingState>({
    plan: "free",
    billing_cycle: "monthly",
    subscription_status: null,
    razorpay_customer_id: null,
    razorpay_subscription_id: null,
  });
  const [ownedSubscriptions, setOwnedSubscriptions] = useState<SubscriptionState[]>([]);
  const [billingLoading, setBillingLoading] = useState(true);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [annual, setAnnual] = useState(false);
  const [emailInvoice, setEmailInvoice] = useState(true);
  const [showCompare, setShowCompare] = useState(false);

  // ── Upgrade flow state ─────────────────────────────────────────────────────
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);
  const [pendingCycle, setPendingCycle] = useState<BillingCycle>("monthly");
  const [pendingQuantity, setPendingQuantity] = useState<number>(1);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // ── Invoices ───────────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<
    Array<{
      id: string;
      date?: string; // legacy fallback
      paid_at?: number; // Razorpay Unix timestamp (seconds)
      issued_at?: number; // Razorpay Unix timestamp (seconds)
      amount?: number; // in smallest currency unit (paise/cents)
      currency?: string; // "INR" | "USD" etc.
      status?: string;
      short_url?: string;
    }>
  >([]);

  // ── Load billing state on mount ────────────────────────────────────────────
  const fetchBilling = useCallback(async () => {
    try {
      setBillingLoading(true);
      const data = await apiFetch<BillingState>("/api/billing/me");
      setBillingState(data);
      setAnnual(data.billing_cycle === "annual");

      const subsData = await apiFetch<{ subscriptions: SubscriptionState[] }>(
        "/api/billing/subscription",
      );
      setOwnedSubscriptions(subsData.subscriptions || []);
    } catch {
      // Backend not yet configured — fall back to free defaults silently
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    async function fetchInvoices() {
      try {
        const data = await apiFetch<{ invoices: typeof invoices; count: number }>(
          "/api/billing/invoices",
        );
        setInvoices(data.invoices);
      } catch {
        // Not fatal — invoices section shows empty state
      }
    }
    fetchBilling();
    fetchInvoices();
  }, [fetchBilling]);

  // ── Razorpay checkout flow ─────────────────────────────────────────────────
  const handleUpgrade = useCallback(async (planKey: PlanKey, cycle: BillingCycle) => {
    setPendingPlan(planKey);
    setPendingCycle(cycle);
    setShowPayDialog(true);
  }, []);

  const handleProTryFromBanner = useCallback(() => {
    handleUpgrade("pro", annual ? "annual" : "monthly");
  }, [annual, handleUpgrade]);

  const handleRazorpayPay = useCallback(async () => {
    if (!pendingPlan || pendingPlan === "free") return;

    setUpgrading(true);
    try {
      // 1. Load Razorpay checkout script
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error("Could not load Razorpay checkout. Check your internet connection.");
        return;
      }

      // 2. Ensure Razorpay customer exists
      await apiFetch("/api/billing/customer", { method: "POST" });

      // 3. Create subscription on backend
      const sub = await apiFetch<{ id: string; [k: string]: unknown }>(
        "/api/billing/subscription",
        {
          method: "POST",
          body: JSON.stringify({
            plan: pendingPlan,
            cycle: pendingCycle,
            total_count: pendingCycle === "annual" ? 12 : 12,
            quantity: pendingQuantity,
          }),
        },
      );

      if (!sub.id) {
        toast.error("Failed to create subscription. Please try again.");
        return;
      }

      // 4. Open Razorpay Checkout
      setShowPayDialog(false);

      const rzpKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID ?? "rzp_test_REPLACE_ME";

      const rzpOptions: RazorpayOptions = {
        key: rzpKeyId,
        subscription_id: sub.id as string,
        name: "Silicofeller Quantum Studio",
        description: `${pendingPlan.charAt(0).toUpperCase() + pendingPlan.slice(1)} Plan — ${pendingCycle}`,
        currency: pendingPlan === "test_inr" ? "INR" : "USD",
        prefill: {
          name: user?.name,
          email: user?.email,
        },
        theme: { color: "#8B5CF6" },
        handler: async (response) => {
          // 5. Verify payment signature on backend — this is the authoritative step
          try {
            const result = await apiFetch<{
              verified: boolean;
              plan: PlanKey;
              billing_cycle: BillingCycle;
              subscription_status: string;
            }>("/api/billing/verify-payment", {
              method: "POST",
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            if (result.verified) {
              setBillingState((prev) => ({
                ...prev,
                plan: result.plan,
                billing_cycle: result.billing_cycle,
                subscription_status: result.subscription_status,
              }));
              toast.success(
                `🎉 Upgraded to ${result.plan.charAt(0).toUpperCase() + result.plan.slice(1)}! Welcome aboard.`,
              );
            } else {
              toast.error("Payment verification failed. Contact support.");
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Verification failed";
            toast.error(`Payment verification error: ${message}`);
          } finally {
            setUpgrading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setUpgrading(false);
            toast("Payment cancelled.");
          },
        },
      };

      const rzp = new window.Razorpay(rzpOptions);
      rzp.on("payment.failed", () => {
        setUpgrading(false);
        toast.error("Payment failed. Please try again or use a different payment method.");
      });
      rzp.open();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(`Upgrade failed: ${message}`);
      setUpgrading(false);
    }
  }, [pendingPlan, pendingCycle, pendingQuantity, user]);

  const handleSwitchPlan = async (plan: string) => {
    try {
      const res = await apiFetch<{ status: string; plan: string }>("/api/billing/switch-plan", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      if (res.status === "success") {
        toast.success(`Switched active plan to ${plan}`);
        fetchBilling();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to switch plan";
      toast.error(message);
    }
  };

  const handleCancelSubscription = useCallback(
    async (subscriptionId?: string) => {
      if (!subscriptionId) {
        toast.error("Cannot cancel without a subscription ID.");
        return;
      }
      if (
        !confirm(
          "Are you sure you want to turn off auto-renewal? You will lose access at the end of the billing cycle.",
        )
      )
        return;
      setCancelling(true);
      try {
        const result = await apiFetch<{ status: string; razorpay_status: string }>(
          "/api/billing/cancel-subscription",
          {
            method: "POST",
            body: JSON.stringify({ subscription_id: subscriptionId }),
          },
        );
        if (result.status === "success") {
          toast.success(
            "Auto-renewal disabled. Plan will remain active until the end of the cycle.",
          );
          fetchBilling();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to turn off auto-renewal";
        toast.error(message);
      } finally {
        setCancelling(false);
      }
    },
    [fetchBilling],
  );

  const handleToggleAutoRenew = (val: boolean) => {
    if (!val) {
      const activeSub = ownedSubscriptions.find((s) => s.status === "active");
      if (activeSub) {
        handleCancelSubscription(activeSub.id);
      } else {
        toast.error("No active subscription found.");
      }
    } else {
      toast.info("Cannot re-enable auto-renewal. Please purchase a new plan.");
    }
  };

  const currentPlan = billingState.plan as PlanKey;

  return (
    // ── Scroll fix: billing page gets its own scroll container ──────────────
    // The shared _app.tsx <main> has overflow-hidden (needed for canvas pages).
    // We fix scrolling here only, scoped to billing, without touching the layout.
    <div className="h-full overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10"
      >
        {/* ── Header ── */}
        <div className="mb-8">
          <h1 className="text-[2rem] font-bold tracking-tight text-foreground">
            Plans &amp; Billing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {billingLoading ? (
              "Loading your plan…"
            ) : currentPlan === "free" ? (
              <>
                You're on the <strong>Free plan</strong>. Upgrade to unlock more designs and team
                features.
              </>
            ) : (
              <>
                You're on the{" "}
                <strong className={currentPlan === "pro" ? "text-fuchsia-600" : "text-violet-600"}>
                  {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan
                </strong>
                {billingState.subscription_status === "halted" && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    ⚠ Payment issue
                  </span>
                )}
                {billingState.subscription_status === "active" && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Active
                  </span>
                )}
                {billingState.subscription_status === "cancelled" && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    Cancels at cycle end
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        {/* ── Collab banner (only on free plan) ── */}
        {currentPlan === "free" && (
          <div className="mb-8">
            <CollabBanner onUpgrade={handleProTryFromBanner} />
          </div>
        )}

        {/* ── Usage snapshot ── */}
        <section className="mb-10">
          <UsageSnapshot plan={currentPlan} />
        </section>

        {/* ── Plan picker ── */}
        <section className="mb-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Choose a Plan</h2>
              <p className="text-sm text-muted-foreground">
                All plans include the Quantum Editor and DRC engine.
              </p>
            </div>

            {/* Annual toggle */}
            <div className="flex items-center gap-2 rounded-full border border-border bg-muted/30 px-4 py-2">
              <span
                className={cn(
                  "text-sm",
                  !annual ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                Monthly
              </span>
              <Switch id="billing-cycle-toggle" checked={annual} onCheckedChange={setAnnual} />
              <span
                className={cn(
                  "text-sm",
                  annual ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                Annual
              </span>
              {annual && (
                <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Save 15%
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                isCurrentPlan={plan.key === currentPlan}
                annual={annual}
                onUpgrade={handleUpgrade}
                upgrading={upgrading && pendingPlan === plan.key}
              />
            ))}
          </div>

          {/* Custom Plans Grid */}
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            {CUSTOM_PLANS.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan as any}
                isCurrentPlan={false}
                annual={annual}
                onUpgrade={handleUpgrade}
                upgrading={false}
              />
            ))}
          </div>

          {/* Test Plans Grid */}
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {TEST_PLANS.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan as any}
                isCurrentPlan={plan.key === currentPlan}
                annual={annual}
                onUpgrade={handleUpgrade}
                upgrading={upgrading && pendingPlan === plan.key}
              />
            ))}
          </div>

          {/* Compare toggle */}
          <div className="mt-5 text-center">
            <button
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => setShowCompare((v) => !v)}
            >
              {showCompare ? "Hide" : "See full"} feature comparison
            </button>
          </div>

          <AnimatePresence>
            {showCompare && (
              <motion.div
                key="compare"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-5 overflow-hidden"
              >
                <CompareTable />
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── Analytics ── */}
        <section className="mb-10">
          <h2 className="mb-5 text-xl font-semibold text-foreground">Usage Overview</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl border-border p-5 shadow-none">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Designs Created</h3>
                <p className="text-xs text-muted-foreground">Monthly volume</p>
              </div>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={designsData} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke="#F0F0F0" vertical={false} />
                    <XAxis
                      dataKey="m"
                      stroke={MUTED}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis stroke={MUTED} fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "rgba(139,92,246,0.08)" }}
                    />
                    <Bar dataKey="v" fill={ACCENT} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="rounded-2xl border-border p-5 shadow-none">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Monthly Spend</h3>
                <p className="text-xs text-muted-foreground">USD billed</p>
              </div>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={spendData} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g-spend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#F0F0F0" vertical={false} />
                    <XAxis
                      dataKey="m"
                      stroke={MUTED}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis stroke={MUTED} fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={ACCENT}
                      strokeWidth={2}
                      fill="url(#g-spend)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </section>

        {/* ── Payment + Settings ── */}
        <section className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="rounded-2xl border-border p-6 shadow-none lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Payment Method</h2>
              {currentPlan === "free" ? (
                <Button
                  id="add-payment-razorpay-btn"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full"
                  onClick={() => handleUpgrade("basic", annual ? "annual" : "monthly")}
                >
                  <Plus className="mr-1 h-4 w-4" /> Upgrade Plan
                </Button>
              ) : null}
            </div>

            {currentPlan === "free" && ownedSubscriptions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
                No payment method added yet.
                <br />
                <span className="text-xs">Required when upgrading to a paid plan.</span>
                <br />
                <Button
                  id="razorpay-checkout-prompt"
                  className="mt-4 h-9 rounded-full bg-[#072654] px-5 text-white hover:bg-[#072654]/90 text-sm"
                  onClick={() => handleUpgrade("basic", annual ? "annual" : "monthly")}
                >
                  <CreditCard className="mr-1.5 h-4 w-4" />
                  Pay securely with Razorpay
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {ownedSubscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 px-5 py-4"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#072654]">
                      <CreditCard className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground capitalize">
                        {sub.plan} Subscription ({sub.quantity} seats)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sub.status === "active"
                          ? "Active — auto-renews each billing cycle"
                          : sub.status === "halted"
                            ? "⚠ Halted — please update your payment method in Razorpay"
                            : (sub.status ?? "Managed by Razorpay")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                          sub.status === "active"
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300",
                        )}
                      >
                        {sub.status ?? "–"}
                      </Badge>
                      {currentPlan !== sub.plan && sub.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSwitchPlan(sub.plan)}
                        >
                          Switch to {sub.plan}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="rounded-2xl border-border p-6 shadow-none">
            <h2 className="text-base font-semibold text-foreground">Billing Settings</h2>
            <div className="mt-4 space-y-4">
              <ToggleRow
                label="Auto Renewal"
                checked={billingState.subscription_status === "active"}
                onChange={handleToggleAutoRenew}
              />
              <ToggleRow label="Email Invoice" checked={emailInvoice} onChange={setEmailInvoice} />
            </div>
          </Card>
        </section>

        {/* ── Invoices ── */}
        <section>
          <Card className="rounded-2xl border-border p-6 shadow-none">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Invoices</h2>
              <span className="text-xs text-muted-foreground">
                {invoices.length > 0 ? `${invoices.length} total` : "No invoices yet"}
              </span>
            </div>

            {invoices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
                No invoices yet.
                <br />
                <span className="text-xs">Invoices appear here after your first payment.</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Download</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium text-foreground">{inv.id}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.paid_at
                          ? new Date(inv.paid_at * 1000).toLocaleDateString()
                          : inv.date
                            ? new Date(inv.date).toLocaleDateString()
                            : "—"}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {inv.amount != null
                          ? `${inv.currency === "INR" ? "₹" : "$"}${(inv.amount / 100).toFixed(2)}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300">
                          {inv.status ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full"
                          onClick={() => {
                            if (inv.short_url) {
                              window.open(inv.short_url, "_blank");
                            } else {
                              toast.info("Invoice link not available. Check Razorpay dashboard.");
                            }
                          }}
                        >
                          <Download className="mr-1 h-4 w-4" /> PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </section>
      </motion.div>

      {/* ── Razorpay payment dialog ── */}
      <RazorpayPaymentDialog
        plan={pendingPlan}
        cycle={pendingCycle}
        open={showPayDialog}
        onOpenChange={setShowPayDialog}
        onPay={handleRazorpayPay}
        paying={upgrading}
        quantity={pendingQuantity}
        onQuantityChange={setPendingQuantity}
      />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
