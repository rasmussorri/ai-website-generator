"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Quotes } from "@phosphor-icons/react";
import type { Lead } from "@/data/lead-type";

interface AboutSectionProps {
  about: Lead["about"];
  company: Lead["company"];
}

export function AboutSection({ about, company }: AboutSectionProps) {
  const sectionLabel = about.sectionLabel ?? "Tietoa meistä";
  const ctaLabel = about.ctaLabel ?? "Ota yhteyttä";
  const ctaHref = about.ctaHref ?? "#yhteystiedot";
  const quoteText = about.quote ?? "Suunnitellaan yhdessä tarpeisiisi sopiva ratkaisu.";
  const quoteAuthor = about.quoteAuthor ?? company.name;

  return (
    <section id="about" className="py-32 px-6 bg-zinc-100 overflow-hidden">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 lg:gap-32 items-center">

          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center gap-2 mb-8">
              <div className="h-px w-8 bg-brand" />
              <span className="text-xs font-bold uppercase tracking-widest text-brand">
                {sectionLabel}
              </span>
            </div>

            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none text-zinc-950 mb-10">
              {about.heading}
            </h2>

            <div className="space-y-6 mb-12">
              <p className="text-xl text-zinc-600 leading-relaxed">
                {about.text}
              </p>
            </div>

            <a
              href={ctaHref}
              className="group inline-flex items-center gap-3 text-brand font-bold text-lg mb-12"
            >
              <span>{ctaLabel}</span>
              <div className="w-10 h-10 rounded-full border border-brand/20 flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-all duration-300">
                <ArrowRight weight="bold" className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </div>
            </a>

            {/* Signature */}
            {company.signature && (
              <div className="flex flex-col gap-2">
                <div className="relative h-16 w-56">
                  <Image
                    src={company.signature}
                    alt={`${about.ceoName ?? company.name} signature`}
                    fill
                    unoptimized
                    className="object-contain object-left"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-px bg-brand" />
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                    {about.ceoName ? `${about.ceoName} — ${company.name}` : company.name}
                  </span>
                </div>
              </div>
            )}
          </motion.div>

          {/* Right Visuals & Stats */}
          <div className="relative">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              {about.highlights.map((h, i) => (
                <motion.div
                  key={h.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bento-card p-10 bg-white"
                >
                  <div className="text-5xl font-bold text-zinc-950 tracking-tighter mb-2">
                    {h.value}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
                    {h.label}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Premium Quote Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative p-12 bg-zinc-950 rounded-[3rem] overflow-hidden shadow-2xl"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Quotes weight="fill" size={120} className="text-brand" />
              </div>

              <div className="relative z-10">
                <p className="text-2xl md:text-3xl font-medium text-white leading-relaxed mb-8 italic">
                  &ldquo;{quoteText}&rdquo;
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-px bg-brand" />
                  <span className="text-sm font-bold uppercase tracking-widest text-zinc-400">
                    {quoteAuthor}
                  </span>
                </div>
              </div>

              {/* Decorative accent */}
              <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-brand to-transparent" />
            </motion.div>

            {/* Background decorative shape */}
            <div className="absolute -z-10 -top-20 -right-20 w-64 h-64 bg-brand/5 blur-3xl rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
