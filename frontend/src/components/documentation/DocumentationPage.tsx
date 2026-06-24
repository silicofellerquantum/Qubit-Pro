import React, { useState, useEffect, useRef } from "react";
import { Search, Menu, ExternalLink, Github, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { SilicofellerLogo } from "@/components/silicofeller-logo";
import { DocumentationSidebar } from "./DocumentationSidebar";
import { SearchModal } from "./search-assistant-modal";
import { SEARCH_ITEMS } from "./sections-data";
import { Link } from "@tanstack/react-router";
import "./documentation.css";

// Helper to generate safe IDs from text
const generateId = (text: string) => {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
};

export function DocumentationPage() {
  const [activeSectionId, setActiveSectionId] = useState("home");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Table of Contents state
  const [toc, setToc] = useState<{ id: string; text: string; level: number }[]>([]);
  const [activeTocId, setActiveTocId] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (document.documentElement.classList.contains("dark")) {
      setIsDarkMode(true);
    }
  }, []);

  const toggleTheme = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    if (newDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Hook to handle Ctrl+K keyboard shortcut for Search dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Listen for custom navigation events
  useEffect(() => {
    const handleNav = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setActiveSectionId(customEvent.detail);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    window.addEventListener("change-doc-section", handleNav);
    return () => window.removeEventListener("change-doc-section", handleNav);
  }, []);

  // Dynamic TOC generator
  useEffect(() => {
    // We need to wait for the lazy-loaded component to mount and render
    // A MutationObserver is the most reliable way to detect when content is injected
    if (!contentRef.current) return;

    const extractToc = () => {
      if (!contentRef.current) return;
      
      const headers = Array.from(contentRef.current.querySelectorAll("h2, h3"));
      const newToc = headers.map((header) => {
        // If the header doesn't have an ID, assign one based on its text content
        if (!header.id) {
          header.id = generateId(header.textContent || "");
        }
        return {
          id: header.id,
          text: header.textContent || "",
          level: parseInt(header.tagName.replace("H", ""), 10),
        };
      });

      setToc(newToc);
      if (newToc.length > 0) {
        setActiveTocId(newToc[0].id);
      }
    };

    const observer = new MutationObserver((mutations) => {
      extractToc();
    });

    observer.observe(contentRef.current, { childList: true, subtree: true });
    
    // Fallback/initial extraction
    setTimeout(extractToc, 100);

    return () => observer.disconnect();
  }, [activeSectionId]);

  // ScrollSpy for TOC
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return;
      const headers = Array.from(contentRef.current.querySelectorAll("h2, h3"));
      
      // Find the header that is currently most visible or just passed the top
      let currentActiveId = "";
      for (const header of headers) {
        const rect = header.getBoundingClientRect();
        // 120px offset accounts for the sticky top nav and some padding
        if (rect.top <= 120) {
          currentActiveId = header.id;
        } else {
          // Because headers are in order, as soon as we find one below the threshold,
          // the previous one is our active one.
          break;
        }
      }

      // If we scrolled but haven't passed the first header, the first header might be active
      if (!currentActiveId && headers.length > 0) {
        currentActiveId = headers[0].id;
      }

      if (currentActiveId) {
        setActiveTocId(currentActiveId);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [toc]);

  // Dynamically import the active section
  const ActiveSectionComponent = React.useMemo(
    () => React.lazy(() => import(`./sections/${activeSectionId}.tsx`).catch(() => import('./sections/home.tsx'))),
    [activeSectionId]
  );

  return (
    <div className="site-shell min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      {/* Global Header */}
      <header className="sticky top-0 z-[60] bg-white dark:bg-[#111619] border-b border-[var(--line)] dark:border-slate-800 shadow-sm px-6 h-[64px] flex items-center justify-between transition-colors">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <Menu className="w-6 h-6" />
          </button>
          <a href="/" className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <SilicofellerLogo iconClassName="h-12 md:h-16 w-auto mix-blend-multiply dark:mix-blend-normal dark:invert" />
          </a>
        </div>

        <div className="flex-1 max-w-xl px-8 hidden md:block">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center justify-between gap-3 text-left border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg h-[40px] px-4 cursor-pointer transition-colors"
            type="button"
          >
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4 shrink-0" />
              <span className="text-sm">Search documentation...</span>
            </span>
            <kbd className="hidden sm:inline-block bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-300 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">
              Ctrl K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <button onClick={() => setActiveSectionId("home")} className="hidden lg:block hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Guides</button>
          <button onClick={() => setActiveSectionId("api-reference")} className="hidden lg:block hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">API Reference</button>
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
            aria-label="Toggle light/dark mode"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="flex w-full min-h-[calc(100vh-64px)]">
        {/* Sidebar container */}
        <div className="hidden md:block w-[280px] shrink-0 border-r border-[#1e293b] bg-[#111619] z-40">
          <DocumentationSidebar 
            activeSectionId={activeSectionId} 
            setActiveSectionId={setActiveSectionId} 
            mobileOpen={mobileSidebarOpen}
            setMobileOpen={setMobileSidebarOpen}
          />
        </div>

        {/* Content Stream panel */}
        <main className="flex-1 w-full min-w-0 max-w-[1100px] mx-auto px-6 xl:px-12 pt-12 pb-20 grid grid-cols-1 xl:grid-cols-[1fr_220px] gap-8 xl:gap-12">
          <div className="content-wrapper min-w-0" ref={contentRef}>
            <React.Suspense fallback={<div className="p-12 text-center text-slate-500 animate-pulse">Loading content...</div>}>
              <ActiveSectionComponent />
            </React.Suspense>
          </div>

          {/* Right Rail Table of Contents (Only visible on large screens) */}
          <aside className="hidden xl:block">
            <div className="sticky top-[100px] text-sm">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 uppercase tracking-wider text-xs">On this page</h4>
              <div className="flex flex-col gap-3 text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800">
                {toc.length > 0 ? (
                  toc.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const target = document.getElementById(item.id);
                        if (target) {
                          // Offset scroll by header height + some padding
                          const y = target.getBoundingClientRect().top + window.scrollY - 100;
                          window.scrollTo({ top: y, behavior: "smooth" });
                        }
                      }}
                      className={cn(
                        "relative py-1 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400",
                        item.level === 3 ? "pl-7 text-[13px]" : "pl-4",
                        activeTocId === item.id ? "text-indigo-600 dark:text-indigo-400 font-medium" : ""
                      )}
                    >
                      {activeTocId === item.id && (
                        <div className="absolute left-[-1px] top-0 bottom-0 w-[2px] bg-indigo-600 dark:bg-indigo-400" />
                      )}
                      {item.text}
                    </a>
                  ))
                ) : (
                  <div className="pl-4 text-xs italic opacity-50">No headings found</div>
                )}
              </div>
            </div>
          </aside>
        </main>
      </div>

      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        searchItems={SEARCH_ITEMS}
        onNavigate={(hash) => setActiveSectionId(hash)}
      />
    </div>
  );
}
