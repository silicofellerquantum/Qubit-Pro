import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_auth/callback")({
  component: CallbackPage,
});

function CallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");

    if (token) {
      // We got a JWT from the backend!
      // Save it immediately so the next API calls will work.
      localStorage.setItem("qs_token", token);
      
      // Rehydrate the AuthContext or simply redirect and let it rehydrate automatically.
      // The easiest way is to reload the app state by redirecting to dashboard.
      toast.success("Successfully authenticated!");
      
      // We use window.location.href here to ensure the full React tree re-mounts
      // with the new token, pulling the user profile via /api/auth/me during initial load.
      window.location.href = "/dashboard";
    } else {
      toast.error("Authentication failed or was cancelled.");
      navigate({ to: "/sign-in" });
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">Completing authentication...</p>
      </div>
    </div>
  );
}
