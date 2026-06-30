import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/auth/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { SocialButton } from "@/components/auth/social-button";
import { QuantumHero } from "@/components/auth/quantum-hero";
import { useAuth } from "@/lib/auth/auth-context";
import { GoogleLogin } from "@react-oauth/google";
import { AdminLoginBanner } from "@/components/AdminLoginBanner";

export const Route = createFileRoute("/_auth/sign-in")({
  head: () => ({
    meta: [
      { title: "Sign in — Silicofeller" },
      {
        name: "description",
        content: "Sign in to Silicofeller to design optimized quantum chip architectures with AI.",
      },
      { property: "og:title", content: "Sign in — Silicofeller" },
      {
        property: "og:description",
        content: "Sign in to Silicofeller to design optimized quantum chip architectures with AI.",
      },
    ],
  }),
  component: SignInPage,
});

interface LoginFormState {
  email: string;
  password: string;
  isLoading: boolean;
  error: string | null;
}

function SignInPage() {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle, isDemoMode } = useAuth();
  const [email, setEmail] = useState(isDemoMode ? "admin@silicofeller.dev" : "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);

  const handleLogin = async (emailStr: string, passwordStr: string): Promise<void> => {
    const res = await signIn(emailStr, passwordStr);
    if (!res.ok) {
      throw new Error(res.error ?? "Login failed");
    }
  };

  const handleQuickAdminLogin = async () => {
    setEmail("admin@silicofeller.dev");
    setPassword("AdminDev123!");
    setLoading(true);
    try {
      await handleLogin("admin@silicofeller.dev", "AdminDev123!");
      toast.success("Signed in as Admin!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Quick admin login failed";
      toast.error(msg);
      setErrors({ password: msg });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address";
    if (password.length < 4) next.password = "Enter your password";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const res = await signIn(email, password);
      if (!res.ok) {
        toast.error(res.error);
        setErrors({ password: res.error });
        return;
      }
      toast.success("Signed in — welcome back");
      navigate({ to: "/dashboard" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (credential: string) => {
    const res = await signInWithGoogle(credential);
    if (!res.ok) {
      toast.error(res.error ?? "Google sign in failed");
      return;
    }
    toast.success("Signed in with Google!");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="grid flex-1 grid-cols-1 gap-8 px-4 sm:px-6 pt-4 sm:pt-6 pb-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:px-10">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="hidden lg:block"
      >
        <QuantumHero
          eyebrow="Quantum chip design platform"
          headline="Design Quantum Chips Using AI"
          description="Transform engineering requirements into production-ready quantum architectures through natural language."
        />
      </motion.section>

      <section className="flex items-center justify-center py-6 lg:py-12">
        <div className="w-full max-w-[440px] space-y-5">
          <AdminLoginBanner
            isDismissed={isBannerDismissed}
            onDismiss={() => setIsBannerDismissed(true)}
          />
          <AuthCard
            title="Welcome back"
            subtitle="Sign in to continue designing quantum hardware."
            footer={
              <>
                Don't have an account?{" "}
                <Link to="/sign-up" className="font-medium text-accent hover:text-accent/80">
                  Sign up
                </Link>
              </>
            }
          >
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <FormField label="Email" htmlFor="email" error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                />
              </FormField>
              <FormField label="Password" htmlFor="password" error={errors.password}>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11"
                />
              </FormField>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox id="remember" />
                  <span>Remember me</span>
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-accent hover:text-accent/80"
                >
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded-full text-sm font-semibold"
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>

              {isDemoMode && (
                <Button
                  type="button"
                  onClick={handleQuickAdminLogin}
                  disabled={loading}
                  variant="outline"
                  className="w-full h-11 rounded-full text-sm font-semibold border-blue-200 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all duration-300"
                >
                  Quick Admin Login
                </Button>
              )}
            </form>

            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>or continue with</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid gap-2.5">
              <div className="w-full flex justify-center [&>div]:w-full">
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    if (credentialResponse.credential) {
                      await handleGoogleLogin(credentialResponse.credential);
                    }
                  }}
                  onError={() => {
                    toast.error("Google sign in failed");
                  }}
                  theme="outline"
                  shape="pill"
                  width="100%"
                />
              </div>
              <SocialButton
                provider="github"
                label="Continue with GitHub"
                onClick={() => toast.info("GitHub sign in is coming soon!")}
              />
            </div>
          </AuthCard>
        </div>
      </section>
    </div>
  );
}
