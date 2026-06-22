import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  Cpu,
  Sparkles,
  Shield,
  Zap,
  Wand2,
  FileCode2,
  CheckCircle2,
  Download,
  Github,
  Linkedin,
  Mail,
  Terminal,
  MessageSquare,
  Library,
  MousePointer2,
  FlaskConical,
  Code2,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SilicofellerLogo } from "@/components/silicofeller-logo";
// QuantumBurst is a heavy rAF animation — defer its JS until after the page is interactive
const QuantumBurst = lazy(() =>
  import("@/components/landing/quantum-burst").then((m) => ({ default: m.QuantumBurst }))
);
import { useAuth, ROLE_LABEL } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Silicofeller — AI Quantum Chip Design" },
      {
        name: "description",
        content:
          "Silicofeller turns natural-language prompts into production-ready quantum chip architectures. Describe. Generate. Fabricate.",
      },
      { property: "og:title", content: "Silicofeller — AI Quantum Chip Design" },
      {
        property: "og:description",
        content: "AI-powered quantum chip design. From prompt to fabricated qubit array.",
      },
    ],
  }),
  component: LandingPage,
});

const ROTATING_HEADLINES = [
  "Design Quantum Chips With Natural Language",
  "AI-Powered Quantum Chip Design",
  "From Prompt to Quantum Chip",
  "The Future of Quantum Engineering",
  "Describe. Generate. Fabricate.",
];

