import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BLOG_POSTS } from "@/data/blog-posts";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = BLOG_POSTS.find((p) => p.slug === params.slug);
    if (!post) {
      throw new Response("Not Found", { status: 404 });
    }
    return { slug: post.slug, title: post.title, excerpt: post.excerpt };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Blog"} — Silicofeller` },
      {
        name: "description",
        content: loaderData?.excerpt ?? "Read the latest from the Silicofeller blog.",
      },
    ],
  }),
  component: BlogPostPage,
});

const TAG_COLORS: Record<string, string> = {
  "Theory & Research": "#7C3AED",
  "Quantum Computing": "#8A7B25",
  "Hardware Engineering": "#7C3AED",
  "Developer Tools & Tech": "#8A7B25",
  "Industry & Milestones": "#A855F7",
};

function BlogPostPage() {
  const { slug } = Route.useLoaderData();
  const post = BLOG_POSTS.find((p) => p.slug === slug)!;

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      {/* Dynamic scoped styles for parsed HTML contents in light theme */}
      <style>{`
        .blog-content-body {
          font-size: 1.0625rem;
          line-height: 1.8;
          color: #334155; /* Slate 700 */
        }
        .blog-content-body p {
          margin-bottom: 1.5rem;
        }
        .blog-content-body h2 {
          font-size: 1.625rem;
          font-weight: 700;
          margin-top: 3rem;
          margin-bottom: 1.25rem;
          color: #0F172A; /* Slate 900 */
          border-left: 4px solid #7C3AED;
          padding-left: 1rem;
        }
        .blog-content-body h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 2rem;
          margin-bottom: 1rem;
          color: #0F172A;
        }
        .blog-content-body ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 1.5rem;
          color: #475569; /* Slate 600 */
        }
        .blog-content-body li {
          margin-bottom: 0.5rem;
        }
        .blog-content-body pre {
          background-color: #0c0d12;
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 12px;
          padding: 1.25rem;
          overflow-x: auto;
          margin: 1.75rem 0;
          position: relative;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .blog-content-body pre::before {
          content: "PYTHON";
          position: absolute;
          top: 0;
          right: 0;
          background-color: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.65rem;
          font-weight: 700;
          padding: 4px 10px;
          border-bottom-left-radius: 8px;
          border-left: 1px solid rgba(255, 255, 255, 0.1);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .blog-content-body code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.875rem;
          color: #38bdf8;
        }
        .blog-content-body .inline-code {
          background-color: rgba(124, 58, 237, 0.05);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.85rem;
          color: #7C3AED;
          border: 1px solid rgba(124, 58, 237, 0.1);
        }
        .blog-content-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 2rem 0;
          font-size: 0.95rem;
          background-color: #ffffff;
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: var(--shadow-card);
        }
        .blog-content-body th, .blog-content-body td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid rgba(15, 23, 42, 0.06);
        }
        .blog-content-body th {
          background-color: rgba(124, 58, 237, 0.03);
          color: #0F172A;
          font-weight: 600;
        }
        .blog-content-body tr:last-child td {
          border-bottom: none;
        }
        .blog-content-body .callout-box {
          background-color: rgba(124, 58, 237, 0.03);
          border-left: 4px solid #7C3AED;
          border-radius: 8px;
          padding: 1.25rem;
          margin: 2rem 0;
          box-shadow: var(--shadow-card);
        }
        .blog-content-body .callout-box p {
          margin-bottom: 0;
          font-style: italic;
          color: #0F172A;
        }
        .blog-content-body .visualization-container {
          background-color: #ffffff;
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 16px;
          padding: 1.5rem;
          margin: 2.25rem 0;
          text-align: center;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
        }
        .blog-content-body .visualization-container img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
          margin: 0 auto;
        }
        .blog-content-body .visualization-caption {
          font-size: 0.85rem;
          color: #64748B;
          margin-top: 0.75rem;
          font-style: italic;
        }

        /* Author profiles section */
        .author-card-section {
          background-color: #ffffff;
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 16px;
          padding: 2rem;
          margin-top: 4rem;
          box-shadow: var(--shadow-card);
        }
        .author-card-section h3 {
          font-size: 1.1rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 1.5rem;
          color: #0F172A;
        }
        .author-card {
          display: flex;
          gap: 1.25rem;
          margin-bottom: 1.5rem;
          align-items: flex-start;
        }
        .author-card:last-child {
          margin-bottom: 0;
        }
        .author-card-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
          border: 2px solid #7C3AED;
          background-color: rgba(15, 23, 42, 0.03);
        }
        .author-card-info h4 {
          font-size: 1.05rem;
          color: #0F172A;
          margin-bottom: 4px;
        }
        .author-card-info p {
          font-size: 0.9rem;
          color: #475569;
          line-height: 1.5;
        }

        /* Discussion section */
        .discussion-section {
          margin-top: 4rem;
          border-top: 1px solid rgba(15, 23, 42, 0.08);
          padding-top: 3rem;
        }
        .discussion-section h3 {
          font-size: 1.35rem;
          color: #0F172A;
          margin-bottom: 2rem;
        }
        .comment-thread {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .comment-card {
          background-color: #ffffff;
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: var(--shadow-card);
        }
        .comment-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .comment-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background-color: rgba(15, 23, 42, 0.03);
          border: 1.5px solid rgba(15, 23, 42, 0.08);
        }
        .comment-meta {
          font-size: 0.85rem;
        }
        .comment-author {
          font-weight: 600;
          color: #0F172A;
        }
        .comment-date {
          color: #64748B;
          margin-left: 0.5rem;
        }
        .comment-body {
          font-size: 0.95rem;
          color: #334155;
        }
        .comment-card.reply {
          margin-left: 2.5rem;
          border-left: 3px solid #7C3AED;
        }
      `}</style>

      {/* Back button */}
      <Link
        to="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-[#0F172A]/50 transition-colors hover:text-[#0F172A]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to all posts
      </Link>

      {/* Header Info */}
      <header className="mt-8 border-b border-black/10 pb-8">
        <span
          className="inline-block text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: TAG_COLORS[post.tag] ?? "#7C3AED" }}
        >
          {post.tag}
        </span>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#0F172A] leading-tight">
          {post.title}
        </h1>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#0F172A]/60">
          <span className="font-semibold text-[#0F172A]">{post.authors}</span>
          <span className="text-black/20">•</span>
          <span>{post.publishMeta}</span>
        </div>
      </header>

      {/* Article Content */}
      <article className="blog-content-body mt-10">{post.content}</article>

      {/* Author Profiles */}
      {post.authorProfile && (
        <section className="author-card-section">{post.authorProfile}</section>
      )}

      {/* Comments / Discussion Thread */}
      {post.comments && <section className="discussion-section">{post.comments}</section>}
    </main>
  );
}
