import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SilicofellerLogo } from "@/components/silicofeller-logo";
import { useAuth } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/our-team")({
  head: () => ({
    meta: [
      { title: "Team — Silicofeller" },
      {
        name: "description",
        content:
          "Meet the team behind Silicofeller — quantum physicists, chip designers and AI researchers.",
      },
      { property: "og:title", content: "Team — Silicofeller" },
      {
        property: "og:description",
        content: "Meet the minds building the design layer of the quantum stack.",
      },
    ],
  }),
  component: OurTeamPage,
});

type Member = { name: string; role: string; photo: string; isCeo?: boolean };

const TEAM: Member[] = [
  { name: "Manan", role: "Founder & CEO", photo: "/teams/CEO.jpeg", isCeo: true },
  { name: "Majeti Susanth", role: "Technical Lead & COO", photo: "/teams/sushanth.jpeg" },
  { name: "Motinath R", role: "Quantum(Hardware)", photo: "/teams/motinath.png" },
  { name: "Viswanath M", role: "AI and Automation", photo: "/teams/Viswanath M.jpeg" },
  { name: "Harshitha Kurra", role: "Quantum Research", photo: "/teams/Harshitha.jpeg" },
  { name: "Pushpam Raj", role: "AI and Automation", photo: "/teams/pushpam.jpeg" },
  { name: "Hema Sri Peddu", role: "Quantum Research", photo: "/teams/Hema Sri Peddu.jpeg" },
  { name: "Praveenya Karumuri", role: "Operational Manager", photo: "/teams/Praveenya.jpeg" },
  { name: "Aakash G", role: "AI and Automation", photo: "/teams/Aakash.jpeg" },
  { name: "Harshith G", role: "AI and Automation", photo: "/teams/harshith.jpeg" },
  { name: "Marthand Bhargav J", role: "AI and Automation", photo: "/teams/Bhargav.jpeg" },
  {
    name: "Pathan Eshrath Khanam",
    role: "Operational Manager",
    photo: "/teams/Pathan Eshrath.jpeg",
  },
  { name: "Monalisa Panigrahi", role: "AI and Automation", photo: "teams/monalisa1.png" },
  { name: "Patchava Hima Bindu", role: "Quantum Research", photo: "/teams/hima bindu.jpeg" },
  { name: "Muni Sankar", role: "Quantum Research", photo: "/teams/Muni.jpeg" },
  { name: "Bhargav Korupolu", role: "Quantum Software Developer", photo: "/teams/bhargav K.png" },
  { name: "Geepika G", role: "AI and Automation", photo: "/teams/geepika.png" },
  { name: "Sathwik Potu", role: "AI and Automation", photo: "/teams/Sathwik potu.jpeg" },
  { name: "Amrutha Varshini Manam", role: "AI and Automation", photo: "/teams/amrutha.jpeg" },
  { name: "Sathesh Kumar Itraju", role: "AI and Automation", photo: "/teams/sathesh1.png" },
  { name: "P Naga Yaswanth", role: "AI and Automation", photo: "/teams/yaswanth.jpeg" },
  { name: "G Naga Vamsi Subbarayudu", role: "AI and Automation", photo: "/teams/satya.jpeg" },
  { name: "Arasavelli Sai Sankar", role: "US Outreach", photo: "/teams/sai sankarr.jpeg" },
  { name: "Kiran sai Srinivas Patnaikuni", role: "US Outreach", photo: "/teams/srinivas.png" },
];

const TEAM_NAV = [
  { label: "About Us", href: "/#about" },
  { label: "Technology", href: "/#technology" },
  { label: "Features", href: "/#features" },
  { label: "Blog", href: "/#blog" },
  { label: "Team", href: "/our-team" },
  { label: "Contact", href: "/#contact" },
];

