import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";

export type FeatureKey = "download_svg" | "download_png" | "download_jpeg" | "download_code" | "run_code";

export function useFeatureGate() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [currentFeature, setCurrentFeature] = useState<FeatureKey | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const navigate = useNavigate();

  const checkAndRun = async (featureKey: FeatureKey, action: () => void | Promise<void>) => {
    if (isChecking) return;

    // Premium/Pro users bypass checks entirely on frontend for instant actions
    if (user?.isPremium) {
      try {
        await action();
      } catch (err) {
        console.error(err);
        toast.error("Action execution failed.");
      }
      return;
    }

    setIsChecking(true);
    try {
      const token = localStorage.getItem("qs_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const backendUrl = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/\/$/, "");
      
      // 1. GET /api/feature-usage/:featureKey
      const checkRes = await fetch(`${backendUrl}/api/feature-usage/${featureKey}`, { headers });
      if (!checkRes.ok) {
        throw new Error(`API check failed: ${checkRes.status}`);
      }
      const checkData = await checkRes.json();

      if (checkData.allowed) {
        // Run the action
        await action();

        // 2. POST /api/feature-usage/:featureKey (record usage)
        const recordRes = await fetch(`${backendUrl}/api/feature-usage/${featureKey}`, {
          method: "POST",
          headers,
        });
        if (!recordRes.ok) {
          console.warn("Failed to record feature usage on backend:", recordRes.status);
        }
      } else {
        setCurrentFeature(featureKey);
        setIsOpen(true);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to verify feature access. Please try again.");
    } finally {
      setIsChecking(false);
    }
  };

  const getFeatureLabel = (key: FeatureKey) => {
    switch (key) {
      case "download_svg": return "SVG download";
      case "download_png": return "PNG download";
      case "download_jpeg": return "JPEG download";
      case "download_code": return "code download";
      case "run_code": return "code run";
      default: return "feature";
    }
  };

  const GateDialog = () => (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="rounded-2xl sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-fuchsia-500 to-violet-500 bg-clip-text text-transparent">
            Upgrade to Pro
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            You've used your free {currentFeature ? getFeatureLabel(currentFeature) : "feature"}. Upgrade to Pro for unlimited access.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex gap-2 justify-end">
          <Button variant="outline" className="rounded-full h-9 text-xs" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-full h-9 bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white hover:from-fuchsia-500 hover:to-violet-500 text-xs font-semibold px-5"
            onClick={() => {
              setIsOpen(false);
              navigate({ to: "/billing" });
            }}
          >
            Get Pro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return {
    checkAndRun,
    isChecking,
    GateDialog,
  };
}
