import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Shield,
  Lock,
  FileText,
  Download,
  Trash2,
  Globe,
  Cookie,
  Mail,
  Check,
  AlertCircle,
  ExternalLink,
  UserCheck,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SilicofellerLogo } from "@/components/silicofeller-logo";
import { useAuth } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Silicofeller" },
      {
        name: "description",
        content:
          "Privacy Policy for Silicofeller — Learn how we protect your account, telemetry, and proprietary quantum chip layouts.",
      },
      { property: "og:title", content: "Privacy Policy — Silicofeller" },
      {
        property: "og:description",
        content: "Transparent data protection policies for quantum hardware design.",
      },
    ],
  }),
  component: PrivacyPolicyPage,
});

const SECTIONS = [
  { id: "introduction", label: "1. Brand Voice & Intent" },
  { id: "collection", label: "2. Information We Collect" },
  { id: "usage", label: "3. How We Use Your Data" },
  { id: "legal-basis", label: "4. Legal Basis (GDPR & CCPA)" },
  { id: "sharing", label: "5. Data Sharing & Third Parties" },
  { id: "rights", label: "6. Your Actions & Choices" },
  { id: "retention", label: "7. Data Retention Timelines" },
  { id: "security", label: "8. Concrete Security Safeguards" },
  { id: "transfers", label: "9. International Transfers" },
  { id: "children", label: "10. Children's Privacy" },
  { id: "cookies", label: "11. Cookies & Do Not Track" },
  { id: "contact", label: "12. Contact & Version Updates" },
];

function PrivacyPolicyPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState("introduction");
  const [readingProgress, setReadingProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Header state
      setScrolled(window.scrollY > 10);

      // Reading progress
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        setReadingProgress((window.scrollY / totalHeight) * 100);
      }

      // Active Section highlight
      let currentSection = "introduction";
      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 160) {
            currentSection = section.id;
          }
        }
      }
      setActiveSection(currentSection);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -100;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <main className="relative min-h-screen bg-[#F8F7F2] text-foreground antialiased selection:bg-[#F26B3A]/10 selection:text-[#F26B3A]">
      {/* Reading Progress Bar */}
      <div
        className="fixed top-0 left-0 z-50 h-1 bg-[#F26B3A] transition-all duration-75"
        style={{ width: `${readingProgress}%` }}
      />

      {/* Header */}
      <header
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? "border-b border-black/10 bg-[#E8E6DE]/85 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl"
            : "border-b border-transparent bg-[#E8E6DE]/40 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <Link to="/" aria-label="SilicoFeller home" className="flex items-center">
            <SilicofellerLogo />
          </Link>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              asChild
              className="h-9 rounded-full border-black/15 bg-white/60 hover:bg-white"
            >
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Home
              </Link>
            </Button>
            {user && (
              <Button
                asChild
                className="h-9 rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[#E8E6DE] py-16 px-6 lg:py-20 lg:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#F26B3A]">
            <Shield className="h-3 w-3" /> Safe, Secure, & Transparent
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-foreground/60">
            We value your intellectual property. Learn how we handle your quantum chip layouts,
            account logs, and AI design inputs with utmost security and care.
          </p>
          <p className="mt-2 text-xs text-foreground/45">
            Effective Date: June 22, 2026 | Version 1.2
          </p>
        </div>
      </section>

      {/* Layout Content */}
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[280px_1fr]">
          {/* Side TOC (Desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-28 flex flex-col gap-1 rounded-2xl border border-black/10 bg-white/50 p-4 backdrop-blur">
              <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-wider text-foreground/40">
                Table of Contents
              </p>
              {SECTIONS.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => scrollToSection(sec.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition-all duration-200 ${
                    activeSection === sec.id
                      ? "bg-foreground text-background shadow-sm"
                      : "text-foreground/60 hover:bg-black/5 hover:text-foreground"
                  }`}
                >
                  {sec.label}
                </button>
              ))}
            </div>
          </aside>

          {/* Policy Text Area */}
          <article className="prose prose-slate max-w-none text-foreground/80">
            {/* Section 1 */}
            <div id="introduction" className="scroll-mt-28 border-b border-black/5 pb-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <FileText className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">
                  1. Brand Voice & Privacy Intent
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                At Silicofeller, we build the design layer of the quantum stack. We transform
                natural language intent into physical qubit layouts. We respect the sensitivity of
                quantum layout files, foundries, and code scripts.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75 font-medium text-foreground">
                We believe in simple rules: Your quantum designs are yours. We do not sell your
                designs, IP, or code scripts to third parties, nor do we use them to train general
                AI models without your explicit permission.
              </p>
              <div className="mt-4 rounded-xl border border-[#F26B3A]/20 bg-[#F26B3A]/5 p-4 text-xs text-[#F26B3A]">
                <strong className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Our Promise:
                </strong>
                We process your designs strictly to compile layout files, generate Qiskit Metal
                structures, and output DRC checks requested by you.
              </div>
            </div>

            {/* Section 2 */}
            <div id="collection" className="scroll-mt-28 border-b border-black/5 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <Lock className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">2. Information We Collect</h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                We collect information directly from you and automatically from your device usage:
              </p>
              <ul className="mt-3 space-y-2 text-xs text-foreground/75 pl-4 list-disc">
                <li>
                  <strong className="font-semibold text-foreground">Account Information:</strong>{" "}
                  Name, professional email address, organization name, role type (such as Quantum
                  Engineer, Org Manager, or Admin), and password hash.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Design Files & Code:</strong>{" "}
                  Natural-language layout descriptions, variable definitions, chip parameters (qubit
                  frequencies, EJ, EC values), simulation records, design graphs, and raw QCLang
                  scripts entered or generated in the Schematic Editor.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Telemetry & Logs:</strong> IP
                  address, device specs (browser version, OS, screen bounds), server load times, API
                  request failures, and page view timestamps.
                </li>
              </ul>
            </div>

            {/* Section 3 */}
            <div id="usage" className="scroll-mt-28 border-b border-black/5 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <Check className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">3. How We Use Your Data</h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                We use the data we collect for the following specific purposes:
              </p>
              <table className="mt-4 w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-black/10 text-foreground/60">
                    <th className="pb-2 font-medium">Data Class</th>
                    <th className="pb-2 font-medium">How it's Used</th>
                    <th className="pb-2 font-medium">Business Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  <tr>
                    <td className="py-2.5 font-medium text-foreground">Design Files & Code</td>
                    <td className="py-2.5">Passed to compiler plugins and rendering engines.</td>
                    <td className="py-2.5">
                      Generate GDS layouts, code files, and simulation graphs.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-medium text-foreground">AI Prompts</td>
                    <td className="py-2.5">Processed secure API paths to construct layout code.</td>
                    <td className="py-2.5">Fulfill user requests for AI assistant suggestions.</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-medium text-foreground">Account/Org details</td>
                    <td className="py-2.5">
                      Verify permission flags and manage multi-tenant billing.
                    </td>
                    <td className="py-2.5">Enforce resource constraints and team roles.</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-medium text-foreground">Telemetry & Logs</td>
                    <td className="py-2.5">
                      Investigate compiler error logs and optimize load times.
                    </td>
                    <td className="py-2.5">Prevent service crashes and resolve bugs.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Section 4 */}
            <div id="legal-basis" className="scroll-mt-28 border-b border-black/5 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <Globe className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">
                  4. Legal Bases (GDPR & CCPA)
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                If you reside in the European Economic Area (EEA), we process your data under the
                following legal foundations:
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-foreground/75 pl-4 list-disc">
                <li>
                  <strong className="font-semibold text-foreground">
                    Performance of Contract:
                  </strong>{" "}
                  Creating, storing, and compiling your quantum layouts as requested.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Legitimate Interest:</strong>{" "}
                  Protecting the safety of our application, fixing fatal SSR errors, and preventing
                  DDoS attacks.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Consent:</strong> For news
                  update checkboxes and optional telemetry tracking.
                </li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-foreground/75">
                Under the California Consumer Privacy Act (CCPA) as amended by the CPRA, we state
                that{" "}
                <strong className="font-medium text-foreground">we do not "sell" or "share"</strong>{" "}
                your design details or personal records for advertising.
              </p>
            </div>

            {/* Section 5 */}
            <div id="sharing" className="scroll-mt-28 border-b border-black/5 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <ExternalLink className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">
                  5. Data Sharing & Third Parties
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                We only share your information with subprocessors required to host the system and
                execute AI commands. We never sell your metadata:
              </p>
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-black/10 bg-white p-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span>Anthropic, PBC (Claude API)</span>
                    <Badge className="bg-[#F26B3A]/10 hover:bg-[#F26B3A]/20 text-[#F26B3A]">
                      AI Processing
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-foreground/60 my-0">
                    We send natural language prompts and layout components to Anthropic's API to
                    construct code solutions. Anthropic processes this data securely; they are
                    contractually bound not to retain our prompts for training models.
                  </p>
                </div>
                <div className="rounded-xl border border-black/10 bg-white p-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span>Supabase, Inc. / Amazon Web Services (AWS)</span>
                    <Badge className="bg-black/5 text-foreground hover:bg-black/10">
                      Cloud Storage
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-foreground/60 my-0">
                    Secures user tables, encrypted session credentials, and version-controlled
                    designs. Data is stored on servers inside the United States.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 6 */}
            <div id="rights" className="scroll-mt-28 border-b border-black/5 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <Download className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">6. Your Rights & Choices</h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                Regardless of where you are located, we offer the following actionable control
                mechanisms:
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-black/10 bg-white p-4 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Download className="h-3.5 w-3.5" /> Download & Portability
                    </h4>
                    <p className="mt-1 text-xs text-foreground/60 my-0">
                      You can instantly export your designs to standard formats (Qiskit Python
                      script, JSON graph structures) straight from the design panel.
                    </p>
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="text-[11px] h-8 rounded-full border-black/10 opacity-50 cursor-not-allowed"
                    >
                      Go to Workspace
                    </Button>
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 bg-white p-4 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" /> Delete My Account
                    </h4>
                    <p className="mt-1 text-xs text-foreground/60 my-0">
                      You can wipe your complete account record, including all design projects,
                      immediately.
                    </p>
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="text-[11px] h-8 rounded-full border-black/10 opacity-50 cursor-not-allowed"
                    >
                      Go to Settings
                    </Button>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-foreground/60">
                To object to telemetry tracking, request manual changes, or raise an objection, you
                may contact our legal desk at{" "}
                <a href="mailto:quantum@silicofeller.com" className="text-foreground underline">
                  quantum@silicofeller.com
                </a>
                .
              </p>
            </div>

            {/* Section 7 */}
            <div id="retention" className="scroll-mt-28 border-b border-black/5 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <FileText className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">
                  7. Data Retention Timelines
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                We store your information for precise windows depending on the dataset class:
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-foreground/75 pl-4 list-disc">
                <li>
                  <strong className="font-semibold text-foreground">Active Projects & Code:</strong>{" "}
                  Retained for the lifetime of your account. If you delete a project, it is flagged
                  and wiped from our servers within 48 hours.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Account Metadata:</strong>{" "}
                  Deleted within 30 days of explicit account deletion confirmation.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Server Debug logs:</strong>{" "}
                  Rotated automatically and deleted after 30 days.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Database Backups:</strong> Kept
                  for exactly 90 days after generation before rolling deletion occurs.
                </li>
              </ul>
            </div>

            {/* Section 8 */}
            <div id="security" className="scroll-mt-28 border-b border-black/5 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <Lock className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">
                  8. Concrete Security Safeguards
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                We safeguard your quantum designs using industry-standard engineering measures:
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-foreground/75 pl-4 list-disc">
                <li>
                  <strong className="font-semibold text-foreground">Encryption:</strong> All
                  database storage is encrypted at rest using AES-256 keys. Communication between
                  your browser and our servers is secured by TLS 1.3 encryption.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Access Audits:</strong> Only
                  authorization tokens (JWT) can retrieve layout assets. Multi-tenant partitioning
                  isolates your designs from other organizations.
                </li>
                <li>
                  <strong className="font-semibold text-foreground">Enterprise Isolation:</strong>{" "}
                  Enterprise tiers support private tenant servers and air-gapped instances where
                  zero design information leaves your local environment.
                </li>
              </ul>
            </div>

            {/* Section 9 */}
            <div id="transfers" className="scroll-mt-28 border-b border-black/5 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <Globe className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">
                  9. International Transfers
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                Silicofeller is based in the United States, and we host our database layers in US
                datacenters. When we transfer information belonging to EEA users outside Europe, we
                utilize standard contractual clauses (SCCs) approved by the European Commission to
                ensure a comparable level of legal safety.
              </p>
            </div>

            {/* Section 10 */}
            <div id="children" className="scroll-mt-28 border-b border-black/5 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <UserCheck className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">10. Children's Privacy</h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                Our platform targets scientists, developers, and hardware engineers. It is not
                designed or intended for individuals under 18 years of age. We do not knowingly
                compile records from children. If we learn we collected child data, we will delete
                it within 24 hours.
              </p>
            </div>

            {/* Section 11 */}
            <div id="cookies" className="scroll-mt-28 border-b border-black/5 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <Cookie className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">
                  11. Cookies & Do Not Track (DNT)
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                We use secure localStorage tokens to keep you logged in. We do not place cookies or
                tracking pixels for commercial advertising or across other platforms.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">
                Because we do not monitor your actions across third-party websites, our server logic
                does not alter behaviors in response to Do Not Track browser headers.
              </p>
            </div>

            {/* Section 12 */}
            <div id="contact" className="scroll-mt-28 py-10">
              <div className="flex items-center gap-3 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26B3A]/10 text-[#F26B3A]">
                  <Mail className="h-4 w-4" />
                </div>
                <h2 className="text-xl font-bold tracking-tight my-0">
                  12. Contact & Version Updates
                </h2>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/75">
                We may revise this document to match API adjustments or cloud datacenter updates. If
                we make material adjustments to how we store your quantum files, we will display an
                alert inside your dashboard 14 days before the policy takes effect.
              </p>
              <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-[#F26B3A]" /> Contact Info
                </h4>
                <p className="mt-2 text-xs text-foreground/60 my-0">
                  Address questions, deletion requests, and compliance logs to:
                </p>
                <div className="mt-3 text-xs leading-relaxed">
                  <strong className="font-semibold text-foreground">Silicofeller, Inc.</strong>
                  <br />
                  Attn: Legal & Data Protection Officer
                  <br />
                  Email:{" "}
                  <a href="quantum@silicofeller.com" className="text-foreground underline">
                    quantum@silicofeller.com
                  </a>{" "}
                  {/* or{" "} */}
                  {/* <a href="mailto:legal@silicofeller.com" className="text-foreground underline">
                    legal@silicofeller.com
                  </a> */}
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-black/10 bg-[#050507] py-8 text-xs text-white/50">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">Silicofeller</span>
            <span>© {new Date().getFullYear()} All rights reserved.</span>
          </div>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <Link to="/our-team" className="hover:text-white transition-colors">
              Team
            </Link>
            <Link to="/community" className="hover:text-white transition-colors">
              Community
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
