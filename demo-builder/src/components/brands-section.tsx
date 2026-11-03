"use client";

import React from "react";
import { motion } from "framer-motion";
import type { Lead } from "@/data/lead-type";

interface BrandsSectionProps {
  brands: Lead["brands"];
  sectionLabel?: string;
  heading?: string;
  subtext?: string;
  cardEyebrow?: string;
  cardFootnote?: string;
}

export function BrandsSection({
  brands,
  sectionLabel = "Edustamamme merkit",
  heading,
  subtext,
  cardEyebrow = "Partner",
  cardFootnote = "Official Distributor",
}: BrandsSectionProps) {
  // Double the brands for a seamless loop
  const duplicatedBrands = [...brands, ...brands, ...brands];

  return (
    <section id="skills" className="py-32 bg-zinc-950 overflow-hidden relative">
      {/* Background patterns */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
      </div>

      <div className="mx-auto max-w-[1400px] px-6 mb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex items-center gap-2 mb-6"
        >
          <div className="h-px w-8 bg-brand" />
          <span className="text-xs font-bold uppercase tracking-widest text-brand">
            {sectionLabel}
          </span>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-end">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold tracking-tighter leading-none text-white"
          >
            {heading ?? "Laajin valikoima, parhaat kumppanit"}
          </motion.h2>
          {subtext && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-lg text-zinc-400 max-w-md pb-2"
            >
              {subtext}
            </motion.p>
          )}
        </div>
      </div>

      {/* Infinite Marquee */}
      <div className="relative flex overflow-hidden py-10 group">
        <motion.div
          className="flex whitespace-nowrap gap-8"
          animate={{ x: ["0%", "-50%"] }}
          transition={{
            repeat: Infinity,
            duration: 30,
            ease: "linear",
          }}
        >
          {duplicatedBrands.map((brand, i) => (
            <div
              key={`${brand.name}-${i}`}
              className="flex flex-col min-w-[350px] p-10 rounded-[2.5rem] bg-zinc-900 border border-zinc-800 transition-all duration-500 hover:border-brand/50 hover:bg-zinc-800/50 group/card"
            >
              <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.2em] mb-4">{cardEyebrow}</div>
              <h3 className="text-4xl font-bold text-white tracking-tighter mb-4 group-hover/card:text-brand transition-colors">
                {brand.name}
              </h3>
              <p className="text-zinc-500 whitespace-normal text-sm leading-relaxed max-w-[250px]">
                {brand.description}
              </p>

              <div className="mt-8 flex items-center gap-2 text-zinc-700 group-hover/card:text-brand/50 transition-colors">
                <div className="h-px w-6 bg-current" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{cardFootnote}</span>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Gradient Fades */}
        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-zinc-950 to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-zinc-950 to-transparent z-10 pointer-events-none" />
      </div>
    </section>
  );
}
