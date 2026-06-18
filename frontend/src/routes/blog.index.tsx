import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BLOG_POSTS } from "@/data/blog-posts";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Blog — SilicoFeller" },
      {
        name: "description",
        content: "Research, insights, and updates from the SilicoFeller team.",
      },
    ],
  }),
  component: BlogIndexPage,
});

const TAG_COLORS: Record<string, string> = {
  "Theory & Research": "#7C3AED", // Violet
  "Quantum Computing": "#8A7B25", // Gold/olive
  "Hardware Engineering": "#7C3AED",
  "Developer Tools & Tech": "#8A7B25",
  "Industry & Milestones": "#A855F7", // Purple
};

// Map post slug to specific preview image paths
const POST_IMAGES: Record<string, string> = {
  "shadow-hamiltonian-simulation": "/images/shadow_hamiltonian_complexity.png",
  "surface-codes-qec-architecture": "/images/surface_codes_threshold.png",
  "squadds-qubit-design": "/images/squadds_validation.png",
  "cudaq-qec-decoders": "/images/cudaq_relaybp_throughput.png",
  "quantum-supremacy": "/images/quantum_supremacy_scaling.png",
};

function BlogIndexPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-[#0F172A]/50 transition-colors hover:text-[#0F172A]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to home
      </Link>

      <h1 className="mt-8 text-4xl font-semibold tracking-tight text-[#0F172A]">
        From the SilicoFeller blog.
      </h1>
      <p className="mt-3 text-[#0F172A]/60 text-lg">
        Research, engineering, and industry insights from our team.
      </p>

      {/* Posts grid */}
      <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-2">
        {BLOG_POSTS.map((p) => (
          <Link
            key={p.slug}
            to="/blog/$slug"
            params={{ slug: p.slug }}
            className="group block rounded-3xl border border-black/5 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#7C3AED]/20 hover:shadow-[0_20px_50px_-12px_rgba(124,58,237,0.12)]"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="aspect-[16/9] w-full overflow-hidden rounded-2xl bg-[#0A0A0F] border border-black/5 flex items-center justify-center">
              <img
                src={POST_IMAGES[p.slug] ?? "/images/shadow_hamiltonian_complexity.png"}
                alt={p.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://via.placeholder.com/600x340";
                }}
              />
            </div>
            <div className="mt-5 flex items-center justify-between">
              <p
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: TAG_COLORS[p.tag] ?? "#7C3AED" }}
              >
                {p.tag}
              </p>
              <span className="text-xs text-[#64748B]">{p.date}</span>
            </div>
            <h2 className="mt-2 text-xl font-semibold leading-snug text-[#0F172A] group-hover:text-[#7C3AED] transition-colors duration-200">
              {p.title}
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-[#64748B] line-clamp-2">{p.excerpt}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#7C3AED] group-hover:translate-x-1 transition-transform duration-200">
              Read more <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
