import React from "react";

interface AdminLoginBannerProps {
  isDismissed: boolean;
  onDismiss: () => void;
}

export const AdminLoginBanner: React.FC<AdminLoginBannerProps> = ({ isDismissed, onDismiss }) => {
  // Demo mode is true by default unless VITE_DEMO_MODE or REACT_APP_DEMO_MODE is explicitly set to "false"
  const isDemo =
    import.meta.env.VITE_DEMO_MODE === "false" || process.env.REACT_APP_DEMO_MODE === "false"
      ? false
      : true;

  if (isDismissed || !isDemo) return null;

  return (
    <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-4 mb-4 backdrop-blur-sm transition-all duration-300">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className="text-blue-700 dark:text-blue-300 font-semibold flex items-center gap-1.5 text-sm">
            <span>🔓</span> Development Mode Active
          </p>
          <p className="text-blue-600/90 dark:text-blue-400/90 text-xs mt-1 leading-relaxed">
            Quick log in details: <code className="bg-blue-100/50 dark:bg-blue-900/40 px-1.5 py-0.5 rounded text-blue-800 dark:text-blue-300 font-mono text-[11px]">admin@silicofeller.dev</code> / <code className="bg-blue-100/50 dark:bg-blue-900/40 px-1.5 py-0.5 rounded text-blue-800 dark:text-blue-300 font-mono text-[11px]">AdminDev123!</code>
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300 transition-colors p-1"
          aria-label="Dismiss banner"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
