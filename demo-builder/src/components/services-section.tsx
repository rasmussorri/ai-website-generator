"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Truck,
  ShieldCheck,
  Timer,
  Wrench,
  ArrowRight,
  Circle,
  Lightning,
  ChartLineUp,
  Buildings,
  Briefcase,
  Hammer,
  GearSix,
  Drop,
  Lightbulb,
  Cpu,
  Plant,
  Factory,
  ChatCircle,
  Headset,
  Package,
  Files,
} from "@phosphor-icons/react";
import type { Lead } from "@/data/lead-type";

// Phosphor icons keyed by friendly name. If a lead's iconName is not in the map,
// it falls back to Wrench. Expand this freely — don't break existing keys.
const iconMap: Record<string, React.ComponentType<{ weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"; className?: string; size?: number | string }>> = {
  Truck,
  Shield: ShieldCheck,
  Clock: Timer,
  Wrench,
  Lightning,
  ChartLineUp,
  // Common building / industrial
  Buildings,
  Factory,
  Hammer,
  Plant,
  // Tech / electrical
  Cpu,
  CircuitBoard: Cpu, // alias
  Lightbulb,
  // Services / ops
  GearSix,
  Drop,
  Briefcase,
  Package,
  Files,
  ChatCircle,
  Headset,
};

interface ServicesSectionProps {
  services: Lead["services"];
  primaryColor?: string;
  heading?: string;
  subtext?: string;
  sectionLabel?: string;
  ctaLabel?: string;
  ctaCardHeading?: string;
  ctaCardBody?: string;
}

export function ServicesSection({
  services,
  heading,
  subtext,
  sectionLabel = "Palvelumme",
  ctaCardHeading,
  ctaCardBody,
}: ServicesSectionProps) {
  return (
    <section id="features" className="py-32 px-6 bg-white overflow-hidden">
      <div className="mx-auto max-w-[1400px]">
        {/* Section Header */}
        <div className="mb-20">
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
              className="text-4xl md:text-6xl font-bold tracking-tighter leading-none text-zinc-950"
            >
              {heading ?? "Palvelut tarpeisiisi"}
            </motion.h2>
            {subtext && (
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="text-lg text-zinc-600 max-w-md pb-2"
              >
                {subtext}
              </motion.p>
            )}
          </div>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-6 auto-rows-[300px]">
          {services.map((service, i) => (
            <BentoCard key={service.name} service={service} index={i} />
          ))}

          {/* CTA Card / Summary Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="md:col-span-6 lg:col-span-4 rounded-[2.5rem] bg-zinc-950 p-10 flex flex-col justify-between group overflow-hidden relative"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand/20 blur-3xl rounded-full translate-x-10 -translate-y-10 group-hover:bg-brand/30 transition-colors" />

            <div>
              <div className="flex items-center gap-2 text-brand mb-6">
                <Circle weight="fill" className="w-2 h-2" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Aina palveluksessasi</span>
              </div>
              <h3 className="text-3xl font-bold text-white tracking-tight mb-4">
                {ctaCardHeading ?? "Kysy lisää palveluistamme"}
              </h3>
              <p className="text-zinc-400">
                {ctaCardBody ?? "Asiantuntijamme auttavat sinua löytämään juuri oikean ratkaisun hankkeellesi."}
              </p>
            </div>

            <a
              href="#yhteystiedot"
              className="inline-flex items-center gap-3 text-white font-bold group"
            >
              <span>Ota yhteyttä asiantuntijaan</span>
              <ArrowRight weight="bold" className="w-5 h-5 transition-transform group-hover:translate-x-2 text-brand" />
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function BentoCard({ service, index }: { service: Lead["services"][number]; index: number }) {
  const Icon = iconMap[service.iconName] || Truck;

  // Custom sizes for bento effect
  const colSpan = index === 0 ? "md:col-span-6 lg:col-span-8" : index === 3 ? "md:col-span-6 lg:col-span-8" : "md:col-span-3 lg:col-span-4";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      className={`${colSpan} bento-card flex flex-col justify-between group h-full`}
    >
      <div>
        <div className="flex items-center justify-between mb-8">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center group-hover:bg-brand/10 transition-colors duration-500">
            <Icon
              weight="duotone"
              className="w-8 h-8 text-zinc-900 group-hover:text-brand transition-colors duration-500"
            />
          </div>
          <div className="w-10 h-10 rounded-full border border-zinc-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 -translate-x-4 group-hover:translate-x-0">
            <ArrowRight weight="bold" className="w-4 h-4 text-brand" />
          </div>
        </div>

        <h3 className="text-2xl font-bold text-zinc-950 tracking-tight mb-4">{service.name}</h3>
        <p className="text-zinc-500 leading-relaxed text-lg max-w-md">{service.description}</p>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <div className="h-px flex-1 bg-zinc-100 group-hover:bg-brand/20 transition-colors" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 group-hover:text-brand transition-colors">
          Tutustu
        </span>
      </div>
    </motion.div>
  );
}
