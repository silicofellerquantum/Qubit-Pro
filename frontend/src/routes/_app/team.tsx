import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  Mail,
  Users,
  UserPlus,
  Trash2,
  Shield,
  Briefcase,
  Crown,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, canAccess } from "@/lib/auth/auth-context";
import { apiFetch } from "@/lib/api/backend";

export const Route = createFileRoute("/_app/team")({
  head: () => ({
    meta: [{ title: "Users & Teams — Quantum Studio" }],
  }),
  component: TeamPage,
});

// ── Plan display helpers ──────────────────────────────────────────────────────

const PLAN_DISPLAY: Record<string, { label: string; color: string; bg: string; accent: string }> = {
  basic: {
    label: "Professional",
    color: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-100 dark:bg-violet-900/30",
    accent: "bg-violet-500",
  },
  pro: {
    label: "Team",
    color: "text-fuchsia-700 dark:text-fuchsia-300",
    bg: "bg-fuchsia-100 dark:bg-fuchsia-900/30",
    accent: "bg-fuchsia-500",
  },
};

function planLabel(key: string) {
  return PLAN_DISPLAY[key]?.label ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

function PlanBadge({ plan }: { plan: string }) {
  const d = PLAN_DISPLAY[plan];
  if (!d)
    return (
      <Badge variant="secondary" className="capitalize text-[10px]">
        {plan}
      </Badge>
    );
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${d.color} ${d.bg}`}
    >
      {d.label}
    </span>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string;
  plan: string;
  joined_at: string;
}

interface TeamInvite {
  id: string;
  email: string;
  plan: string;
  created_at: string;
}

interface PlanLimit {
  plan: string;
  total: number;
  used: number;
}

interface TeamState {
  limits: PlanLimit[];
  members: TeamMember[];
  pending_invites: TeamInvite[];
}

// ── Per-plan license card ─────────────────────────────────────────────────────

function PlanLicenseCard({ limit }: { limit: PlanLimit }) {
  const d = PLAN_DISPLAY[limit.plan];
  const pct = limit.total > 0 ? Math.round((limit.used / limit.total) * 100) : 0;
  const available = limit.total - limit.used;

  return (
    <Card className="rounded-2xl border-border p-5 shadow-none flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {limit.plan === "pro" ? (
            <Crown className="h-4 w-4 text-fuchsia-500" />
          ) : (
            <Briefcase className="h-4 w-4 text-violet-500" />
          )}
          <span className={`text-xs font-bold uppercase tracking-wider ${d?.color ?? "text-muted-foreground"}`}>
            {planLabel(limit.plan)} Plan
          </span>
        </div>
        <span className="text-[10px] font-medium text-muted-foreground">
          {available} seat{available !== 1 ? "s" : ""} free
        </span>
      </div>

      <div className="text-2xl font-bold tracking-tight text-foreground">
        {limit.used}
        <span className="text-base font-normal text-muted-foreground"> / {limit.total}</span>
      </div>

      <div className="space-y-1">
        <Progress
          value={pct}
          className={`h-2 rounded-full ${d?.accent ? `[&>div]:${d.accent}` : ""}`}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{limit.used} used</span>
          <span>{limit.total} total</span>
        </div>
      </div>

      {available === 0 && (
        <p className="text-[11px] text-red-500 font-medium flex items-center gap-1">
          <XCircle className="h-3.5 w-3.5" /> No seats available — upgrade to invite more
        </p>
      )}
      {available > 0 && (
        <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> {available} seat{available !== 1 ? "s" : ""} ready to assign
        </p>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function TeamPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState<TeamState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePlan, setInvitePlan] = useState("basic");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (user && !canAccess(user.role, "team")) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [user, navigate]);

  const fetchTeam = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<TeamState>("/api/team/members");
      setState(data);
    } catch (err: any) {
      const msg = err.message || String(err);
      setError(msg);
      toast.error("Failed to load team data: " + msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    if (state) {
      const planLimit = state.limits.find((l) => l.plan === invitePlan);
      if (!planLimit || planLimit.used >= planLimit.total) {
        toast.error(
          `No ${planLabel(invitePlan)} licenses available. Purchase more seats in Billing.`,
        );
        return;
      }
    }

    setInviting(true);
    try {
      await apiFetch("/api/team/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, plan: invitePlan }),
      });
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      fetchTeam();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to invite member";
      toast.error(message);
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await apiFetch(`/api/team/invite/${id}`, { method: "DELETE" });
      toast.success("Invitation revoked.");
      fetchTeam();
    } catch {
      toast.error("Failed to revoke invitation.");
    }
  };

  const handleRemoveMember = async (id: string) => {
    if (!confirm(
      `Remove this member from your team?\n\n` +
      `Their work (projects, designs, files) is fully preserved — nothing is deleted.\n` +
      `Their account will be locked at the Free tier until they receive a new licence.`
    )) return;
    try {
      await apiFetch(`/api/team/members/${id}`, { method: "DELETE" });
      toast.success("Member removed.");
      fetchTeam();
    } catch {
      toast.error("Failed to remove member.");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Users className="h-8 w-8 animate-pulse" />
          <p className="text-sm">Loading team data…</p>
        </div>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-red-500">Failed to load team data</p>
          <p className="text-xs text-muted-foreground max-w-xs">{error ?? "Unknown error"}</p>
          <Button variant="outline" size="sm" onClick={fetchTeam}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const totalLicenses = state.limits.reduce((acc, l) => acc + l.total, 0);
  const totalUsed = state.limits.reduce((acc, l) => acc + l.used, 0);
  const licensesAvailable = totalLicenses - totalUsed;

  // Which plans does this owner actually have seats for?
  const availablePlans = state.limits.map((l) => l.plan);
  const invitablePlans =
    availablePlans.length > 0 ? availablePlans : ["basic", "pro"];

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FB]">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10"
      >
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <Users className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">Users & Teams</h1>
              <p className="text-sm text-muted-foreground">
                As team chief, distribute your purchased licenses to colleagues via email invitation.
              </p>
            </div>
          </div>
        </div>

        {/* ── Per-plan license cards ── */}
        {state.limits.length > 0 ? (
          <div className={`mb-8 grid gap-4 ${state.limits.length === 1 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-" + Math.min(state.limits.length, 3)}`}>
            {state.limits.map((limit) => (
              <PlanLicenseCard key={limit.plan} limit={limit} />
            ))}

            {/* Need more seats card */}
            <Card className="rounded-2xl border-dashed border-border p-5 shadow-none flex flex-col justify-center items-start gap-3">
              <div className="text-sm font-semibold text-foreground">Need more seats?</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Purchase additional licenses in Billing to grow your team.
                {totalLicenses > 0 && (
                  <> You have <span className="font-semibold text-foreground">{licensesAvailable}</span> seat{licensesAvailable !== 1 ? "s" : ""} available total.</>
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => {
                  navigate({ to: "/billing" }).then(() => {
                    setTimeout(() => {
                      document.getElementById("choose-plans")?.scrollIntoView({ behavior: "smooth" });
                    }, 100);
                  });
                }}
              >
                Manage Plan →
              </Button>
            </Card>
          </div>
        ) : (
          /* No licenses purchased yet */
          <Card className="mb-8 rounded-2xl border-dashed border-violet-300 bg-violet-50/50 dark:bg-violet-950/20 p-6 shadow-none">
            <div className="flex flex-col items-center gap-3 text-center py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40">
                <Crown className="h-6 w-6 text-violet-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">No team licenses yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Purchase a Professional or Team plan to get seats you can share with colleagues.
                </p>
              </div>
              <Button
                size="sm"
                className="rounded-lg bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => {
                  navigate({ to: "/billing" }).then(() => {
                    setTimeout(() => {
                      document.getElementById("choose-plans")?.scrollIntoView({ behavior: "smooth" });
                    }, 100);
                  });
                }}
              >
                Buy Licenses
              </Button>
            </div>
          </Card>
        )}

        {/* ── Invite Form ── */}
        <Card className="mb-8 rounded-2xl border-border bg-white dark:bg-card p-6 shadow-none">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="h-5 w-5 text-violet-500" />
            <h2 className="text-base font-bold text-foreground">Invite a Team Member</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Enter the email address of the colleague you want to add. They'll receive an invitation link to join your team.
          </p>

          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 min-w-0">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Email Address
              </label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="rounded-xl h-10 text-sm"
                required
              />
            </div>

            <div className="w-full sm:w-52">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Assign Plan
              </label>
              <select
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                value={invitePlan}
                onChange={(e) => setInvitePlan(e.target.value)}
              >
                {invitablePlans.map((p) => (
                  <option key={p} value={p}>
                    {planLabel(p)} Plan
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              className="h-10 rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-5 whitespace-nowrap"
              disabled={inviting || licensesAvailable <= 0}
            >
              <Mail className="mr-2 h-4 w-4" />
              {inviting ? "Sending…" : "Send Invite"}
            </Button>
          </form>

          {licensesAvailable <= 0 && totalLicenses > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/20 px-3 py-2">
              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-600 font-medium">
                All seats are taken. Purchase more licenses in Billing to invite more members.
              </p>
            </div>
          )}
        </Card>

        {/* ── Active Members Table ── */}
        <Card className="mb-6 rounded-2xl border-border bg-white dark:bg-card p-6 shadow-none">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" /> Active Members
            </h2>
            <span className="text-xs text-muted-foreground">
              {state.members.length + 1} member{state.members.length !== 0 ? "s" : ""}
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">User</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Plan</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Role</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Owner row — always shown */}
              <TableRow className="border-border">
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-[11px] font-bold text-violet-700 dark:text-violet-300 shrink-0">
                      {user?.initials ?? "AU"}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        {user?.name}
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 text-[9px] px-1.5">
                          You
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{user?.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <PlanBadge plan={user?.role === "admin" ? "pro" : "basic"} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <Crown className="h-3.5 w-3.5" /> Team Chief
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm">—</TableCell>
              </TableRow>

              {state.members.map((m) => (
                <TableRow key={m.id} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                        {m.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <PlanBadge plan={m.plan} />
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">Member</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-red-50 dark:hover:bg-red-950/20"
                      onClick={() => handleRemoveMember(m.id)}
                      title="Remove member"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {state.members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No team members yet. Send an invite above to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        {/* ── Pending Invitations ── */}
        {state.pending_invites.length > 0 && (
          <Card className="rounded-2xl border-border bg-white dark:bg-card p-6 shadow-none">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> Pending Invitations
              </h2>
              <span className="text-xs text-muted-foreground">
                {state.pending_invites.length} pending
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Email</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Plan</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Sent</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.pending_invites.map((i) => (
                  <TableRow key={i.id} className="border-border">
                    <TableCell className="text-sm font-medium text-foreground">{i.email}</TableCell>
                    <TableCell>
                      <PlanBadge plan={i.plan} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(i.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600"
                        onClick={() => handleRevokeInvite(i.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
