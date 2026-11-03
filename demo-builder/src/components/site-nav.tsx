"use client";

import React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, ArrowRight, List, X } from "@phosphor-icons/react";
import type { Lead } from "@/data/lead-type";

interface SiteNavProps {
  company: Lead["company"];
  nav: Lead["nav"];
}

export function SiteNav({ company, nav }: SiteNavProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  // Logo legibility: a dark logo disappears on the default dark nav, so when
  // generation flags `navTheme: "light"` we flip the bar to a light background.
  const light = company.navTheme === "light";

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navBg = light
    ? scrolled
      ? "bg-white/90 backdrop-blur-xl border border-black/10"
      : "bg-white/80 backdrop-blur-md border border-black/5"
    : scrolled
      ? "bg-zinc-950/90 backdrop-blur-xl border border-white/10"
      : "bg-zinc-950/80 backdrop-blur-md border border-white/5";

  const brandText = light ? "text-zinc-900" : "text-white";
  const linkText = light
    ? "text-zinc-600 hover:text-zinc-900 hover:bg-black/5"
    : "text-zinc-400 hover:text-white hover:bg-white/5";
  const toggleBtn = light ? "bg-black/5 text-zinc-900" : "bg-white/5 text-white";
  const mobilePanel = light
    ? "bg-white border border-black/10"
    : "bg-zinc-950 border border-white/10";
  const mobileLink = light
    ? "text-zinc-700 hover:text-zinc-900 hover:bg-black/5"
    : "text-zinc-300 hover:text-white hover:bg-white/5";

  return (
    <header className="fixed top-0 left-0 w-full z-[9999] px-6 pt-6 pointer-events-none">
      <nav
        className={`mx-auto max-w-7xl flex items-center justify-between h-20 px-8 rounded-2xl transition-all duration-500 pointer-events-auto shadow-2xl ${navBg}`}
      >
        {/* Brand Identity */}
        <a href="#" aria-label={company.name} className="flex items-center">
          {company.logo ? (
            <div className="relative h-10 w-36">
              <Image
                src={company.logo}
                alt={company.name}
                fill
                unoptimized
                className="object-contain object-left"
                priority
              />
            </div>
          ) : (
            <span className={`font-display font-black text-2xl tracking-tighter ${brandText}`}>
              {company.name}
            </span>
          )}
        </a>

        {/* Desktop Links */}
        <ul className="hidden lg:flex items-center gap-2">
          {nav.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className={`px-5 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all duration-200 ${linkText}`}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Desktop CTA */}
        <div className="hidden lg:flex items-center gap-4">
          <a
            href={company.phone ? `tel:${company.phone.replace(/\s/g, "")}` : "#yhteystiedot"}
            className="group flex items-center gap-3 px-6 py-3 text-xs font-black uppercase tracking-widest text-white bg-brand hover:bg-brand-dark rounded-xl transition-all duration-300 shadow-xl shadow-brand/20 hover:shadow-brand/40 hover:-translate-y-0.5 active:scale-95"
          >
            {company.phone ? <Phone weight="bold" className="w-5 h-5" /> : <ArrowRight weight="bold" className="w-5 h-5" />}
            <span>{company.phone || "Ota yhteyttä"}</span>
          </a>
        </div>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`lg:hidden p-3 rounded-xl transition-colors ${toggleBtn}`}
          aria-label={menuOpen ? "Sulje valikko" : "Avaa valikko"}
        >
          {menuOpen ? <X size={24} weight="bold" /> : <List size={24} weight="bold" />}
        </button>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={`lg:hidden absolute top-32 left-6 right-6 p-8 rounded-3xl shadow-2xl z-[10000] pointer-events-auto ${mobilePanel}`}
          >
            <ul className="flex flex-col gap-2 mb-8">
              {nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`block py-4 px-6 text-lg font-bold rounded-2xl transition-all ${mobileLink}`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href={company.phone ? `tel:${company.phone.replace(/\s/g, "")}` : "#yhteystiedot"}
              className="flex items-center justify-center gap-3 w-full py-5 text-lg font-black uppercase tracking-widest text-white bg-brand rounded-2xl shadow-xl shadow-brand/20"
            >
              {company.phone ? <Phone weight="bold" className="w-6 h-6" /> : <ArrowRight weight="bold" className="w-6 h-6" />}
              {company.phone || "Ota yhteyttä"}
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
