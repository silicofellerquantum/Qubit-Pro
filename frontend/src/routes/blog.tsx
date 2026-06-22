import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { SilicofellerLogo } from "@/components/silicofeller-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/blog")({
  component: BlogLayout,
});

function BlogLayout() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-[100svh] bg-[#F8F7F2] text-[#0F172A] selection:bg-[#7C3AED]/20 selection:text-[#0F172A] font-sans">
      {/* Grid background pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.25]"
        style={{ backgroundImage: "var(--grid-pattern)", backgroundSize: "32px 32px" }}
      />

      {/* Header — identical to landing page SiteNav */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${scrolled
            ? "border-b border-black/10 bg-[#E8E6DE]/85 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl"
            : "border-b border-transparent bg-[#E8E6DE]/40 backdrop-blur-md"
          }`}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 lg:px-10">
          <Link to="/" aria-label="SilicoFeller home" className="flex items-center">
            <SilicofellerLogo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-foreground/65 md:flex">
            <a href="/#about" className="transition-colors hover:text-foreground">
              About Us
            </a>
            <a href="/#technology" className="transition-colors hover:text-foreground">
              Technology
            </a>
            <a href="/#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <Link to="/documentation" className="transition-colors hover:text-foreground">
              Documentation
            </Link>
            <Link to="/community" className="transition-colors hover:text-foreground">
              Community
            </Link>
            <Link to="/blog" className="transition-colors hover:text-foreground font-medium text-[#7C3AED]">
              Blog
            </Link>
            <Link to="/our-team" className="transition-colors hover:text-foreground">
              Team
            </Link>
            <a href="/#contact" className="transition-colors hover:text-foreground">
              Contact
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className="h-9 rounded-full px-4 text-sm text-foreground hover:bg-black/5"
                >
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
                <Button
                  asChild
                  className="h-9 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90"
                >
                  <Link to="/dashboard">Open designer</Link>
                </Button>
              </>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className="h-9 rounded-full px-4 text-sm text-foreground hover:bg-black/5"
                >
                  <Link to="/sign-in">Sign in</Link>
                </Button>
                <Button
                  asChild
                  className="h-9 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90"
                >
                  <Link to="/sign-up">
                    Sign up <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="relative z-10">
        <Outlet />
      </div>
    </div>
  );
}