import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { useNavigate, useLocation, Link } from "@tanstack/react-router";
import { NAVIGATION_DATA } from "./sections-data";

interface DocumentationSectionProps {
  id: string;
  sectionClass?: string;
  children: React.ReactNode;
}

export function DocumentationSection({
  id,
  sectionClass,
  children,
}: DocumentationSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Flatten the sidebar to easily find prev/next
  const flatItems = NAVIGATION_DATA.flatMap(group => 
    group.items.flatMap(item => item.children ? [item, ...item.children] : [item])
  );
  const currentIndex = flatItems.findIndex(item => item.id === id);
  const prevItem = currentIndex > 0 ? flatItems[currentIndex - 1] : null;
  const nextItem = currentIndex < flatItems.length - 1 ? flatItems[currentIndex + 1] : null;

  const handleClick = async (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;

    // 1. Intercept anchor links (e.g. <a href="#hello-world">)
    const anchor = target.closest("a");
    if (anchor) {
      const href = anchor.getAttribute("href");
      // Intercept internal documentation hash links and rewrite to TanStack route
      if (href && href.startsWith("#")) {
        e.preventDefault();
        navigate({ to: `/documentation/${href.replace("#", "")}` });
        return;
      }
    }

    // 2. Intercept copy button clicks (e.g. <button data-copy-section="getting-started">Copy page</button>)
    const copyBtn = target.closest("[data-copy-section]");
    if (copyBtn) {
      e.preventDefault();
      if (sectionRef.current) {
        // Extract section text, clean up any "Copy page" button text
        const textToCopy = sectionRef.current.innerText
          .replace(/Copy page/g, "")
          .replace(/Copied/g, "")
          .trim();

        try {
          await navigator.clipboard.writeText(textToCopy);
          
          const originalText = copyBtn.textContent;
          copyBtn.textContent = "Copied";
          copyBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-200");
          
          setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.classList.remove("bg-emerald-50", "text-emerald-700", "border-emerald-200");
          }, 1200);
        } catch (err) {
          console.error("Failed to copy section contents: ", err);
        }
      }
    }
  };

  const currentItem = flatItems.find(item => item.id === id);
  const titleStr = currentItem ? currentItem.label : id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const readingTime = currentItem?.time || "5 min"; 

  return (
    <section
      ref={sectionRef}
      id={id}
      onClick={handleClick}
      className={cn(
        "doc-section border-b border-slate-200 py-7 pb-12 transition-all duration-150 scroll-mt-[160px]",
        sectionClass
      )}
    >
      <div className="flex items-center justify-between mb-6 text-sm text-slate-500 border-b border-slate-200 pb-4">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2">
          <a onClick={() => window.dispatchEvent(new CustomEvent("change-doc-section", { detail: "home" }))} className="hover:text-slate-900 cursor-pointer">Documentation</a>
          <ChevronRight className="h-4 w-4" />
          <span className="font-semibold text-slate-900">{titleStr}</span>
        </nav>
        
        {/* Estimated Reading Time */}
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <Clock className="h-3.5 w-3.5" />
          <span>{readingTime} read</span>
        </div>
      </div>

      {children}

      {/* Next / Previous Navigation Footer */}
      <div className="mt-16 pt-8 border-t border-slate-200 flex items-center justify-between">
        {prevItem ? (
          <a 
            onClick={() => window.dispatchEvent(new CustomEvent("change-doc-section", { detail: prevItem.id }))}
            className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{prevItem.label}</span>
          </a>
        ) : <div />}
        
        {nextItem ? (
          <a 
            onClick={() => window.dispatchEvent(new CustomEvent("change-doc-section", { detail: nextItem.id }))}
            className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-indigo-200 text-indigo-700 rounded-xl hover:bg-indigo-50 transition-colors font-medium"
          >
            <span>{nextItem.label}</span>
            <ArrowRight className="h-4 w-4" />
          </a>
        ) : <div />}
      </div>
    </section>
  );
}
