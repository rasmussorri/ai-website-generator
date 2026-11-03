"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  EnvelopeSimple,
  MapPin,
  ArrowRight,
  CheckCircle,
  CaretRight
} from "@phosphor-icons/react";
import type { Lead } from "@/data/lead-type";

interface ContactCtaProps {
  contact: Lead["contact"];
  company: Lead["company"];
}

export function ContactCta({ contact, company }: ContactCtaProps) {
  const [submitted, setSubmitted] = React.useState(false);
  const sectionLabel = contact.sectionLabel ?? "Yhteystiedot";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <section id="yhteystiedot" className="py-32 px-6 bg-white overflow-hidden">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 lg:gap-32 items-start">

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
              {contact.heading}
            </h2>

            <p className="text-xl text-zinc-600 leading-relaxed mb-12">
              {contact.subtext}
            </p>

            {/* Department Phones */}
            {contact.deptPhones && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
                {contact.deptPhones.map((d) => (
                  <a
                    key={d.dept}
                    href={`tel:${d.phone.replace(/\s/g, "")}`}
                    className="group flex flex-col p-6 rounded-3xl border border-zinc-100 bg-zinc-50 hover:border-brand/30 hover:bg-zinc-100 transition-all duration-300"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2 group-hover:text-brand transition-colors">
                      {d.dept}
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-zinc-950">{d.phone}</span>
                      <CaretRight weight="bold" className="w-4 h-4 text-zinc-400 group-hover:text-brand group-hover:translate-x-1 transition-all" />
                    </div>
                  </a>
                ))}
              </div>
            )}

            {/* General Contact Info */}
            <div className="space-y-6 pt-10 border-t border-zinc-100">
              {company.phone && (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-900">
                  <Phone weight="bold" className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Toimisto</div>
                  <a href={`tel:${company.phone.replace(/\s/g, "")}`} className="text-lg font-bold text-zinc-950 hover:text-brand transition-colors">{company.phone}</a>
                </div>
              </div>

              )}
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-900">
                  <EnvelopeSimple weight="bold" className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Sähköposti</div>
                  <a href={`mailto:${company.email}`} className="text-lg font-bold text-zinc-950 hover:text-brand transition-colors">{company.email}</a>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-900">
                  <MapPin weight="bold" className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Toimipisteet</div>
                  <span className="text-lg font-bold text-zinc-950">
                    {(company.locations && company.locations.length > 0
                      ? company.locations
                      : [company.city]
                    ).join(" · ")}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="w-full"
          >
            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full min-h-[500px] flex flex-col items-center justify-center p-12 bg-zinc-50 rounded-[3rem] border border-zinc-100 text-center"
                >
                  <div className="w-20 h-20 bg-brand/10 text-brand rounded-full flex items-center justify-center mb-8">
                    <CheckCircle weight="fill" size={48} />
                  </div>
                  <h3 className="text-3xl font-bold text-zinc-950 tracking-tight mb-4">Viesti lähetetty!</h3>
                  <p className="text-lg text-zinc-500 max-w-xs">
                    Kiitos yhteydenotostasi. Asiantuntijamme palaavat asiaan 24 tunnin sisällä.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-10 text-brand font-bold flex items-center gap-2 hover:underline"
                  >
                    Lähetä uusi viesti
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onSubmit={handleSubmit}
                  className="w-full p-10 md:p-14 bg-zinc-50 rounded-[3rem] border border-zinc-100 shadow-sm"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 ml-4">Nimi</label>
                      <input
                        type="text"
                        required
                        placeholder="Matti Meikäläinen"
                        className="w-full px-6 py-4 bg-white border border-zinc-200 rounded-2xl focus:border-brand focus:ring-4 focus:ring-brand/5 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 ml-4">Puhelin</label>
                      <input
                        type="tel"
                        placeholder="Phone number"
                        className="w-full px-6 py-4 bg-white border border-zinc-200 rounded-2xl focus:border-brand focus:ring-4 focus:ring-brand/5 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 mb-8">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 ml-4">Sähköposti</label>
                    <input
                      type="email"
                      required
                      placeholder="hello@business.example"
                      className="w-full px-6 py-4 bg-white border border-zinc-200 rounded-2xl focus:border-brand focus:ring-4 focus:ring-brand/5 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2 mb-10">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 ml-4">Viesti</label>
                    <textarea
                      required
                      rows={5}
                      placeholder="Kerro lyhyesti, miten voimme auttaa..."
                      className="w-full px-6 py-4 bg-white border border-zinc-200 rounded-2xl focus:border-brand focus:ring-4 focus:ring-brand/5 outline-none transition-all resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="group w-full flex items-center justify-center gap-3 py-5 bg-brand text-white rounded-2xl font-bold text-lg transition-all duration-300 shadow-xl shadow-brand/20 hover:shadow-brand/40 hover:-translate-y-1 active:scale-95"
                  >
                    <span>{contact.cta}</span>
                    <ArrowRight weight="bold" className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </button>

                  <p className="mt-6 text-center text-xs text-zinc-400">
                    Henkilötietojasi käsitellään tietosuojaselosteemme mukaisesti.
                  </p>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
