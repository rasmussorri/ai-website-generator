import { notFound } from "next/navigation";
import { getLeadBySlug } from "@/lib/leads-server";
import { SiteNav } from "@/components/site-nav";
import { Hero } from "@/components/hero";
import { ServicesSection } from "@/components/services-section";
import { BrandsSection } from "@/components/brands-section";
import { AboutSection } from "@/components/about-section";
import { ContactCta } from "@/components/contact-cta";
import { DemoBanner } from "@/components/demo-banner";
import { BRAND } from "@/lib/brand";
import { TrackOpen } from "@/components/track-open";

// Pages are rendered on first visit and cached permanently by Vercel's CDN.
// On-demand revalidation via /api/revalidate clears the cache when images are updated.
// Open tracking can't rely on this render (it fires once, on the cold render) —
// <TrackOpen> below sends a client-side beacon on every real browser load instead.
export const revalidate = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lead = await getLeadBySlug(slug);
  if (!lead) return {};
  return {
    title: `${lead.company.name} – ${lead.company.tagline}`,
    description: lead.hero.subtext,
  };
}

export default async function LeadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lead = await getLeadBySlug(slug);
  if (!lead) notFound();

  // Inject the lead's primary brand color as a CSS variable scoped to this page.
  const brandStyle = {
    "--color-brand": lead.company.primaryColor,
  } as React.CSSProperties;

  return (
    <div style={brandStyle}>
      <TrackOpen slug={slug} />
      <SiteNav company={lead.company} nav={lead.nav} />
      <main>
        <Hero
          company={lead.company}
          hero={lead.hero}
          highlights={lead.about.highlights}
        />
        <ServicesSection
          services={lead.services}
          heading={lead.servicesSection?.heading}
          subtext={lead.servicesSection?.subtext}
          sectionLabel={lead.servicesSection?.sectionLabel}
          ctaLabel={lead.servicesSection?.ctaLabel}
          ctaCardHeading={lead.servicesSection?.ctaCardHeading}
          ctaCardBody={lead.servicesSection?.ctaCardBody}
        />
        {lead.brands.length > 0 && (
          <BrandsSection
            brands={lead.brands}
            sectionLabel={lead.brandsSection?.sectionLabel}
            heading={lead.brandsSection?.heading}
            subtext={lead.brandsSection?.subtext}
            cardEyebrow={lead.brandsSection?.cardEyebrow}
            cardFootnote={lead.brandsSection?.cardFootnote}
          />
        )}
        <AboutSection about={lead.about} company={lead.company} />
        <ContactCta contact={lead.contact} company={lead.company} />
      </main>
      <footer className="py-20 px-6 bg-zinc-950 border-t border-zinc-900">
        <div className="mx-auto max-w-[1400px] flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <span className="font-display font-bold text-xl tracking-tighter text-white">
              {lead.company.name}
            </span>
          </div>
          <div className="text-zinc-500 text-sm font-medium">
            © {new Date().getFullYear()} {lead.company.name} · {lead.company.city}
          </div>
          <div className="flex items-center gap-6">
            {lead.nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-zinc-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
      <DemoBanner label={BRAND.bannerLabel} text={BRAND.bannerText} />
    </div>
  );
}
