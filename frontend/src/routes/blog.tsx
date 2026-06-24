import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Menu, X } from "lucide-react";
import { SilicofellerLogo } from "@/components/silicofeller-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/blog")({
  component: BlogLayout,
});

const BLOG_NAV = [
  { label: "About Us", href: "/#about" },
  { label: "Technology", href: "/#technology" },
  { label: "Features", href: "/#features" },
  { label: "Documentation", href: "/documentation" },
  { label: "Community", href: "/community" },
  { label: "Blog", href: "/blog" },
  { label: "Team", href: "/#team" },
  { label: "Contact", href: "/#contact" },
];

function BlogLayout() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  // ESC to close
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="relative min-h-[100svh] bg-[#F8F7F2] text-[#0F172A] selection:bg-[#7C3AED]/20 selection:text-[#0F172A] font-sans">
      {/* Grid background pattern */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.25] -z-10"
        style={{ backgroundImage: "var(--grid-pattern)", backgroundSize: "32px 32px" }}
      />

      <div className="h-[76px]" aria-hidden />

      {/* ── Fixed header ───────────────────────────────────────────── */}
      <header
        className={`fixed top-0 left-0 w-full z-[9999] transition-all duration-300 ${
          scrolled
            ? "border-b border-black/10 bg-[#E8E6DE]/85 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl"
            : "border-b border-transparent bg-[#E8E6DE]/40 backdrop-blur-md"
        }`}
      >
        <nav className={`flex items-center justify-between px-4 sm:px-6 lg:px-10 transition-all duration-300 ${scrolled ? "py-2" : "py-4"}`}>
          <Link 
            to="/" 
            aria-label="Go to homepage" 
            onClick={(e) => {
              if (window.location.pathname === "/") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            className="flex items-center min-h-[44px] cursor-pointer"
          >
            <SilicofellerLogo />
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-7 text-sm text-foreground/65 md:flex" aria-label="Main navigation">
            {BLOG_NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`min-h-[44px] flex items-center transition-colors hover:text-foreground ${item.href === "/blog" ? "font-medium text-[#7C3AED]" : ""
                  }`}
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs + mobile hamburger */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <>
                  <Button asChild variant="ghost" className="h-9 min-h-[44px] rounded-full px-4 text-sm text-foreground hover:bg-black/5">
                    <Link to="/dashboard">Dashboard</Link>
                  </Button>
                  <Button asChild className="h-9 min-h-[44px] rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90">
                    <Link to="/schematic-editor">Open designer</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="ghost" className="h-9 min-h-[44px] rounded-full px-4 text-sm text-foreground hover:bg-black/5">
                    <Link to="/sign-in">Sign in</Link>
                  </Button>
                  <Button asChild className="h-9 min-h-[44px] rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90">
                    <Link to="/sign-up">Sign up <ArrowRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                </>
              )}
            </div>

            {/* Hamburger — mobile only */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="blog-mobile-nav"
              className="md:hidden inline-flex items-center justify-center w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg text-foreground hover:bg-foreground/5 transition-colors"
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileOpen ? (
                  <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <X className="h-5 w-5" />
                  </motion.span>
                ) : (
                  <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                    <Menu className="h-5 w-5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </nav>
      </header>

      {/* ── Mobile drawer + backdrop ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 top-[64px] z-40 bg-black/30 backdrop-blur-[2px]"
              aria-hidden
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              key="drawer"
              id="blog-mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="md:hidden fixed inset-x-0 top-[64px] z-50 max-h-[calc(100svh-64px)] overflow-y-auto bg-[#E8E6DE] shadow-xl pb-safe"
            >
              <nav className="flex flex-col px-4 sm:px-6 pt-2 pb-8" aria-label="Mobile navigation">
                {BLOG_NAV.map((item, i) => (
                  <motion.div key={item.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04, duration: 0.2 }}>
                    <a
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`w-full flex items-center border-b border-black/10 py-4 text-base font-medium min-h-[44px] transition-colors hover:text-[#F26B3A] ${item.href === "/blog" ? "text-[#7C3AED]" : "text-foreground"
                        }`}
                    >
                      {item.label}
                    </a>
                  </motion.div>
                ))}
                <motion.div className="mt-6 flex flex-col gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: BLOG_NAV.length * 0.04 + 0.05 }}>
                  {user ? (
                    <>
                      <Button variant="ghost" asChild className="w-full h-12 rounded-full border border-black/15 text-sm font-medium">
                        <Link to="/dashboard" onClick={() => setMobileOpen(false)}>Dashboard</Link>
                      </Button>
                      <Button asChild className="w-full h-12 rounded-full bg-foreground text-sm font-semibold text-background hover:bg-foreground/90">
                        <Link to="/schematic-editor" onClick={() => setMobileOpen(false)}>Open designer</Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" asChild className="w-full h-12 rounded-full border border-black/15 text-sm font-medium">
                        <Link to="/sign-in" onClick={() => setMobileOpen(false)}>Sign in</Link>
                      </Button>
                      <Button asChild className="w-full h-12 rounded-full bg-foreground text-sm font-semibold text-background hover:bg-foreground/90">
                        <Link to="/sign-up" onClick={() => setMobileOpen(false)}>
                          Sign up <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </>
                  )}
                </motion.div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="relative z-10">
        <Outlet />
      </div>
    </div>
  );
}
