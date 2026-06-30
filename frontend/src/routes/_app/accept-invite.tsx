import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { CheckCircle, ShieldAlert, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { apiFetch } from "@/lib/api/backend";

export const Route = createFileRoute("/_app/accept-invite")({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if there is an invite token in the URL hash or query params.
    // In our simplified version, we just check if there is an invite for the logged-in user.
  }, []);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/team/accept-invite", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSuccess(true);
      toast.success("Welcome to the team! Your account has been upgraded.");
      setTimeout(() => {
        navigate({ to: "/dashboard" });
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to accept invite";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="flex flex-col items-center p-8 text-center rounded-3xl border-border shadow-sm">
          {success ? (
            <>
              <div className="mb-4 rounded-full bg-emerald-100 p-3 text-emerald-600 dark:bg-emerald-900/30">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h2 className="mb-2 text-2xl font-bold text-foreground">Invite Accepted!</h2>
              <p className="text-sm text-muted-foreground">
                You now have access to your team's pro features.
              </p>
            </>
          ) : (
            <>
              <div className="mb-4 rounded-full bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/30">
                <Users className="h-8 w-8" />
              </div>
              <h2 className="mb-2 text-2xl font-bold text-foreground">Team Invitation</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                You have been invited to join a team. Accept the invitation to upgrade your account and access shared resources.
              </p>

              {error && (
                <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20">
                  <ShieldAlert className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                size="lg"
                className="w-full rounded-full bg-[#072654] text-white hover:bg-[#072654]/90"
                onClick={handleAccept}
                disabled={loading}
              >
                {loading ? "Accepting..." : "Accept Invitation"}
              </Button>
              <Button
                variant="ghost"
                className="mt-3 w-full rounded-full"
                onClick={() => navigate({ to: "/dashboard" })}
                disabled={loading}
              >
                Decline & Go to Dashboard
              </Button>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