function LandingPage() {
  const { user } = useAuth();
  const [headlineIdx, setHeadlineIdx] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], [0, -120]);
  const heroScale = useTransform(scrollY, [0, 600], [1, 0.92]);
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0.35]);

  useEffect(() => {
    const id = setInterval(() => setHeadlineIdx((i) => (i + 1) % ROTATING_HEADLINES.length), 3200);
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearInterval(id);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Body scroll lock when mobile nav is open
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileNavOpen]);

  return (
    <main className="relative min-h-[100svh] bg-background text-foreground">
      <SiteNav scrolled={scrolled} user={user} mobileNavOpen={mobileNavOpen} setMobileNavOpen={setMobileNavOpen} />

      {/* ───────── HERO — light canvas, network animation ───────── */}
      <section
        id="top"
        className="relative isolate overflow-hidden text-foreground"
        style={{ background: "#E8E6DE" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: "var(--grid-pattern)", backgroundSize: "44px 44px" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#0A0A0F]"
        />

        <div className="relative z-10 grid grid-cols-1 gap-10 px-4 sm:px-6 pb-20 sm:pb-28 pt-6 sm:pt-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:px-10 lg:pt-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col justify-center"
          >
            <h1 className="text-[1.875rem] font-semibold leading-[1.3] tracking-[-0.035em] sm:text-[2.75rem] md:text-[3.5rem] lg:text-[4.25rem]">
              <motion.span
                key={headlineIdx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="block bg-gradient-to-r from-[#0A0A0A] via-[#0A0A0A] to-[#F26B3A] bg-clip-text text-transparent"
              >
                {ROTATING_HEADLINES[headlineIdx]}
              </motion.span>
            </h1>
            <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-foreground/70">
              Silicofeller transforms natural-language prompts into production-ready quantum chip
              architectures — transmon arrays, error-correction layouts and superconducting qubit
              topologies, generated in seconds.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="h-12 rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:bg-foreground/90"
              >
                <Link to="/schematic-editor">Start designing</Link>
              </Button>
              <a
                href="#demo"
                className="inline-flex h-12 items-center rounded-full border border-black/15 bg-white/60 px-6 text-sm font-semibold text-foreground transition-colors hover:bg-white/80"
              >
                Watch Demo
              </a>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 text-xs text-foreground/55">
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
              </span>
            </div>
          </motion.div>

          <motion.div
            style={{ y: heroY, scale: heroScale, opacity: heroOpacity }}
            className="flex items-center justify-center"
          >
            <QuantumBurst />
          </motion.div>
        </div>
      </section>

      {/* ───────── ABOUT US — company + team ───────── */}
      <Section
        id="about"
        eyebrow="About us"
        title="Silicofeller — AI for the quantum era."
        tone="paper"
      >
        <div className="mt-2 grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
              Silicofeller is an AI-powered quantum chip design platform. You describe the quantum
              chip you need — in plain language — and our platform turns that prompt into a
              complete, fabrication-ready design. No manual layout work, no low-level HDL, just your
              intent and an output you can build.
            </p>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
              The platform includes a full <span className="font-medium text-foreground">Schematic Editor</span> where
              you can drag and drop qubits, couplers, resonators, and readout lines onto a live
              canvas — composing quantum chip topologies interactively, the same way a PCB designer
              would lay out a board. Every component placed on the canvas stays in sync with the
              underlying design graph.
            </p>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
              Once your design is ready, Silicofeller automatically generates{" "}
              <span className="font-medium text-foreground">Qiskit Metal Python code</span> — the
              industry-standard framework for quantum chip design — so your layout is immediately
              ready for simulation, DRC verification, and tapeout submission.
            </p>
          </div>
          <div className="flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotateX: -15 }}
              whileInView={{ opacity: 1, scale: 1, rotateX: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              style={{ perspective: 1200, transformStyle: "preserve-3d" }}
              className="relative flex w-full max-w-lg items-center justify-center"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-8 bottom-6 h-24 rounded-[100%] blur-2xl"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(59,130,246,0.45), rgba(59,130,246,0) 70%)",
                }}
              />
              <motion.img
                src="/quantum-chip-3d.png"
                alt="Silicofeller quantum chip"
                width={1280}
                height={1024}
                loading="lazy"
                className="relative z-10 w-full max-w-lg select-none drop-shadow-[0_30px_60px_rgba(15,23,42,0.35)]"
                style={{ transformStyle: "preserve-3d" }}
                animate={{
                  y: [0, -10, 0],
                  rotateZ: [-1.2, 1.2, -1.2],
                  rotateY: [-3, 3, -3],
                }}
                transition={{
                  duration: 7,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                whileHover={{ scale: 1.04, rotateY: 6, rotateX: -4 }}
                draggable={false}
              />
            </motion.div>
          </div>
        </div>
      </Section>

      {/* ───────── TECHNOLOGY — circuit-grid background ───────── */}
      <Section id="technology" eyebrow="Technology" title="Built on quantum-aware AI." tone="grid">
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {TECH.map((t) => (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="overflow-hidden rounded-2xl border border-border bg-card/95 backdrop-blur"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="aspect-[16/10] w-full overflow-hidden border-b border-border bg-muted">
                <img
                  src={t.image}
                  alt={t.title}
                  loading="lazy"
                  className="h-full w-full object-cover object-left-top"
                />
              </div>
              <div className="p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F26B3A]">
                  {t.eyebrow}
                </p>
                <h3 className="mt-2 text-base font-semibold text-foreground">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ───────── FEATURES — glassmorphism on dark ───────── */}
      <Section
        id="features"
        eyebrow="Features"
        title="Everything you need to ship quantum silicon faster."
        tone="dark"
      >
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="group rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F26B3A] text-white transition-transform group-hover:scale-110">
                <f.icon className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ───────── BLOG — highlights ───────── */}
      <Section id="blog" eyebrow="Blog" title="Insights from the quantum frontier." tone="elevated">
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {POSTS.map((p) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45 }}
              className="rounded-2xl border border-border bg-card/90 p-5 backdrop-blur"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <span className="inline-block rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                {p.tag}
              </span>
              <h3 className="mt-3 text-sm font-semibold leading-snug text-foreground">{p.title}</h3>
              <Link
                to="/blog"
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#F26B3A] hover:underline"
              >
                Read more <ArrowRight className="h-3 w-3" />
              </Link>
            </motion.div>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline" className="rounded-full border-black/15 px-6 text-sm font-medium">
            <Link to="/blog">View all posts <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
        </div>
      </Section>

      {/* ───────── CONTACT — dark cinematic ───────── */}
      <Section id="contact" eyebrow="Contact" title="Let's design what's next." tone="paper">
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr]">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormInput label="Name" placeholder="Ada Lovelace" />
              <FormInput label="Email" type="email" placeholder="you@company.com" />
              <FormInput
                label="Company"
                placeholder="Acme Semiconductors"
                className="sm:col-span-2"
              />
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-foreground/60">Message</label>
                <textarea
                  rows={4}
                  placeholder="Tell us about your quantum chip idea…"
                  className="mt-1.5 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/40 focus:border-[#F26B3A]"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="mt-5 h-11 rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:bg-foreground/90"
            >
              Send message <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </form>
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Talk to our quantum engineering team about pilots, integrations, and enterprise
              deployments.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                className="grid h-10 w-10 place-items-center rounded-full border border-black/15 text-foreground transition-colors hover:bg-black/5"
                href="#"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </a>
              <a
                className="grid h-10 w-10 place-items-center rounded-full border border-black/15 text-foreground transition-colors hover:bg-black/5"
                href="#"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                className="grid h-10 w-10 place-items-center rounded-full border border-black/15 text-foreground transition-colors hover:bg-black/5"
                href="mailto:hello@silicofeller.com"
                aria-label="Email"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </Section>

      <footer className="relative z-10 border-t border-white/10 bg-[#050507] px-4 sm:px-6 py-10 text-white lg:px-10 pb-safe">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 sm:gap-8 sm:grid-cols-4">
          <FooterCol title="Product" links={["Features", "Designer", "Pricing", "Changelog"]} />
          <FooterCol title="Company" links={["About", "Blog", "Careers", "Contact"]} />
          <FooterCol title="Resources" links={["Documentation", "API", "Support", "Status"]} />
          <FooterCol title="Legal" links={["Privacy Policy", "Terms of Service", "Security"]} />
        </div>
        <div className="mx-auto mt-8 flex max-w-6xl flex-col items-center gap-4 border-t border-white/10 pt-6 sm:flex-row sm:justify-between text-xs text-white/50">
          <p>© {new Date().getFullYear()} Silicofeller, Inc. All rights reserved.</p>
          {user && (
            <p>
              Signed in as <span className="font-medium text-white">{user.name}</span> ·{" "}
              {ROLE_LABEL[user.role]}
            </p>
          )}
          <div className="flex items-center gap-2">
            <a
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-white/15 text-white/50 transition-colors hover:bg-white/5"
              href="#" aria-label="LinkedIn"
            >
              <Linkedin className="h-4 w-4" />
            </a>
            <a
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-white/15 text-white/50 transition-colors hover:bg-white/5"
              href="#" aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
            <a
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-white/15 text-white/50 transition-colors hover:bg-white/5"
              href="mailto:hello@silicofeller.com" aria-label="Email"
            >
              <Mail className="h-4 w-4" />
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

// ─── Nav link definitions ────────────────────────────────────────────────────
// "section" = smooth-scroll to an id on this page
// "route"   = TanStack Router navigation to another page
type NavLink =
  | { kind: "section"; label: string; id: string }
  | { kind: "route"; label: string; to: "/blog" | "/our-team" };

const NAV_LINKS: NavLink[] = [
  { kind: "section", label: "About Us",   id: "about" },
  { kind: "section", label: "Technology", id: "technology" },
  { kind: "section", label: "Features",   id: "features" },
  { kind: "section", label: "Blog",       id: "blog" },
  { kind: "route",   label: "Team",       to: "/our-team" },
  { kind: "section", label: "Contact",    id: "contact" },
];

/** Smooth-scroll to a section by id, offset for sticky nav height */
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const navHeight = 64; // matches h-16 header
  const top = el.getBoundingClientRect().top + window.scrollY - navHeight;
  window.scrollTo({ top, behavior: "smooth" });
}

function SiteNav({
  scrolled,
  user,
  mobileNavOpen,
  setMobileNavOpen,
}: {
  scrolled: boolean;
  user: ReturnType<typeof useAuth>["user"];
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
}) {
  const location = useLocation();

  // Track which section is currently in view (IntersectionObserver)
  const [activeSection, setActiveSection] = useState<string>("");
  useEffect(() => {
    const sectionIds = NAV_LINKS
      .filter((l): l is Extract<NavLink, { kind: "section" }> => l.kind === "section")
      .map((l) => l.id);

    const observers: IntersectionObserver[] = [];
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // Close on route change (handles /our-team navigation)
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  // ESC key closes the drawer
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileNavOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, setMobileNavOpen]);

  // Handle mobile section-link click: close drawer THEN smooth-scroll
  function handleSectionClick(id: string) {
    setMobileNavOpen(false);
    // Short delay so the drawer close animation doesn't fight the scroll
    setTimeout(() => scrollToSection(id), 120);
  }

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "border-b border-black/10 bg-[#E8E6DE]/85 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl"
            : "border-b border-transparent bg-[#E8E6DE]/40 backdrop-blur-md"
        }`}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 lg:px-10">
          {/* Logo */}
          <Link to="/" aria-label="SilicoFeller home" className="flex items-center min-h-[44px]">
            <SilicofellerLogo />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Main navigation">
            {NAV_LINKS.map((item) =>
              item.kind === "route" ? (
                <Link
                  key={item.label}
                  to={item.to}
                  className="min-h-[44px] flex items-center transition-colors text-foreground/65 hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={`min-h-[44px] flex items-center transition-colors hover:text-foreground ${
                    activeSection === item.id
                      ? "text-[#F26B3A] font-semibold"
                      : "text-foreground/65"
                  }`}
                >
                  {item.label}
                </button>
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            {/* Desktop CTAs */}
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <>
                  <Button variant="ghost" asChild className="h-9 min-h-[44px] rounded-full px-4 text-sm text-foreground hover:bg-foreground/5">
                    <Link to="/dashboard">Dashboard</Link>
                  </Button>
                  <Button asChild className="h-9 min-h-[44px] rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90">
                    <Link to="/schematic-editor">Open designer</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" asChild className="h-9 min-h-[44px] rounded-full px-4 text-sm text-foreground hover:bg-foreground/5">
                    <Link to="/sign-in">Sign in</Link>
                  </Button>
                  <Button asChild className="h-9 min-h-[44px] rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90">
                    <Link to="/sign-up">Sign up <ArrowRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav-drawer"
              className="md:hidden inline-flex items-center justify-center w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg text-foreground hover:bg-foreground/5 transition-colors"
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileNavOpen ? (
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

      {/* ── Mobile drawer + backdrop (rendered in a portal-like sibling, outside sticky header) ── */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            {/* Semi-transparent dark backdrop — click to close */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 top-[64px] z-40 bg-black/30 backdrop-blur-[2px]"
              aria-hidden
              onClick={() => setMobileNavOpen(false)}
            />

            {/* Slide-down drawer */}
            <motion.div
              key="drawer"
              id="mobile-nav-drawer"
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
                {NAV_LINKS.map((item, i) =>
                  item.kind === "route" ? (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                    >
                      <Link
                        to={item.to}
                        onClick={() => setMobileNavOpen(false)}
                        className="flex items-center border-b border-black/10 py-4 text-base font-medium text-foreground min-h-[44px] transition-colors hover:text-[#F26B3A]"
                      >
                        {item.label}
                      </Link>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.2 }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSectionClick(item.id)}
                        className={`w-full flex items-center border-b border-black/10 py-4 text-base font-medium min-h-[44px] text-left transition-colors hover:text-[#F26B3A] ${
                          activeSection === item.id ? "text-[#F26B3A]" : "text-foreground"
                        }`}
                      >
                        {/* Active dot indicator */}
                        {activeSection === item.id && (
                          <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#F26B3A] shrink-0" />
                        )}
                        {item.label}
                      </button>
                    </motion.div>
                  )
                )}

                {/* CTA buttons */}
                <motion.div
                  className="mt-6 flex flex-col gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: NAV_LINKS.length * 0.04 + 0.05 }}
                >
                  {user ? (
                    <>
                      <Button variant="ghost" asChild className="w-full h-12 rounded-full border border-black/15 text-sm font-medium">
                        <Link to="/dashboard" onClick={() => setMobileNavOpen(false)}>Dashboard</Link>
                      </Button>
                      <Button asChild className="w-full h-12 rounded-full bg-foreground text-sm font-semibold text-background hover:bg-foreground/90">
                        <Link to="/schematic-editor" onClick={() => setMobileNavOpen(false)}>Open designer</Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" asChild className="w-full h-12 rounded-full border border-black/15 text-sm font-medium">
                        <Link to="/sign-in" onClick={() => setMobileNavOpen(false)}>Sign in</Link>
                      </Button>
                      <Button asChild className="w-full h-12 rounded-full bg-foreground text-sm font-semibold text-background hover:bg-foreground/90">
                        <Link to="/sign-up" onClick={() => setMobileNavOpen(false)}>
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
    </>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
  tone = "default",
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  tone?: "default" | "paper" | "grid" | "dark" | "elevated";
}) {
  const toneClass =
    tone === "dark"
      ? "bg-[#0A0A0F] text-white"
      : tone === "paper"
        ? "bg-[#F4F2EC]"
        : tone === "elevated"
          ? "bg-gradient-to-b from-[#FAFAFA] to-[#EEECE6]"
          : tone === "grid"
            ? "bg-[#F8F7F2]"
            : "bg-background";
  const titleClass = tone === "dark" ? "text-white" : "text-foreground";
  const eyebrowClass = tone === "dark" ? "text-[#F26B3A]" : "text-accent";
  return (
    <section
      id={id}
      className={`relative z-10 scroll-mt-[72px] overflow-hidden px-4 sm:px-6 py-12 sm:py-16 md:py-24 lg:px-10 ${toneClass}`}
    >
      {tone === "grid" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: "var(--grid-pattern)", backgroundSize: "32px 32px" }}
        />
      )}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto max-w-6xl"
      >
        <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${eyebrowClass}`}>
          {eyebrow}
        </p>
        <h2
          className={`mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl ${titleClass}`}
        >
          {title}
        </h2>
        {children}
      </motion.div>
    </section>
  );
}

function FormInput({
  label,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-foreground/60">{label}</label>
      <input
        {...rest}
        className="mt-1.5 w-full rounded-lg border border-black/15 bg-white px-3 py-3 text-base text-foreground outline-none placeholder:text-foreground/40 focus:border-[#F26B3A]"
      />
    </div>
  );
}

const FOOTER_LINK_MAP: Record<string, string> = {
  Features: "#features",
  Designer: "#demo",
  About: "#about",
  Contact: "#contact",
};

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-white">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-white/50">
        {links.map((l) => {
          const href = FOOTER_LINK_MAP[l];
          return href ? (
            <li key={l}>
              <a href={href} className="transition-colors hover:text-white">
                {l}
              </a>
            </li>
          ) : (
            <li key={l}>
              <span className="cursor-not-allowed opacity-40 select-none">{l}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TypingLine({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => {
      setN((v) => (v >= text.length ? v : v + 1));
    }, 22);
    return () => clearInterval(id);
  }, [text]);
  return (
    <p className="mt-1 text-[12px] text-background">
      {text.slice(0, n)}
      <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-accent-2" />
    </p>
  );
}

const TECH = [
  {
    eyebrow: "Schematic Editor",
    title: "Drag-and-drop quantum layout canvas",
    desc: "Compose transmons, couplers and resonators on a live canvas with a synced Qiskit Metal IDE.",
    image: "/tech/schematic-editor.png",
  },
  {
    eyebrow: "AI Chatbot",
    title: "Natural-language design assistant",
    desc: "Prompt the AI to synthesize full QPUs — topology, frequencies and DRC checks generated in seconds.",
    image: "/tech/chatbot.png",
  },
  {
    eyebrow: "Export & Reports",
    title: "Tapeout-ready verification & exports",
    desc: "Design summaries, frequency plans, DRC reports and Qiskit Metal code packaged for fabrication.",
    image: "/tech/export-reports.png",
  },
] as const;

const FEATURES = [
  {
    icon: MessageSquare,
    title: "AI Chatbot",
    desc: "Describe your quantum chip in plain language and let the AI generate a complete QPU design — qubit topology, coupling maps, and readout networks, all from your prompt.",
  },
  {
    icon: Library,
    title: "Component Library",
    desc: "Browse and insert from a curated library of Qiskit Metal components — transmons, coplanar waveguides, launch pads, and more — ready to place directly into your design.",
  },
  {
    icon: MousePointer2,
    title: "Schematic Editor",
    desc: "Drag and drop Qiskit Metal components onto a live canvas to compose quantum chip layouts interactively. Every placed component stays in sync with the underlying design graph.",
  },
  {
    icon: FlaskConical,
    title: "Chip Simulation",
    desc: "Run electromagnetic and qubit-level simulations on your design to validate frequencies, coupling strengths, and gate fidelities before committing to fabrication.",
  },
  {
    icon: Shield,
    title: "Fault Tolerance Verification",
    desc: "Automated checks for qubit connectivity, crosstalk, error thresholds, and surface-code compatibility — catching design issues before they reach the foundry.",
  },
  {
    icon: Code2,
    title: "Qiskit Metal Export",
    desc: "Export your completed design as Qiskit Metal Python code, ready for simulation, DRC verification, and tapeout submission with no manual translation required.",
  },
] as const;

const DEMO_OUTPUTS = [
  {
    icon: Cpu,
    title: "Architecture",
    value: "5-qubit transmon",
    detail: "Nearest-neighbor 2D coupling",
  },
  {
    icon: Terminal,
    title: "Specifications",
    value: "T1 ≈ 60μs · T2 ≈ 45μs",
    detail: "Fidelity target 99.5%",
  },
  { icon: Zap, title: "Performance", value: "150 ns / gate", detail: "Single-qubit estimate" },
  { icon: FileCode2, title: "Files", value: "qasm + verilog + gds", detail: "Ready to export" },
];

const POSTS = [
  { tag: "Research", title: "AI in quantum chip design: the next decade" },
  { tag: "Quantum", title: "The future of fault-tolerant quantum chips" },
  { tag: "Engineering", title: "Automated qubit-layout generation, end to end" },
  { tag: "Industry", title: "Insights from leading quantum labs on AI workflows" },
] as const;