import React, { useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAVIGATION_DATA, NavItem } from "./sections-data";

interface DocumentationSidebarProps {
  activeSectionId: string;
  setActiveSectionId: (id: string) => void;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

export function DocumentationSidebar({ activeSectionId, setActiveSectionId, mobileOpen, setMobileOpen }: DocumentationSidebarProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeSectionId) return;
    const newExpanded = { ...expanded };
    NAVIGATION_DATA.forEach((group) => {
      group.items.forEach((item) => {
        if (item.children) {
          const hasChildActive = item.children.some((child) => child.id === activeSectionId);
          if (hasChildActive || item.id === activeSectionId) {
            newExpanded[item.id] = true;
          }
        }
      });
    });
    setExpanded(newExpanded);
  }, [activeSectionId]);

  const toggleTree = (treeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [treeId]: !prev[treeId] }));
  };

  const handleSelect = (id: string) => {
    setActiveSectionId(id);
    if (setMobileOpen) setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" 
          onClick={() => setMobileOpen && setMobileOpen(false)}
        />
      )}

      <aside 
        className={cn(
          "sidebar sticky top-[64px] self-start h-[calc(100vh-64px)] overflow-y-auto custom-scrollbar flex-shrink-0 text-sm",
          mobileOpen ? "fixed left-0 top-0 h-[100vh] w-[280px] z-50 transition-transform translate-x-0 shadow-2xl" : "hidden md:block w-[280px]",
          "bg-[#111619] text-slate-300"
        )}
        aria-label="Documentation sections"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "#334155 transparent",
        }}
      >

        <div className="px-3 pb-20">
          {NAVIGATION_DATA.map((group, gIdx) => (
            <div key={gIdx} className="mb-6">
              <div className="flex items-center gap-2 font-bold text-[13px] tracking-wide text-slate-100 uppercase mt-6 mb-2 px-3 pb-1 border-b border-slate-800">
                {group.title}
              </div>
              <div className="flex flex-col gap-[2px]">
                {group.items.map((item) => {
                  if (item.status === "hidden") return null;

                  const isSelected = activeSectionId === item.id;
                  const hasChildren = !!item.children;
                  const isExpanded = expanded[item.id] || false;

                  if (hasChildren) {
                    const hasChildActive = item.children!.some(c => c.id === activeSectionId);
                    
                    return (
                      <div key={item.id} className="flex flex-col gap-[2px]">
                        <button
                          onClick={(e) => {
                            if (isSelected) {
                              toggleTree(item.id, e);
                            } else {
                              handleSelect(item.id);
                              if (!isExpanded) toggleTree(item.id, e);
                            }
                          }}
                          aria-expanded={isExpanded}
                          className={cn(
                            "relative w-full flex items-center justify-between rounded py-1.5 px-3 transition-colors cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-indigo-500",
                            isSelected || hasChildActive ? "text-white font-semibold" : "text-slate-400 hover:text-slate-200 hover:bg-white/5",
                            isSelected ? "bg-indigo-950/50" : ""
                          )}
                        >
                          {/* Active Indicator Bar */}
                          {isSelected && (
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-500 rounded-r-sm" />
                          )}

                          <span className="flex items-center gap-2 pr-2">
                            <span>{item.label}</span>
                            {item.status === "preview" && (
                              <span className="text-[9px] uppercase tracking-wider font-bold bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">Preview</span>
                            )}
                          </span>
                          <div 
                            onClick={(e) => toggleTree(item.id, e)}
                            className="p-1 -mr-1 rounded hover:bg-white/10"
                            aria-label="Toggle children"
                          >
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                                isExpanded ? "rotate-90 text-slate-300" : "text-slate-500"
                              )}
                            />
                          </div>
                        </button>
                        
                        <div 
                          className={cn(
                            "flex flex-col overflow-hidden transition-all duration-300 ease-in-out pl-[14px]",
                            isExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
                          )}
                        >
                          <div className="border-l border-slate-800 ml-1 py-1 flex flex-col gap-[2px]">
                            {item.children?.map((child) => {
                              if (child.status === "hidden") return null;
                              const isChildSelected = activeSectionId === child.id;
                              
                              return (
                                <button
                                  key={child.id}
                                  onClick={() => handleSelect(child.id)}
                                  className={cn(
                                    "relative w-full text-left flex items-center justify-between rounded py-1.5 pl-4 pr-3 text-[13px] transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500",
                                    isChildSelected 
                                      ? "text-white font-semibold bg-indigo-950/50" 
                                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                                  )}
                                >
                                  {isChildSelected && (
                                    <div className="absolute left-[-1px] top-0 bottom-0 w-[3px] bg-indigo-500 rounded-r-sm" />
                                  )}
                                  <span className="truncate">{child.label}</span>
                                  {child.status === "preview" && (
                                    <span className="text-[9px] uppercase tracking-wider font-bold bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">Preview</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item.id)}
                      className={cn(
                        "relative w-full text-left flex items-center justify-between gap-3 rounded py-1.5 px-3 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500",
                        isSelected ? "text-white font-semibold bg-indigo-950/50" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                      )}
                    >
                      {/* Active Indicator Bar */}
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-500 rounded-r-sm" />
                      )}
                      <span className="truncate">{item.label}</span>
                      {item.status === "preview" && (
                        <span className="text-[9px] uppercase tracking-wider font-bold bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded flex-shrink-0">Preview</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
