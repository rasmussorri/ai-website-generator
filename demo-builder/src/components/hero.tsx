"use client";

import React from "react";
import Image from "next/image";
import { motion, Variants } from "framer-motion";
import { ArrowRight, Phone, CheckCircle } from "@phosphor-icons/react";
import type { Lead } from "@/data/lead-type";

interface HeroProps {
  company: Lead["company"];
  hero: Lead["hero"];
  highlights: Lead["about"]["highlights"];
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.3,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 20,
    },
  },
};

export function Hero({ company, hero, highlights }: HeroProps) {
  const credentials = hero.credentialStrip ?? [
    "Henkilökohtainen palvelu",
    "Tarpeisiisi sopiva ratkaisu",
    "Ota yhteyttä",
  ];

  return (
    <section className="relative min-h-[100dvh] flex items-center pt-32 pb-20 overflow-hidden bg-zinc-50">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-brand/5 to-transparent pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-brand/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-[1400px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">

          {/* Left Content */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="z-10"
          >
            <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/10 border border-brand/20 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-brand">
                {company.industry} · {company.city}
              </span>
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.9] mb-8 text-zinc-950"
            >
              {hero.headline.split(" ").map((word, i) => (
                <span key={i} className="inline-block mr-[0.2em]">
                  {word}
                </span>
              ))}
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="text-lg md:text-xl text-zinc-600 mb-12 max-w-xl leading-relaxed"
            >
              {hero.subtext}
            </motion.p>

            <motion.div variants={itemVariants} className="flex flex-wrap gap-4 mb-16">
              <a
                href={hero.ctaPrimary.href}
                className="group flex items-center gap-3 px-8 py-4 bg-brand text-white rounded-2xl font-bold text-lg transition-all duration-300 shadow-xl shadow-brand/20 hover:shadow-brand/40 hover:-translate-y-1 active:scale-95"
              >
                <span>{hero.ctaPrimary.label}</span>
                <ArrowRight weight="bold" className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </a>

              <a
                href={company.phone ? `tel:${company.phone.replace(/\s/g, "")}` : hero.ctaSecondary.href}
                className="flex items-center gap-3 px-8 py-4 bg-white text-zinc-950 border border-zinc-200 rounded-2xl font-bold text-lg transition-all duration-300 hover:border-zinc-950 hover:bg-zinc-50 active:scale-95 shadow-sm"
              >
                {company.phone ? <Phone weight="bold" className="w-5 h-5" /> : <ArrowRight weight="bold" className="w-5 h-5" />}
                <span>{company.phone || hero.ctaSecondary.label}</span>
              </a>
            </motion.div>

            {/* Credential Strip */}
            <motion.div
              variants={itemVariants}
              className="flex flex-wrap items-center gap-6 py-6 border-t border-zinc-200"
            >
              {credentials.map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <CheckCircle weight="fill" className="w-5 h-5 text-brand" />
                  <span className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">{c}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right Visual Section */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
            className="relative h-[420px] sm:h-[480px] lg:h-[700px] flex items-center justify-center"
          >
            {/* Main Image Container */}
            <div className="relative w-full h-full rounded-[3rem] overflow-hidden shadow-2xl group">
              <Image
                src={company.heroImage ?? "/images/examples/workshop.svg"}
                alt={`${company.name} – ${company.industry}`}
                fill
                unoptimized
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/60 via-transparent to-transparent" />

              {/* Floating Stat Card */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.8 }}
                className="hidden md:block absolute bottom-8 left-8 right-8 p-8 glass-panel rounded-[2rem] border-white/20"
              >
                <div className="grid grid-cols-3 gap-6">
                  {highlights.slice(0, 3).map((h) => (
                    <div key={h.label} className="text-center">
                      <div className="text-3xl font-bold text-zinc-950 tracking-tighter mb-1 break-words leading-tight">{h.value}</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 leading-tight">{h.label}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Decorative background shape */}
            <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] border-[40px] border-brand/5 rounded-full pointer-events-none" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
