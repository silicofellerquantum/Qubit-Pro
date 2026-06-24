import React, { useMemo } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { NAVIGATION_DATA } from "./sections-data";

interface PrevNextNavProps {
  activeSectionId: string;
  setActiveSectionId: (id: string) => void;
}

export function PrevNextNav({ activeSectionId, setActiveSectionId }: PrevNextNavProps) {
  // Flatten sidebar structure into an ordered array of just the leaf pages
  const flatPages = useMemo(() => {
    const pages: { id: string; label: string; groupTitle: string }[] = [];
    
    NAVIGATION_DATA.forEach(group => {
      group.items.forEach(item => {
        if (item.children) {
          item.children.forEach(child => {
            pages.push({ id: child.id, label: child.label, groupTitle: item.label });
          });
        } else {
          pages.push({ id: item.id, label: item.label, groupTitle: group.title });
        }
      });
    });
    
    return pages;
  }, []);

  const currentIndex = flatPages.findIndex(page => page.id === activeSectionId);
  
  if (currentIndex === -1) return null;

  const prevPage = currentIndex > 0 ? flatPages[currentIndex - 1] : null;
  const nextPage = currentIndex < flatPages.length - 1 ? flatPages[currentIndex + 1] : null;

  return (
    <div className="flex items-center justify-between gap-4 mt-16 pt-8 border-t border-[var(--line)]">
      {prevPage ? (
        <button
          onClick={() => setActiveSectionId(prevPage.id)}
          className="flex flex-col items-start gap-1 p-4 rounded-2xl border border-[var(--line)] hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm transition-all w-1/2 text-left group"
        >
          <div className="flex items-center gap-2 text-sm text-[var(--muted)] group-hover:text-blue-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Previous</span>
          </div>
          <div className="font-semibold text-[var(--text)] group-hover:text-blue-800 line-clamp-1">
            {prevPage.label}
          </div>
        </button>
      ) : <div className="w-1/2" />}

      {nextPage ? (
        <button
          onClick={() => setActiveSectionId(nextPage.id)}
          className="flex flex-col items-end gap-1 p-4 rounded-2xl border border-[var(--line)] hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm transition-all w-1/2 text-right group"
        >
          <div className="flex items-center gap-2 text-sm text-[var(--muted)] group-hover:text-blue-600 transition-colors">
            <span>Next</span>
            <ArrowRight className="w-4 h-4" />
          </div>
          <div className="font-semibold text-[var(--text)] group-hover:text-blue-800 line-clamp-1">
            {nextPage.label}
          </div>
        </button>
      ) : <div className="w-1/2" />}
    </div>
  );
}
