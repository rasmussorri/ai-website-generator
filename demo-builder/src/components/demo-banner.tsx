"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

/** Fraction of the page that must be scrolled before the note appears. */
const REVEAL_AT = 0.95;

/** Copy comes from BRAND (DEMO_BANNER_LABEL / DEMO_BANNER_TEXT) via the server page. */
export function DemoBanner({ label, text }: { label: string; text: string }) {
  const [visible, setVisible] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (dismissed) return;
    function onScroll() {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const progress = total > 0 ? scrolled / total : 1;
      if (progress >= REVEAL_AT) setVisible(true);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDismissed(true);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [dismissed]);

  return (
    <AnimatePresence>
      {visible && !dismissed && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          onClick={() => setDismissed(true)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24, rotate: -1 }}
            animate={{ opacity: 1, scale: 1, y: 0, rotate: -1 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg rounded-3xl border-2 border-dashed border-amber-400 bg-amber-100 p-8 shadow-2xl md:p-10"
          >
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Sulje"
              className="absolute right-5 top-5 text-amber-700 transition-colors hover:text-amber-950"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/90 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-amber-950">
              {label}
            </span>
            <p className="mt-5 text-lg font-medium leading-relaxed text-amber-950 md:text-xl">
              {text}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
