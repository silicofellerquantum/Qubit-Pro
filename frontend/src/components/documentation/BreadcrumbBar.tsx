import React from "react";
import { ChevronRight, Home } from "lucide-react";
import { NAVIGATION_DATA, NavItem } from "./sections-data";

interface BreadcrumbBarProps {
  activeSectionId: string;
  setActiveSectionId: (id: string) => void;
}

export function BreadcrumbBar({ activeSectionId, setActiveSectionId }: BreadcrumbBarProps) {
  // Find the path to the current active section
  let domain = "";
  let section = "";
  let page = "";

  for (const group of NAVIGATION_DATA) {
    for (const item of group.items) {
      if (item.id === activeSectionId) {
        domain = group.title;
        page = item.label;
        break;
      }
      
      if (item.children) {
        const childMatch = item.children.find((c: NavItem) => c.id === activeSectionId);
        if (childMatch) {
          domain = group.title;
          section = item.label;
          page = childMatch.label;
          break;
        }
      }
    }
    if (domain) break;
  }

  // Fallback
  if (!domain) {
    domain = "DOCUMENTATION";
    page = "Welcome";
  }

  return (
    <nav className="flex items-center text-sm text-[var(--muted)] mb-6 font-medium" aria-label="Breadcrumb">
      <button 
        onClick={() => setActiveSectionId("introduction")}
        className="flex items-center hover:text-[var(--text)] transition-colors"
      >
        <Home className="w-4 h-4" />
      </button>
      
      <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
      
      <span className="text-[var(--text)]">{domain}</span>
      
      {section && (
        <>
          <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
          <span className="text-[var(--text)]">{section}</span>
        </>
      )}
      
      <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
      
      <span className="text-blue-600 truncate max-w-[200px]">{page}</span>
    </nav>
  );
}
