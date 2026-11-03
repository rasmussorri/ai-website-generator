export interface NavItem {
  label: string;
  href: string;
}

export interface Service {
  name: string;
  description: string;
  iconName: string;
}

export interface DeptPhone {
  dept: string;
  phone: string;
}

export interface Lead {
  /** Stable kebab-case identifier used as the URL slug, e.g. "example-workshop". */
  slug: string;
  company: {
    name: string;
    tagline: string;
    city: string;
    industry: string;
    phone: string;
    email: string;
    /** Hex color extracted from the lead's logo or brand. Drives all CTAs and accents. */
    primaryColor: string;
    /** Navbar background theme, auto-picked so the logo stays legible. Defaults to "dark". */
    navTheme?: "light" | "dark";
    website?: string;
    /** Absolute path under public/, e.g. "/images/leads/<slug>/logo.png". */
    logo?: string;
    /** Absolute path under public/, hero image showing real people / equipment / premises. */
    heroImage?: string;
    /** Absolute path under public/, AI-generated CEO signature PNG. */
    signature?: string;
    /** List of office cities shown in the contact section, e.g. ["Vantaa", "Tampere"]. */
    locations?: string[];
  };
  hero: {
    headline: string;
    subtext: string;
    ctaPrimary: { label: string; href: string };
    ctaSecondary: { label: string; href: string };
    credentialStrip?: string[];
  };
  nav: NavItem[];
  services: Service[];
  servicesSection?: {
    heading: string;
    subtext: string;
    sectionLabel?: string;
    ctaLabel?: string;
    /** Dark CTA card title inside the bento grid. Default: "Tarvitsetko apua valinnassa?" */
    ctaCardHeading?: string;
    /** Dark CTA card body text inside the bento grid. */
    ctaCardBody?: string;
  };
  brands: { name: string; description: string }[];
  brandsSection?: {
    sectionLabel?: string;
    heading?: string;
    subtext?: string;
    /** Label shown above each card name (e.g. "Partner", "Sektori", "Project type"). Default: "Partner". */
    cardEyebrow?: string;
    /** Label shown below each card (e.g. "Official Distributor", "Reference"). Default: "Official Distributor". */
    cardFootnote?: string;
  };
  about: {
    heading: string;
    text: string;
    highlights: Array<{ value: string; label: string }>;
    quote?: string;
    quoteAuthor?: string;
    /** CEO full name — used for the signature caption. */
    ceoName?: string;
    sectionLabel?: string;
    ctaLabel?: string;
    ctaHref?: string;
  };
  contact: {
    heading: string;
    subtext: string;
    cta: string;
    sectionLabel?: string;
    variant?: "form" | "download";
    deptPhones?: DeptPhone[];
    downloadHref?: string;
    githubHref?: string;
    downloadFeatures?: string[];
  };
}