function OurTeamPage() {
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
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // ESC to close
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const ordered = useMemo(() => {
    const ceo = TEAM.filter((m) => m.isCeo);
    const rest = TEAM.filter((m) => !m.isCeo);
    return [...ceo, ...rest];
  }, []);

  return (
    <main className="relative min-h-[100svh] bg-background text-foreground">
      {/* Spacer pushes content below the fixed navbar */}
      <div className="h-[64px]" aria-hidden />

      {/* ── Fixed header ─────────────────────────────────────────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-[9999] transition-all duration-300 ${
          scrolled
            ? "border-b border-black/10 bg-[#E8E6DE]/90 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl"
            : "border-b border-transparent bg-[#E8E6DE]/60 backdrop-blur-md"
        }`}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 lg:px-10">
          {/* Logo */}
          <Link to="/" aria-label="Silicofeller home" className="flex items-center min-h-[44px]">
            <SilicofellerLogo />
          </Link>

          {/* Desktop nav */}
          <nav
            className="hidden items-center gap-7 text-sm text-foreground/65 md:flex"
            aria-label="Main navigation"
          >
            {TEAM_NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`min-h-[44px] flex items-center transition-colors hover:text-foreground ${
                  item.href === "/our-team" ? "text-foreground font-semibold" : ""
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTAs + mobile hamburger */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <Button
                  asChild
                  className="h-9 min-h-[44px] rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90"
                >
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <Button
                  asChild
                  className="h-9 min-h-[44px] rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90"
                >
                  <Link to="/sign-up">
                    Sign up <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>

            {/* Hamburger — mobile only */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="team-mobile-nav"
              className="md:hidden inline-flex items-center justify-center w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg text-foreground hover:bg-foreground/5 transition-colors"
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileOpen ? (
                  <motion.span
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <X className="h-5 w-5" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="open"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Menu className="h-5 w-5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile drawer + backdrop ───────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 top-[64px] z-40 bg-black/30 backdrop-blur-[2px]"
              aria-hidden
              onClick={() => setMobileOpen(false)}
            />

            {/* Drawer */}
            <motion.div
              key="drawer"
              id="team-mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="md:hidden fixed inset-x-0 top-[64px] z-50 max-h-[calc(100svh-64px)] overflow-y-auto bg-[#E8E6DE] shadow-xl pb-safe"
            >
              <nav className="flex flex-col px-4 sm:px-6 pt-2 pb-8" aria-label="Mobile navigation">
                {TEAM_NAV.map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.2 }}
                  >
                    <a
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`w-full flex items-center border-b border-black/10 py-4 text-base font-medium min-h-[44px] transition-colors hover:text-[#F26B3A] ${
                        item.href === "/our-team" ? "text-[#F26B3A]" : "text-foreground"
                      }`}
                    >
                      {item.href === "/our-team" && (
                        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#F26B3A] shrink-0" />
                      )}
                      {item.label}
                    </a>
                  </motion.div>
                ))}

                {/* CTA buttons */}
                <motion.div
                  className="mt-6 flex flex-col gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: TEAM_NAV.length * 0.04 + 0.05 }}
                >
                  {user ? (
                    <Button
                      asChild
                      className="w-full h-12 rounded-full bg-foreground text-sm font-semibold text-background hover:bg-foreground/90"
                    >
                      <Link to="/dashboard" onClick={() => setMobileOpen(false)}>
                        Dashboard
                      </Link>
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        asChild
                        className="w-full h-12 rounded-full border border-black/15 text-sm font-medium"
                      >
                        <Link to="/sign-in" onClick={() => setMobileOpen(false)}>
                          Sign in
                        </Link>
                      </Button>
                      <Button
                        asChild
                        className="w-full h-12 rounded-full bg-foreground text-sm font-semibold text-background hover:bg-foreground/90"
                      >
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

      {/* ── Hero section ──────────────────────────────────────────────── */}
      <section
        className="px-4 sm:px-6 py-12 sm:py-16 lg:px-10 lg:py-24"
        style={{ background: "#E8E6DE" }}
      >
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Meet the team
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-foreground/65">
            A blend of quantum physicists, chip designers and AI researchers building the design
            layer of the quantum stack.
          </p>
        </div>
      </section>

      {/* ── Team grid ─────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 py-10 sm:py-16 lg:px-10 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {ordered.map((m, i) => (
              <motion.div
                key={m.name}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 5) * 0.05 }}
                className="flex flex-col items-center text-center"
              >
                <div className="aspect-square w-32 overflow-hidden rounded-full bg-[#E8E6DE] sm:w-36">
                  <img
                    src={m.photo}
                    alt={m.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.05]"
                  />
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground break-words">{m.name}</p>
                <p className="mt-1 text-xs text-foreground/55 break-words">{m.role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
