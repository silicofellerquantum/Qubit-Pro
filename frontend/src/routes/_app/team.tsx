import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Mail, Users, UserPlus, Trash2, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth, canAccess } from "@/lib/auth/auth-context";
import { fetchProjects as _dummy } from "@/lib/api/backend"; // Not used but keeps api import path structure

// Since apiFetch was defined locally in billing.tsx, we'll create a local helper here that uses the same logic or imports the global one.
// The global helper in backend.ts is named `api`.
import { apiFetch } from "@/lib/api/backend";

export const Route = createFileRoute("/_app/team")({
  head: () => ({
    meta: [{ title: "Team Management — Quantum Studio" }],
  }),
  component: TeamPage,
});

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

function TeamPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState<TeamState | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePlan, setInvitePlan] = useState("basic");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (user && !canAccess(user.role, "team")) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [user, navigate]);

  const fetchTeam = async () => {
    try {
      const data = await apiFetch<TeamState>("/api/team/members");
      setState(data);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load team data: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    if (state) {
      const planLimit = state.limits.find(l => l.plan === invitePlan);
      if (!planLimit || planLimit.used >= planLimit.total) {
        toast.error(`No ${invitePlan} licenses available. Please upgrade your plan in Billing.`);
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
    } catch (err: unknown) {
      toast.error("Failed to revoke invitation.");
    }
  };

  const handleRemoveMember = async (id: string) => {
    if (!confirm("Remove this member? They will lose access to Pro features.")) return;
    try {
      await apiFetch(`/api/team/members/${id}`, { method: "DELETE" });
      toast.success("Member removed.");
      fetchTeam();
    } catch (err: unknown) {
      toast.error("Failed to remove member.");
    }
  };

  if (loading || !state) {
    return <div className="p-8 text-center text-muted-foreground">Loading team data...</div>;
  }

  const totalLicenses = state.limits.reduce((acc, l) => acc + l.total, 0);
  const totalUsed = state.limits.reduce((acc, l) => acc + l.used, 0);
  const licensesAvailable = totalLicenses - totalUsed;
  const progressPercent = totalLicenses > 0 ? Math.round((totalUsed / totalLicenses) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10"
      >
        <div className="mb-8">
          <h1 className="text-[2rem] font-bold tracking-tight text-foreground">
            Team Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite colleagues to share your subscription benefits and collaborate on projects.
          </p>
        </div>

        {/* License Usage Widget */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <Card className="rounded-2xl border-border p-5 shadow-none">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Total Licenses Used
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-500 dark:bg-violet-900/20">
                <Users className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-foreground">
              {totalUsed} / {totalLicenses}
            </div>
            <Progress value={progressPercent} className="mt-3 h-1.5" />
            <div className="mt-4 space-y-2">
              {state.limits.map(l => (
                <div key={l.plan} className="flex justify-between text-xs text-muted-foreground">
                  <span className="capitalize">{l.plan} Plan</span>
                  <span>{l.used} / {l.total}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="rounded-2xl border-border p-5 shadow-none flex flex-col justify-center">
            <h3 className="text-sm font-semibold">Need more seats?</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              You currently have {licensesAvailable} {licensesAvailable === 1 ? "seat" : "seats"} available across all plans.
            </p>
            <Button variant="outline" size="sm" className="w-fit" onClick={() => navigate({ to: "/billing" })}>
              Manage Plan
            </Button>
          </Card>
        </div>

        {/* Invite Form */}
        <Card className="mb-8 rounded-2xl border-border p-6 shadow-none">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-muted-foreground" />
            Invite a Member
          </h2>
          <form onSubmit={handleInvite} className="mt-4 flex flex-col sm:flex-row gap-3">
            <Input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="max-w-sm rounded-full"
              required
            />
            <select
              className="rounded-full border border-input bg-background px-3 py-2 text-sm max-w-[150px]"
              value={invitePlan}
              onChange={(e) => setInvitePlan(e.target.value)}
            >
              <option value="basic">Basic Plan</option>
              <option value="pro">Pro Plan</option>
            </select>
            <Button 
              type="submit" 
              className="rounded-full bg-[#072654] text-white hover:bg-[#072654]/90"
              disabled={inviting || licensesAvailable <= 0}
            >
              <Mail className="mr-2 h-4 w-4" />
              Send Invite
            </Button>
          </form>
          {licensesAvailable <= 0 && (
            <p className="mt-2 text-xs text-red-500 font-medium">You must purchase more licenses before inviting.</p>
          )}
        </Card>

        {/* Team Table */}
        <Card className="rounded-2xl border-border p-6 shadow-none">
          <h2 className="mb-4 text-base font-semibold">Active Members</h2>
          {state.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active members yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Admin is self */}
                <TableRow>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {user?.name}
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300">You</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Shield className="h-3.5 w-3.5" /> Team Owner
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">—</TableCell>
                </TableRow>
                {state.members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">Member</div>
                      <Badge variant="secondary" className="mt-1 capitalize text-[10px]">{m.plan}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(m.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {state.pending_invites.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-4 text-base font-semibold">Pending Invitations</h2>
              <Table>
                <TableBody>
                  {state.pending_invites.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-sm">
                        {i.email}
                        <Badge variant="outline" className="ml-2">Pending</Badge>
                        <Badge variant="secondary" className="ml-2 capitalize text-[10px]">{i.plan}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleRevokeInvite(i.id)}>
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

      </motion.div>
    </div>
  );
}
