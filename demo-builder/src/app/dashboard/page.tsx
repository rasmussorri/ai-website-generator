"use client";

import NextLink from "next/link";

import NextImage from "next/image";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  UploadSimple,
  Globe,
  CheckCircle,
  ArrowRight,
  Link,
  CheckSquare,
  Square,
  CircleNotch,
  WarningCircle,
  Funnel,
  Buildings,
  CaretDown,
  CaretUp,
  CaretUpDown,
  PencilSimple,
  Check,
  ArrowCounterClockwise,
  Plus,
  Trash,
  X,
  Info,
  Image as ImageIcon,
  MagnifyingGlass,
  PaperPlaneTilt,
  Clock,
  Phone,
  ChatText,
  ShieldCheck,
} from "@phosphor-icons/react";
import { STAFF_PREVIEW_HASH } from "@/components/track-open";

// ─── Types ────────────────────────────────────────────────────────────────────

// Stored raw in the `site_quality` text column: a "0".."100" redesign score,
// a legacy "good"/"bad" label (pre-scoring rows), or null when unanalysed.
type SiteQuality = string | null;
type FunnelStage = "contacted" | "answered" | "meeting-accepted" | "meeting-held" | "deal-closed" | "no-reply" | "no-show" | "declined";
type SortField = "name" | "city" | "industry" | "quality";
type SortDir = "asc" | "desc";
type PageSize = 10 | 25 | 50 | "all";

interface SmsMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  twilio_sid?: string | null;
  created_at: string;
}

// One row from sms_compliance_log — the record written when an SMS is approved.
interface ComplianceLog {
  id: string;
  message_body: string | null;
  phone: string | null;
  demo_url: string | null;
  title: string | null;
  company_size: number | null;
  data_source_url: string | null;
  reviewer_id: string | null;
  legal_basis: string | null;
  twilio_sid: string | null;
  send_mode: string | null;
  created_at: string;
}

interface Lead {
  id: string;
  companyName: string;
  ceoName?: string;
  url?: string;
  phone?: string;
  email?: string;
  city?: string;
  industry?: string;
  siteQuality: SiteQuality;
  siteQualityReason?: string;
  siteQualityFlags?: string[];
  selected: boolean;
  hasDemoBuilt: boolean;
  demoSlug?: string;
  demoUrl?: string;
  funnelStage?: FunnelStage;
  smsStatus?: string;
  contactedAt?: string; // first outreach send, SMS or email
  demoOpenedAt?: string;
  demoOpenCount?: number;
  demoDeletedAt?: string;
  createdAt?: string;
  demoBuiltAt?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  batchName?: string;
  // Client-side only (not persisted): set when a generation run failed and the
  // lead was kept in the inbox, so it can be spotted and retried or deleted.
  genFailed?: boolean;
  genFailReason?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEMO_BASE = (process.env.NEXT_PUBLIC_DEMO_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Gap between leads in a bulk generation run, to stay under the AI provider's
// tokens-per-minute limit. Small relative to per-lead time; smooths the bursts
// that the SDK retries would otherwise have to absorb.
const GEN_PACING_MS = 1500;

const FUNNEL_STAGES: { id: FunnelStage; label: string; pill: string; col: string; lost?: boolean }[] = [
  { id: "contacted",        label: "Contacted",       pill: "bg-zinc-100 text-zinc-600 border-zinc-200",        col: "bg-zinc-50 border-zinc-200" },
  { id: "answered",         label: "Replied",         pill: "bg-sky-50 text-sky-700 border-sky-200",            col: "bg-sky-50/50 border-sky-200" },
  { id: "meeting-accepted", label: "Meeting booked",  pill: "bg-violet-50 text-violet-700 border-violet-200",   col: "bg-violet-50/50 border-violet-200" },
  { id: "meeting-held",     label: "Meeting held",    pill: "bg-amber-50 text-amber-700 border-amber-200",      col: "bg-amber-50/50 border-amber-200" },
  { id: "deal-closed",      label: "Won",             pill: "bg-emerald-50 text-emerald-700 border-emerald-200",col: "bg-emerald-50/50 border-emerald-200" },
  { id: "no-reply",         label: "No reply",        pill: "bg-rose-50 text-rose-500 border-rose-200",         col: "bg-rose-50/40 border-rose-200", lost: true },
  { id: "no-show",          label: "No-show",         pill: "bg-orange-50 text-orange-500 border-orange-200",   col: "bg-orange-50/40 border-orange-200", lost: true },
  { id: "declined",         label: "Declined",        pill: "bg-zinc-100 text-zinc-500 border-zinc-300",        col: "bg-zinc-100/60 border-zinc-300", lost: true },
];

const PAGE_SIZES: PageSize[] = [10, 25, 50, "all"];

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(raw: string): Record<string, string>[] {
  const text = raw.replace(/^﻿/, "");
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const firstLine = lines[0];
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  function splitLine(line: string): string[] {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === delimiter && !inQ) { out.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  const headers = splitLine(lines[0]);
  return lines.slice(1)
    .map((line) => {
      const vals = splitLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { if (h) row[h] = vals[i] ?? ""; });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v.trim()));
}

function pick(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    for (const [k, v] of Object.entries(row)) {
      if (k.toLowerCase().replace(/[^a-z]/g, "").includes(key.toLowerCase().replace(/[^a-z]/g, "")) && v?.trim())
        return v.trim();
    }
  }
}

function rowToLead(row: Record<string, string>): Lead | null {
  const companyName =
    pick(row, "nimi", "name", "yritys", "company", "toiminimi", "yrityksennimi") ??
    Object.values(row).find((v) => v.trim().length > 2);
  if (!companyName) return null;
  return {
    id: crypto.randomUUID(),
    companyName: companyName.trim(),
    ceoName: pick(row, "ceo", "toimitusjohtaja", "tj", "edustaja", "contact", "yhteyshenkilö", "henkilo"),
    url: pick(row, "url", "website", "www", "kotisivu", "domain", "verkkosivu"),
    phone: pick(row, "phone", "puhelin", "puh", "gsm", "tel"),
    email: pick(row, "email", "sahkoposti", "sähköposti", "mail"),
    city: pick(row, "city", "kaupunki", "kunta", "paikkakunta", "kotipaikka", "sijaintipaikkakunta"),
    industry: pick(row, "industry", "toimiala", "ala", "tyyppi", "luokka"),
    siteQuality: null,
    selected: false,
    hasDemoBuilt: false,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Supabase DB mappers ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbRowToLead(row: any): Lead {
  return {
    id: row.id,
    companyName: row.company_name,
    ceoName: row.ceo_name ?? undefined,
    url: row.url ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    city: row.city ?? undefined,
    industry: row.industry ?? undefined,
    siteQuality: row.site_quality ?? null,
    siteQualityReason: row.site_quality_reason ?? undefined,
    siteQualityFlags: row.site_quality_flags ?? undefined,
    selected: false,
    hasDemoBuilt: row.has_demo_built,
    demoSlug: row.demo_slug ?? undefined,
    demoUrl: row.demo_url ?? undefined,
    funnelStage: row.funnel_stage ?? undefined,
    smsStatus: row.sms_status ?? undefined,
    contactedAt: row.sms_sent_at ?? row.email_sent_at ?? undefined,
    demoOpenedAt: row.demo_opened_at ?? undefined,
    demoOpenCount: row.demo_open_count ?? undefined,
    demoDeletedAt: row.demo_deleted_at ?? undefined,
    createdAt: row.created_at ?? undefined,
    demoBuiltAt: row.demo_built_at ?? undefined,
    logoUrl: row.content?.company?.logo ?? undefined,
    heroImageUrl: row.content?.company?.heroImage ?? undefined,
    batchName: row.batch_name ?? undefined,
  };
}

function leadToDbRow(lead: Lead) {
  return {
    id: lead.id,
    company_name: lead.companyName,
    ceo_name: lead.ceoName ?? null,
    url: lead.url ?? null,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    city: lead.city ?? null,
    industry: lead.industry ?? null,
    site_quality: lead.siteQuality ?? null,
    site_quality_reason: lead.siteQualityReason ?? null,
    site_quality_flags: lead.siteQualityFlags ?? null,
    has_demo_built: lead.hasDemoBuilt,
    demo_slug: lead.demoSlug ?? null,
    demo_url: lead.demoUrl ?? null,
    funnel_stage: lead.funnelStage ?? null,
    batch_name: lead.batchName ?? null,
  };
}

function patchToDbRow(patch: Partial<Lead>) {
  const row: Record<string, unknown> = {};
  if ("companyName" in patch) row.company_name = patch.companyName;
  if ("ceoName" in patch) row.ceo_name = patch.ceoName ?? null;
  if ("url" in patch) row.url = patch.url ?? null;
  if ("phone" in patch) row.phone = patch.phone ?? null;
  if ("email" in patch) row.email = patch.email ?? null;
  if ("city" in patch) row.city = patch.city ?? null;
  if ("industry" in patch) row.industry = patch.industry ?? null;
  if ("siteQuality" in patch) row.site_quality = patch.siteQuality ?? null;
  if ("siteQualityReason" in patch) row.site_quality_reason = patch.siteQualityReason ?? null;
  if ("siteQualityFlags" in patch) row.site_quality_flags = patch.siteQualityFlags ?? null;
  if ("hasDemoBuilt" in patch) row.has_demo_built = patch.hasDemoBuilt;
  if ("demoSlug" in patch) row.demo_slug = patch.demoSlug ?? null;
  if ("demoUrl" in patch) row.demo_url = patch.demoUrl ?? null;
  if ("funnelStage" in patch) row.funnel_stage = patch.funnelStage ?? null;
  return row;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Numeric redesign score (0-100, higher = stronger lead), or null for legacy
// "good"/"bad" rows that predate scoring.
function scoreOf(quality: SiteQuality): number | null {
  if (quality == null || quality === "") return null;
  const n = Number(quality);
  return Number.isFinite(n) ? n : null;
}

function SiteQualityBadge({ quality }: { quality: SiteQuality }) {
  if (quality == null || quality === "") return null;

  const score = scoreOf(quality);
  if (score === null) {
    // Legacy good/bad rows: "good" = needs redesign = worth pursuing.
    const isLead = quality === "good";
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${
        isLead ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isLead ? "bg-emerald-500" : "bg-rose-500"}`} />
        {isLead ? "Good lead" : "Skip"}
      </span>
    );
  }

  const tone = score >= 70
    ? { box: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500" }
    : score >= 40
    ? { box: "bg-amber-50 text-amber-600", dot: "bg-amber-500" }
    : { box: "bg-zinc-100 text-zinc-500", dot: "bg-zinc-400" };

  return (
    <span
      title="Redesign-opportunity score (0-100, higher = stronger lead)"
      className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${tone.box}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {score}
    </span>
  );
}

function SortButton({ field, label, sortBy, sortDir, onClick }: {
  field: SortField; label: string; sortBy: SortField; sortDir: SortDir;
  onClick: (f: SortField) => void;
}) {
  const active = sortBy === field;
  return (
    <button
      onClick={() => onClick(field)}
      className={`flex items-center gap-1 text-xs font-bold uppercase tracking-wider transition-colors ${
        active ? "text-zinc-700" : "text-zinc-400 hover:text-zinc-600"
      }`}
    >
      {label}
      {active ? (
        sortDir === "asc" ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />
      ) : (
        <CaretUpDown size={10} className="opacity-40" />
      )}
    </button>
  );
}

function EditableSlug({ slug, demoUrl, onChange }: { slug: string; demoUrl?: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slug);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    const clean = draft.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    onChange(clean || slug);
    setDraft(clean || slug);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-xs text-zinc-400">{DEMO_BASE}/</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(slug); setEditing(false); } }}
          className="text-xs border border-zinc-300 rounded-md px-2 py-0.5 outline-none focus:border-zinc-500 w-40 font-mono"
        />
        <button onClick={commit} className="text-emerald-500 hover:text-emerald-600 transition-colors">
          <Check size={13} weight="bold" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-0.5 group/slug">
      <a
        href={`${demoUrl ?? `${DEMO_BASE}/${slug}`}${STAFF_PREVIEW_HASH}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-xs text-zinc-400 hover:text-zinc-700 flex items-center gap-1 transition-colors"
      >
        <Link size={10} />
        {demoUrl ?? `${DEMO_BASE}/${slug}`}
      </a>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover/slug:opacity-100 text-zinc-300 hover:text-zinc-500 transition-all"
        title="Edit slug"
      >
        <PencilSimple size={11} />
      </button>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [csvFileName, setCsvFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  // Staged CSV import waiting for the user to name the batch before committing.
  const [pendingImport, setPendingImport] = useState<{ leads: Lead[]; fileName: string } | null>(null);
  const [batchNameInput, setBatchNameInput] = useState("");
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortField>("quality");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<FunnelStage | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ companyName: "", ceoName: "", url: "", phone: "", email: "", city: "", industry: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const addFormRef = useRef<HTMLInputElement>(null);

  // ── Generation modal state ──────────────────────────────────────────────────

  type GenStatus = "running" | "done" | "error";
  interface GenState {
    queue: Lead[];
    currentIdx: number;
    status: GenStatus;
    log: string;
    skipped: number;
  }
  const [gen, setGen] = useState<GenState | null>(null);
  const [demoSort, setDemoSort] = useState<"latest" | "alpha">("latest");
  const [demoPageSize, setDemoPageSize] = useState<PageSize>(25);
  const [demoPage, setDemoPage] = useState(1);
  const [demoBatchFilter, setDemoBatchFilter] = useState<string | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [inboxSearch, setInboxSearch] = useState("");
  const [demoSearch, setDemoSearch] = useState("");
  const [funnelSearch, setFunnelSearch] = useState("");
  const [funnelColPages, setFunnelColPages] = useState<Record<string, number>>({});
  const logEndRef = useRef<HTMLDivElement>(null);

  // ── Replace image modal state ───────────────────────────────────────────────

  const [replaceImgLeadId, setReplaceImgLeadId] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [replacingLogo, setReplacingLogo] = useState(false);
  const [replacingHero, setReplacingHero] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  // ── Funnel lead detail (SMS outreach record) ──
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [detailLog, setDetailLog] = useState<ComplianceLog | null>(null);
  const [detailSuppressed, setDetailSuppressed] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMessages, setDetailMessages] = useState<SmsMessage[] | null>(null);
  const [detailMessagesLoading, setDetailMessagesLoading] = useState(false);
  const [unreadLeadIds, setUnreadLeadIds] = useState<Set<string>>(new Set());
  const [replyDraft, setReplyDraft] = useState("");
  const [replySending, setReplySending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const openLeadDetail = useCallback((lead: Lead) => {
    setDetailLead(lead);
    setDetailLog(null);
    setDetailSuppressed(false);
    setDetailLoading(true);
    setDetailMessages(null);
    setDetailMessagesLoading(true);
    setReplyDraft("");
    Promise.all([
      fetch(`/api/outreach/log?leadId=${lead.id}`).then((r) => r.json()),
      fetch(`/api/outreach/conversations/${lead.id}`).then((r) => r.json()),
    ])
      .then(([d, conv]) => {
        setDetailLog(d.log ?? null);
        setDetailSuppressed(Boolean(d.suppressed));
        setDetailMessages(conv.messages ?? []);
        fetch(`/api/outreach/conversations/${lead.id}`, { method: "PATCH" });
        setUnreadLeadIds((prev) => { const next = new Set(prev); next.delete(lead.id); return next; });
      })
      .catch(() => {})
      .finally(() => { setDetailLoading(false); setDetailMessagesLoading(false); });
  }, []);

  const sendReply = useCallback(async () => {
    if (!detailLead || !replyDraft.trim() || replySending) return;
    setReplySending(true);
    try {
      const res = await fetch(`/api/outreach/conversations/${detailLead.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyDraft.trim() }),
      }).then((r) => r.json());
      if (res.message) {
        setDetailMessages((prev) => [...(prev ?? []), res.message as SmsMessage]);
        setReplyDraft("");
      }
    } catch { /* ignore */ } finally {
      setReplySending(false);
    }
  }, [detailLead, replyDraft, replySending]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [gen?.log]);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLeads(data.map(dbRowToLead)); })
      .finally(() => setLoadingLeads(false));
  }, []);

  useEffect(() => {
    fetch("/api/outreach/conversations?unread=true")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.leadIds)) setUnreadLeadIds(new Set<string>(d.leadIds)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (detailMessages && detailMessages.length > 0) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [detailMessages]);

  // Parse a CSV and stage it for naming — the user names the batch before it
  // commits, so every loaded list is tracked separately in Analytics.
  const stageCSV = useCallback((text: string, filename: string) => {
    const rows = parseCSV(text);
    const parsed = rows.map(rowToLead).filter(Boolean) as Lead[];
    if (parsed.length === 0) return;
    setPendingImport({ leads: parsed, fileName: filename });
    setBatchNameInput(filename.replace(/\.csv$/i, "").trim());
  }, []);

  // Commit the staged import under the chosen batch name.
  const commitImport = useCallback(() => {
    if (!pendingImport) return;
    const batchName = batchNameInput.trim() || pendingImport.fileName.replace(/\.csv$/i, "").trim();
    const parsed = pendingImport.leads.map((l) => ({ ...l, batchName }));
    setLeads((prev) => {
      const existingByName = new Map(prev.map((l) => [l.companyName.toLowerCase(), l]));
      const merged: Lead[] = [...prev];
      for (const lead of parsed) {
        const match = existingByName.get(lead.companyName.toLowerCase());
        if (match) {
          // Preserve demo/funnel state and original batch; update contact fields only.
          const idx = merged.findIndex((l) => l.id === match.id);
          merged[idx] = {
            ...match,
            ceoName: lead.ceoName ?? match.ceoName,
            url: lead.url ?? match.url,
            phone: lead.phone ?? match.phone,
            email: lead.email ?? match.email,
            city: lead.city ?? match.city,
            industry: lead.industry ?? match.industry,
          };
        } else {
          merged.push(lead);
        }
      }
      return merged;
    });
    setCsvFileName(pendingImport.fileName);
    fetch("/api/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.map(leadToDbRow)),
    });
    setPendingImport(null);
    setBatchNameInput("");
  }, [pendingImport, batchNameInput]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => stageCSV(ev.target?.result as string, file.name);
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file?.name.endsWith(".csv")) return;
    const reader = new FileReader();
    reader.onload = (ev) => stageCSV(ev.target?.result as string, file.name);
    reader.readAsText(file, "utf-8");
  };

  const update = (id: string, patch: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchToDbRow(patch)),
    });
  };

  const replaceImage = async (lead: Lead, type: "logo" | "hero", file: File) => {
    const setReplacing = type === "logo" ? setReplacingLogo : setReplacingHero;
    setReplacing(true);
    const fd = new FormData();
    fd.append("type", type);
    fd.append("file", file);
    fd.append("slug", lead.demoSlug ?? slugify(lead.companyName));
    try {
      const res = await fetch(`/api/leads/${lead.id}/replace-image`, { method: "POST", body: fd });
      const json = await res.json();
      if (json.url) {
        setLeads((prev) => prev.map((l) =>
          l.id === lead.id
            ? { ...l, ...(type === "logo" ? { logoUrl: json.url } : { heroImageUrl: json.url }) }
            : l
        ));
        if (type === "logo") { setLogoFile(null); if (logoInputRef.current) logoInputRef.current.value = ""; }
        else { setHeroFile(null); if (heroInputRef.current) heroInputRef.current.value = ""; }
      }
    } finally {
      setReplacing(false);
    }
  };


  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortDir(field === "quality" ? "desc" : "asc"); }
    setCurrentPage(1);
  };

  // Compute sorted + paginated inbox
  const rawInbox = leads.filter((l) => !l.hasDemoBuilt);
  const inboxSearchLower = inboxSearch.toLowerCase();
  const filteredInbox = inboxSearch
    ? rawInbox.filter((l) =>
        l.companyName.toLowerCase().includes(inboxSearchLower) ||
        (l.ceoName ?? "").toLowerCase().includes(inboxSearchLower) ||
        (l.city ?? "").toLowerCase().includes(inboxSearchLower) ||
        (l.industry ?? "").toLowerCase().includes(inboxSearchLower)
      )
    : rawInbox;
  const sortedInbox = [...filteredInbox].sort((a, b) => {
    if (sortBy === "quality") {
      const as = scoreOf(a.siteQuality);
      const bs = scoreOf(b.siteQuality);
      // Keep unanalysed (and legacy) leads at the bottom regardless of direction.
      if (as === null && bs === null) return 0;
      if (as === null) return 1;
      if (bs === null) return -1;
      return sortDir === "asc" ? as - bs : bs - as;
    }
    let av = "", bv = "";
    if (sortBy === "name")     { av = a.companyName; bv = b.companyName; }
    if (sortBy === "city")     { av = a.city ?? ""; bv = b.city ?? ""; }
    if (sortBy === "industry") { av = a.industry ?? ""; bv = b.industry ?? ""; }
    return sortDir === "asc" ? av.localeCompare(bv, "fi") : bv.localeCompare(av, "fi");
  });
  const totalPages = pageSize === "all" ? 1 : Math.ceil(filteredInbox.length / (pageSize as number));
  const safePage = Math.min(currentPage, totalPages || 1);
  const pagedInbox = pageSize === "all"
    ? sortedInbox
    : sortedInbox.slice((safePage - 1) * (pageSize as number), safePage * (pageSize as number));

  const demoLeads = [...leads.filter((l) => l.hasDemoBuilt)].sort((a, b) =>
    demoSort === "alpha"
      ? a.companyName.localeCompare(b.companyName, "fi")
      : (b.demoBuiltAt ?? b.createdAt ?? "").localeCompare(a.demoBuiltAt ?? a.createdAt ?? "")
  );

  // Ordered list of unique batch names (insertion order from sorted leads, null → "Unbatched")
  const demoBatches: string[] = [];
  for (const l of demoLeads) {
    const b = l.batchName ?? "Unbatched";
    if (!demoBatches.includes(b)) demoBatches.push(b);
  }
  const showBatchFilter = demoBatches.length > 1;

  const batchFilteredDemoLeads = demoBatchFilter
    ? demoLeads.filter((l) =>
        demoBatchFilter === "Unbatched"
          ? !l.batchName
          : l.batchName === demoBatchFilter
      )
    : demoLeads;

  const demoSearchLower = demoSearch.toLowerCase();
  const filteredDemoLeads = demoSearch
    ? batchFilteredDemoLeads.filter((l) =>
        l.companyName.toLowerCase().includes(demoSearchLower) ||
        (l.city ?? "").toLowerCase().includes(demoSearchLower) ||
        (l.industry ?? "").toLowerCase().includes(demoSearchLower)
      )
    : batchFilteredDemoLeads;
  const demoTotalPages = demoPageSize === "all" ? 1 : Math.ceil(filteredDemoLeads.length / (demoPageSize as number));
  const demoSafePage = Math.min(demoPage, demoTotalPages || 1);
  const pagedDemoLeads = demoPageSize === "all"
    ? filteredDemoLeads
    : filteredDemoLeads.slice((demoSafePage - 1) * (demoPageSize as number), demoSafePage * (demoPageSize as number));

  const selectedCount = rawInbox.filter((l) => l.selected).length;
  const allVisibleSelected = pagedInbox.length > 0 && pagedInbox.every((l) => l.selected);
  // Selection is scoped to the leads currently in view (active batch + search),
  // so "select all" / the delete count never reach past the chosen batch.
  const demoSelectedCount = filteredDemoLeads.filter((l) => l.selected).length;
  const allDemosSelected = filteredDemoLeads.length > 0 && filteredDemoLeads.every((l) => l.selected);

  const toggleSelectAll = () => {
    const ids = new Set(pagedInbox.map((l) => l.id));
    setLeads((prev) =>
      prev.map((l) => (ids.has(l.id) ? { ...l, selected: !allVisibleSelected } : l))
    );
  };

  const generateDemos = () => {
    const queue = rawInbox.filter((l) => l.selected);
    if (!queue.length) return;

    // Clear any prior failure marks on the leads about to be (re)attempted.
    const queuedIds = new Set(queue.map((l) => l.id));
    setLeads((prev) =>
      prev.map((l) => (queuedIds.has(l.id) ? { ...l, genFailed: false, genFailReason: undefined } : l))
    );

    setGen({ queue, currentIdx: 0, status: "running", log: "", skipped: 0 });

    const appendLog = (text: string) =>
      setGen((prev) => (prev ? { ...prev, log: prev.log + text } : null));

    // A failed lead is kept in the inbox (has_demo_built stays false) and left
    // selected — never deleted. A transient failure (rate-limit, flaky scrape)
    // used to permanently remove the prospect; now clicking Generate again
    // re-runs exactly the ones that failed. Genuinely dead leads can be deleted
    // by hand from the inbox.
    const skipLead = (lead: Lead, reason: string) => {
      appendLog(`\n⚠️ Skipping ${lead.companyName} — ${reason} (kept in inbox for retry)\n`);
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, genFailed: true, genFailReason: reason } : l))
      );
      setGen((prev) => (prev ? { ...prev, skipped: prev.skipped + 1 } : null));
    };

    (async () => {
      for (let i = 0; i < queue.length; i++) {
        // Space leads out so a bulk run doesn't burst past the AI provider's
        // tokens-per-minute limit (each lead fires ~3 calls). The SDK retries
        // absorb the occasional 429; this keeps them occasional.
        if (i > 0) await new Promise((r) => setTimeout(r, GEN_PACING_MS));

        setGen((prev) => (prev ? { ...prev, currentIdx: i } : null));
        const lead = queue[i];
        const slug = slugify(lead.companyName);

        if (queue.length > 1)
          appendLog(`\n────── ${i + 1}/${queue.length}: ${lead.companyName} ──────\n\n`);

        try {
          const res = await fetch("/api/generate-demo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadId: lead.id,
              slug,
              url: lead.url ?? "",
              company: lead.companyName,
              ceo: lead.ceoName ?? "",
              phone: lead.phone ?? "",
              email: lead.email ?? "",
            }),
          });

          if (!res.body) {
            skipLead(lead, "no response stream from server");
            continue;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let success = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
              for (const line of part.trim().split("\n")) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const evt = JSON.parse(line.slice(6));
                  if (evt.type === "log") appendLog(evt.text);
                  else if (evt.type === "done") {
                    success = true;
                    setLeads((prev) =>
                      prev.map((l) =>
                        l.id === lead.id
                          ? { ...l, hasDemoBuilt: true, selected: false, genFailed: false, genFailReason: undefined, demoSlug: slug, demoUrl: evt.demoUrl }
                          : l
                      )
                    );
                  } else if (evt.type === "error") {
                    appendLog(`\n❌ ${evt.message}\n`);
                  }
                } catch { /* malformed SSE line — skip */ }
              }
            }
          }

          if (!success) {
            skipLead(lead, "generation failed");
            continue;
          }
        } catch (err) {
          skipLead(lead, err instanceof Error ? err.message : String(err));
          continue;
        }
      }

      setGen((prev) => (prev ? { ...prev, status: "done" } : null));
    })().catch((err) => {
      setGen((prev) =>
        prev ? { ...prev, status: "error", log: prev.log + `\n❌ ${err.message}\n` } : null
      );
    });
  };

  const deleteSelectedLeads = () => {
    const selected = rawInbox.filter((l) => l.selected);
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} lead${selected.length > 1 ? "s" : ""} permanently?`)) return;
    const ids = new Set(selected.map((l) => l.id));
    setLeads((prev) => prev.filter((l) => !ids.has(l.id)));
    selected.forEach((lead) =>
      fetch(`/api/leads/${lead.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteRow: true }),
      })
    );
  };

  const deleteDemo = (lead: Lead) => {
    if (!confirm(`Delete ${lead.companyName} permanently?`)) return;
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    fetch(`/api/leads/${lead.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteRow: true }),
    });
  };

  const deleteSelectedDemos = () => {
    const selected = filteredDemoLeads.filter((l) => l.selected);
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} demo${selected.length > 1 ? "s" : ""} permanently?`)) return;
    const ids = new Set(selected.map((l) => l.id));
    setLeads((prev) => prev.filter((l) => !ids.has(l.id)));
    selected.forEach((lead) =>
      fetch(`/api/leads/${lead.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteRow: true }),
      })
    );
  };

  // Reclaim demos a lead never opened within the expiry window (7 days after
  // contact). Previews first, then sweeps and reloads to show the expired state.
  const cleanupUnopenedDemos = async () => {
    setCleaningUp(true);
    try {
      const preview = await (await fetch("/api/outreach/cleanup")).json();
      if (!preview.count) {
        alert("No unopened demos to clean up — nothing contacted more than a week ago has gone unopened.");
        return;
      }
      const names = preview.demos.map((d: { company_name: string }) => `• ${d.company_name}`).join("\n");
      if (!confirm(
        `Reclaim ${preview.count} unopened demo${preview.count > 1 ? "s" : ""} ` +
        `(contacted >${preview.days} days ago, never opened)?\n\n${names}\n\n` +
        `Images + content are deleted and the page goes dead. The lead stays in the funnel, marked expired.`
      )) return;
      await fetch("/api/outreach/cleanup", { method: "POST" });
      const data = await (await fetch("/api/leads")).json();
      if (Array.isArray(data)) setLeads(data.map(dbRowToLead));
    } catch {
      alert("Cleanup failed — see the dev server logs.");
    } finally {
      setCleaningUp(false);
    }
  };

  // Mark selected leads as already having a built demo (same result, different intent)
  const markAlreadyBuilt = () => {
    setLeads((prev) => {
      const next = prev.map((l) =>
        !l.hasDemoBuilt && l.selected
          ? { ...l, hasDemoBuilt: true, selected: false, demoSlug: slugify(l.companyName) }
          : l
      );
      const changed = next.filter((l) => l.hasDemoBuilt && !prev.find((p) => p.id === l.id)?.hasDemoBuilt);
      if (changed.length)
        fetch("/api/leads/bulk-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changed.map(leadToDbRow)),
        });
      return next;
    });
  };

  const analyzeWebsites = () => {
    const hasSelection = rawInbox.some((l) => l.selected);
    const queue = hasSelection
      ? rawInbox.filter((l) => l.selected && l.url)
      : rawInbox.filter((l) => l.url && l.siteQuality === null);

    if (!queue.length) return;

    setAnalyzingIds(new Set(queue.map((l) => l.id)));

    const streamBatch = async (batch: typeof queue) => {
      const res = await fetch("/api/analyze-websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: batch.map((l) => ({ id: l.id, url: l.url, companyName: l.companyName })) }),
      });

      if (!res.body) {
        setAnalyzingIds((prev) => { const next = new Set(prev); batch.forEach((l) => next.delete(l.id)); return next; });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          for (const line of part.trim().split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "result") {
                update(evt.id, { siteQuality: String(evt.score), siteQualityReason: evt.reason, siteQualityFlags: evt.flags ?? [] });
                setAnalyzingIds((prev) => { const next = new Set(prev); next.delete(evt.id); return next; });
              } else if (evt.type === "error" || evt.type === "skip") {
                setAnalyzingIds((prev) => { const next = new Set(prev); next.delete(evt.id); return next; });
              }
            } catch { /* skip malformed SSE line */ }
          }
        }
      }
    };

    (async () => {
      const BATCH_SIZE = 8;
      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        await streamBatch(queue.slice(i, i + BATCH_SIZE));
      }
      setAnalyzingIds(new Set());
    })().catch(() => setAnalyzingIds(new Set()));
  };

  const submitAddForm = () => {
    if (!addForm.companyName.trim()) return;
    const newLead: Lead = {
      id: crypto.randomUUID(),
      companyName: addForm.companyName.trim(),
      ceoName: addForm.ceoName.trim() || undefined,
      url: addForm.url.trim() || undefined,
      phone: addForm.phone.trim() || undefined,
      email: addForm.email.trim() || undefined,
      city: addForm.city.trim() || undefined,
      industry: addForm.industry.trim() || undefined,
      siteQuality: null,
      selected: false,
      hasDemoBuilt: false,
    };
    setLeads((prev) => [newLead, ...prev]);
    fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leadToDbRow(newLead)),
    });
    setAddForm({ companyName: "", ceoName: "", url: "", phone: "", email: "", city: "", industry: "" });
    setShowAddForm(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50" style={{ fontFamily: "var(--font-body)" }}>

      {/* Top bar */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Buildings weight="bold" className="text-zinc-700 w-5 h-5" />
            <span className="font-bold text-zinc-900 text-sm tracking-tight">Demo Builder</span>
            <span className="text-zinc-200">|</span>
            <span className="text-xs text-zinc-400">Sales workflow</span>
          </div>
          <div className="flex items-center gap-4">
            <NextLink
              href="/dashboard/outreach"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-all"
            >
              <ArrowRight size={12} weight="bold" />
              Review SMS queue
            </NextLink>
            {/* ── Separator ── */}
            {leads.length > 0 && <span className="text-zinc-200">|</span>}

            {leads.length > 0 && (
              <>
                <span className="text-xs text-zinc-400">{leads.length} leads · {demoLeads.length} demos</span>
                <button
                  onClick={() => {
                    if (!confirm("Clear all leads and demos?")) return;
                    setLeads([]); setCsvFileName("");
                    fetch("/api/leads", { method: "DELETE" });
                  }}
                  className="text-xs text-zinc-400 hover:text-rose-500 transition-colors"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-8 space-y-8">

        {/* ── 1. CSV upload ─────────────────────────────────────── */}
        <section>
          <label className="block text-xs font-black uppercase tracking-widest text-zinc-400 mb-3">
            1 — Load leads
          </label>
          {pendingImport ? (
            <div className="rounded-2xl border-2 border-zinc-300 bg-white px-8 py-7">
              <div className="flex items-center gap-3 mb-4">
                <UploadSimple size={28} className="text-zinc-500 flex-shrink-0" />
                <div>
                  <p className="font-bold text-zinc-900">{pendingImport.fileName}</p>
                  <p className="text-sm text-zinc-500 mt-0.5">{pendingImport.leads.length} leads ready · name this batch to track its conversion</p>
                </div>
              </div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Batch name</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={batchNameInput}
                  onChange={(e) => setBatchNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitImport(); if (e.key === "Escape") { setPendingImport(null); setBatchNameInput(""); } }}
                  placeholder="e.g. Helmikuu — Tampere"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-300 text-sm font-medium text-zinc-900 focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                />
                <button
                  onClick={commitImport}
                  className="px-5 py-2.5 text-sm font-bold bg-zinc-900 text-white rounded-xl hover:bg-zinc-700 transition-all shadow-sm whitespace-nowrap"
                >
                  Load {pendingImport.leads.length} leads
                </button>
                <button
                  onClick={() => { setPendingImport(null); setBatchNameInput(""); }}
                  className="px-4 py-2.5 text-sm font-semibold text-zinc-500 rounded-xl hover:bg-zinc-100 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed px-8 py-10 flex items-center gap-5 cursor-pointer transition-all ${
              isDragging ? "border-zinc-400 bg-zinc-100"
              : csvFileName ? "border-emerald-300 bg-emerald-50/60 hover:border-emerald-400"
              : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50/80"
            }`}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
            {csvFileName ? (
              <>
                <CheckCircle weight="fill" size={32} className="text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="font-bold text-zinc-900">{csvFileName}</p>
                  <p className="text-sm text-zinc-500 mt-0.5">{leads.length} leads loaded · drop a new file to add another batch</p>
                </div>
              </>
            ) : (
              <>
                <UploadSimple size={32} className="text-zinc-400 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-zinc-700">Drop a CSV file here</p>
                  <p className="text-sm text-zinc-400 mt-0.5">or click to browse · comma and semicolon separators both work</p>
                </div>
              </>
            )}
          </div>
          )}
        </section>

        {/* ── 2 + 3. Lead inbox ─────────────────────────────────── */}
        <section>
            {/* Section header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-zinc-400">
                  2 — Lead inbox
                </label>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {inboxSearch ? `${filteredInbox.length} of ${rawInbox.length}` : rawInbox.length} leads
                  {pageSize !== "all" && totalPages > 1
                    ? ` · page ${safePage} of ${totalPages}`
                    : ""}
                  {rawInbox.length > 0 ? " · select ones to build demos for" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Search */}
                {rawInbox.length > 0 && (
                  <div className="relative flex items-center">
                    <MagnifyingGlass size={12} className="absolute left-2.5 text-zinc-400 pointer-events-none" />
                    <input
                      type="text"
                      value={inboxSearch}
                      onChange={(e) => { setInboxSearch(e.target.value); setCurrentPage(1); }}
                      placeholder="Search leads…"
                      className="pl-7 pr-7 py-1.5 text-xs border border-zinc-200 rounded-xl outline-none focus:border-zinc-400 bg-white transition-colors w-40 focus:w-52 placeholder-zinc-400"
                    />
                    {inboxSearch && (
                      <button onClick={() => { setInboxSearch(""); setCurrentPage(1); }} className="absolute right-2 text-zinc-300 hover:text-zinc-600 transition-colors">
                        <X size={11} weight="bold" />
                      </button>
                    )}
                  </div>
                )}
                {/* Page size toggle */}
                {rawInbox.length > 0 && (
                  <div className="flex items-center bg-zinc-100 rounded-xl p-0.5 gap-0.5">
                    {PAGE_SIZES.map((s) => (
                      <button
                        key={s}
                        onClick={() => { setPageSize(s); setCurrentPage(1); }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          pageSize === s
                            ? "bg-white text-zinc-900 shadow-sm"
                            : "text-zinc-400 hover:text-zinc-600"
                        }`}
                      >
                        {s === "all" ? "All" : s}
                      </button>
                    ))}
                  </div>
                )}
                {/* Top pagination */}
                {pageSize !== "all" && totalPages > 1 && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      ←
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                      .reduce<(number | "…")[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === "…" ? (
                          <span key={`top-ellipsis-${i}`} className="px-1 text-xs text-zinc-300">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setCurrentPage(p as number)}
                            className={`min-w-[28px] px-2 py-1.5 text-xs font-bold rounded-lg transition-all ${
                              safePage === p
                                ? "bg-zinc-900 text-white"
                                : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      →
                    </button>
                  </div>
                )}
                {(() => {
                  const isAnalyzing = analyzingIds.size > 0;
                  const hasSelection = rawInbox.some((l) => l.selected);
                  const pendingCount = hasSelection
                    ? rawInbox.filter((l) => l.selected && l.url).length
                    : rawInbox.filter((l) => l.url && l.siteQuality === null).length;
                  return (
                    <>
                      {hasSelection && (
                        <button
                          onClick={deleteSelectedLeads}
                          title="Delete selected leads permanently"
                          className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-white border border-zinc-200 text-rose-500 rounded-xl hover:bg-rose-50 hover:border-rose-200 transition-all shadow-sm"
                        >
                          <Trash size={13} weight="bold" />
                          Delete
                        </button>
                      )}
                      <button
                        onClick={analyzeWebsites}
                        disabled={isAnalyzing || pendingCount === 0}
                        title="Score each lead's redesign opportunity (0-100)"
                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-white border border-zinc-200 text-zinc-600 rounded-xl hover:bg-zinc-50 hover:border-zinc-300 transition-all disabled:opacity-60 shadow-sm"
                      >
                        {isAnalyzing ? <CircleNotch size={13} className="animate-spin" /> : <Globe size={13} />}
                        {isAnalyzing
                          ? `Analyzing… ${analyzingIds.size} left`
                          : `Analyze websites${pendingCount > 0 ? ` · ${pendingCount}` : ""}`}
                      </button>
                    </>
                  );
                })()}
                <button
                  onClick={() => {
                    setShowAddForm((v) => !v);
                    setTimeout(() => addFormRef.current?.focus(), 50);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border transition-all shadow-sm ${
                    showAddForm
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300"
                  }`}
                >
                  {showAddForm ? <X size={13} weight="bold" /> : <Plus size={13} weight="bold" />}
                  Add lead
                </button>
              </div>
            </div>

            {/* Inline add-lead form */}
            {showAddForm && (
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 mb-3">
                <p className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4">New lead</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">Company name *</label>
                      <input
                        ref={addFormRef}
                        value={addForm.companyName}
                        onChange={(e) => setAddForm((f) => ({ ...f, companyName: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") submitAddForm(); if (e.key === "Escape") setShowAddForm(false); }}
                        placeholder="Yritys Oy"
                        className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 outline-none focus:border-zinc-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">CEO / contact</label>
                      <input
                        value={addForm.ceoName}
                        onChange={(e) => setAddForm((f) => ({ ...f, ceoName: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") submitAddForm(); if (e.key === "Escape") setShowAddForm(false); }}
                        placeholder="Matti Meikäläinen"
                        className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 outline-none focus:border-zinc-400 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1">Website</label>
                    <input
                      value={addForm.url}
                      onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAddForm(); if (e.key === "Escape") setShowAddForm(false); }}
                      placeholder="https://business.example"
                      className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 outline-none focus:border-zinc-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1">Phone</label>
                    <input
                      value={addForm.phone}
                      onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAddForm(); if (e.key === "Escape") setShowAddForm(false); }}
                      placeholder="Phone number"
                      className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 outline-none focus:border-zinc-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1">Email</label>
                    <input
                      value={addForm.email}
                      onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAddForm(); if (e.key === "Escape") setShowAddForm(false); }}
                      placeholder="hello@business.example"
                      className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 outline-none focus:border-zinc-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1">City</label>
                    <input
                      value={addForm.city}
                      onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAddForm(); if (e.key === "Escape") setShowAddForm(false); }}
                      placeholder="Helsinki"
                      className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 outline-none focus:border-zinc-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1">Industry</label>
                    <input
                      value={addForm.industry}
                      onChange={(e) => setAddForm((f) => ({ ...f, industry: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAddForm(); if (e.key === "Escape") setShowAddForm(false); }}
                      placeholder="Rakentaminen"
                      className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 outline-none focus:border-zinc-400 transition-colors"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-zinc-100">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="text-xs font-bold text-zinc-400 hover:text-zinc-600 transition-colors px-3 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitAddForm}
                    disabled={!addForm.companyName.trim()}
                    className="flex items-center gap-2 px-5 py-2 text-xs font-black bg-zinc-900 text-white rounded-xl hover:bg-zinc-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus size={12} weight="bold" />
                    Add lead
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm">
              {/* Column headers with sort */}
              <div className="flex items-center gap-4 px-4 py-2.5 bg-zinc-50 border-b border-zinc-100 rounded-t-2xl">
                <button onClick={toggleSelectAll} className="text-zinc-400 hover:text-zinc-700 transition-colors flex-shrink-0">
                  {allVisibleSelected
                    ? <CheckSquare size={15} weight="fill" className="text-zinc-800" />
                    : <Square size={15} />}
                </button>
                <SortButton field="name"     label="Company"  sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortButton field="city"     label="City"     sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortButton field="industry" label="Industry" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <div className="ml-auto flex items-center gap-1.5">
                  <SortButton field="quality" label="Score" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                  <div className="relative group/signals">
                    <button className="text-zinc-300 hover:text-zinc-500 transition-colors p-0.5 rounded" onClick={(e) => e.stopPropagation()}>
                      <Info size={12} />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-80 bg-zinc-900 text-zinc-300 text-xs rounded-2xl p-4 shadow-2xl z-50 pointer-events-none opacity-0 group-hover/signals:opacity-100 transition-opacity">
                      <p className="font-bold text-white mb-3 text-[11px] uppercase tracking-wider">What the signals mean</p>
                      <dl className="space-y-2.5">
                        {[
                          ["No HTTPS", "Site runs on http:// — browsers flag it as 'Not Secure', hurts Google ranking and trust."],
                          ["Not mobile responsive", "Missing viewport meta tag — site looks broken on phones. Google penalises this heavily in search."],
                          ["Outdated WordPress", "Old CMS version, likely unmaintained. Dated design and a known security risk."],
                          ["Wix / Jimdo / Kotisivukone", "Built with a DIY site builder — easy to pitch against a professional redesign."],
                          ["No meta description", "No basic SEO done. Unlikely to have an agency on retainer."],
                          ["No schema.org", "Missing structured data — no active SEO work has been done on the site."],
                          ["Site unreachable", "Server timed out or blocked bots — usually signals a neglected or abandoned site."],
                        ].map(([term, def]) => (
                          <div key={term}>
                            <dt className="font-semibold text-zinc-100">{term}</dt>
                            <dd className="text-zinc-400 mt-0.5">{def}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              {pagedInbox.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => update(lead.id, { selected: !lead.selected })}
                  className={`flex items-center gap-4 px-4 py-3 border-b border-zinc-100 last:border-0 cursor-pointer transition-colors ${
                    lead.genFailed
                      ? "bg-rose-50/70 hover:bg-rose-50"
                      : lead.selected ? "bg-zinc-50" : "hover:bg-zinc-50/60"
                  }`}
                >
                  <span className="text-zinc-400 flex-shrink-0">
                    {lead.selected
                      ? <CheckSquare size={15} weight="fill" className="text-zinc-800" />
                      : <Square size={15} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-zinc-900">{lead.companyName}</span>
                      {lead.genFailed && (
                        <span
                          title={lead.genFailReason ? `Last run failed: ${lead.genFailReason}` : "Last run failed"}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 whitespace-nowrap"
                        >
                          Failed — retry
                        </span>
                      )}
                      {lead.ceoName && <span className="text-xs text-zinc-400">{lead.ceoName}</span>}
                    </div>
                    <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
                      {lead.url && (
                        <a
                          href={lead.url.startsWith("http") ? lead.url : `https://${lead.url}`}
                          target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1 transition-colors"
                        >
                          <Globe size={10} />
                          {lead.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                        </a>
                      )}
                      {lead.city && <span className="text-xs text-zinc-400">{lead.city}</span>}
                      {lead.industry && <span className="text-xs text-zinc-400">{lead.industry}</span>}
                    </div>
                  </div>
                  {analyzingIds.has(lead.id)
                    ? <CircleNotch size={14} className="animate-spin text-zinc-400 flex-shrink-0" />
                    : (lead.siteQuality && (
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        {lead.siteQualityFlags?.map((flag) => (
                          <span key={flag} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap ${
                            flag.startsWith("Vision") ? "bg-violet-100 text-violet-700" : "bg-zinc-100 text-zinc-500"
                          }`}>
                            {flag}
                          </span>
                        ))}
                        <SiteQualityBadge quality={lead.siteQuality} />
                      </div>
                    ))}
                </div>
              ))}

              {/* Bottom pagination */}
              {pageSize !== "all" && totalPages > 1 && (
                <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-100 flex items-center justify-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    ←
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | "…")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "…" ? (
                        <span key={`ellipsis-${i}`} className="px-1 text-xs text-zinc-300">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p as number)}
                          className={`min-w-[28px] px-2 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            safePage === p
                              ? "bg-zinc-900 text-white"
                              : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200"
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    →
                  </button>
                </div>
              )}
            </div>

            {/* Action bar */}
            {selectedCount > 0 && (
              <div className="mt-4 flex items-center justify-between bg-zinc-900 rounded-2xl px-6 py-4 gap-4">
                <p className="text-sm text-zinc-300 flex-shrink-0">
                  <span className="font-black text-white">{selectedCount}</span> lead{selectedCount > 1 ? "s" : ""} selected
                </p>
                <div className="flex items-center gap-3">
                  {/* Already built — move to demo section without running the pipeline */}
                  <button
                    onClick={markAlreadyBuilt}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-zinc-700 text-zinc-200 rounded-xl hover:bg-zinc-600 transition-all active:scale-95"
                  >
                    <ArrowCounterClockwise size={14} weight="bold" />
                    Already built
                  </button>
                  {/* Generate new demos */}
                  <button
                    onClick={generateDemos}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-black bg-white text-zinc-900 rounded-xl hover:bg-zinc-100 transition-all hover:-translate-y-0.5 active:scale-95 shadow-lg"
                  >
                    Generate demo site{selectedCount > 1 ? "s" : ""}
                    <ArrowRight size={15} weight="bold" />
                  </button>
                </div>
              </div>
            )}
        </section>

        {/* ── 4. Demo sites built ───────────────────────────────── */}
        {demoLeads.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={allDemosSelected}
                  onChange={(e) => {
                    const ids = new Set(filteredDemoLeads.map((l) => l.id));
                    setLeads((prev) =>
                      prev.map((l) => ids.has(l.id) ? { ...l, selected: e.target.checked } : l)
                    );
                  }}
                  className="w-4 h-4 rounded accent-zinc-900 cursor-pointer"
                />
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-zinc-400">
                    3 — Demo sites · {demoSearch
                      ? `${filteredDemoLeads.length} of ${batchFilteredDemoLeads.length}`
                      : demoBatchFilter
                        ? `${batchFilteredDemoLeads.length} of ${demoLeads.length}`
                        : demoLeads.length} built
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Demo search */}
                <div className="relative flex items-center">
                  <MagnifyingGlass size={12} className="absolute left-2.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    value={demoSearch}
                    onChange={(e) => { setDemoSearch(e.target.value); setDemoPage(1); }}
                    placeholder="Search demos…"
                    className="pl-7 pr-7 py-1.5 text-xs border border-zinc-200 rounded-xl outline-none focus:border-zinc-400 bg-white transition-colors w-40 focus:w-52 placeholder-zinc-400"
                  />
                  {demoSearch && (
                    <button onClick={() => { setDemoSearch(""); setDemoPage(1); }} className="absolute right-2 text-zinc-300 hover:text-zinc-600 transition-colors">
                      <X size={11} weight="bold" />
                    </button>
                  )}
                </div>
                {demoSelectedCount > 0 && (
                  <button
                    onClick={deleteSelectedDemos}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-white border border-zinc-200 text-rose-500 rounded-xl hover:bg-rose-50 hover:border-rose-200 transition-all shadow-sm"
                  >
                    <Trash size={13} weight="bold" />
                    Delete · {demoSelectedCount}
                  </button>
                )}
                <button
                  onClick={cleanupUnopenedDemos}
                  disabled={cleaningUp}
                  title="Reclaim demos unopened 7+ days after contact"
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-white border border-zinc-200 text-zinc-500 rounded-xl hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-all shadow-sm disabled:opacity-50"
                >
                  {cleaningUp ? <CircleNotch size={13} className="animate-spin" /> : <ArrowCounterClockwise size={13} weight="bold" />}
                  Clean up unopened
                </button>
                {/* Demo page size toggle */}
                <div className="flex items-center bg-zinc-100 rounded-xl p-0.5 gap-0.5">
                  {PAGE_SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setDemoPageSize(s); setDemoPage(1); }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        demoPageSize === s
                          ? "bg-white text-zinc-900 shadow-sm"
                          : "text-zinc-400 hover:text-zinc-600"
                      }`}
                    >
                      {s === "all" ? "All" : s}
                    </button>
                  ))}
                </div>
                {/* Demo top pagination */}
                {demoPageSize !== "all" && demoTotalPages > 1 && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setDemoPage((p) => Math.max(1, p - 1))}
                      disabled={demoSafePage === 1}
                      className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      ←
                    </button>
                    {Array.from({ length: demoTotalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === demoTotalPages || Math.abs(p - demoSafePage) <= 1)
                      .reduce<(number | "…")[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === "…" ? (
                          <span key={`demo-ellipsis-${i}`} className="px-1 text-xs text-zinc-300">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setDemoPage(p as number)}
                            className={`min-w-[28px] px-2 py-1.5 text-xs font-bold rounded-lg transition-all ${
                              demoSafePage === p
                                ? "bg-zinc-900 text-white"
                                : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    <button
                      onClick={() => setDemoPage((p) => Math.min(demoTotalPages, p + 1))}
                      disabled={demoSafePage === demoTotalPages}
                      className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      →
                    </button>
                  </div>
                )}
                <div className="flex rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                  {(["latest", "alpha"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setDemoSort(opt); setDemoPage(1); }}
                      className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                        demoSort === opt
                          ? "bg-zinc-900 text-white"
                          : "bg-white text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {opt === "latest" ? "Latest" : "A–Z"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Batch filter pills — only shown when there are multiple batches */}
            {showBatchFilter && (
              <div className="flex flex-wrap items-center gap-1.5 py-1">
                <button
                  onClick={() => { setDemoBatchFilter(null); setDemoPage(1); }}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
                    demoBatchFilter === null
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700"
                  }`}
                >
                  All ({demoLeads.length})
                </button>
                {demoBatches.map((b) => {
                  const count = demoLeads.filter((l) =>
                    b === "Unbatched" ? !l.batchName : l.batchName === b
                  ).length;
                  return (
                    <button
                      key={b}
                      onClick={() => { setDemoBatchFilter(b); setDemoPage(1); }}
                      className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
                        demoBatchFilter === b
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700"
                      }`}
                    >
                      {b} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              {pagedDemoLeads.map((lead) => {
                const stage = FUNNEL_STAGES.find((s) => s.id === lead.funnelStage);
                return (
                  <div
                    key={lead.id}
                    className={`bg-white rounded-2xl border px-5 py-3.5 flex items-center gap-4 shadow-sm transition-colors ${
                      lead.selected ? "border-zinc-400 bg-zinc-50" : "border-zinc-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={lead.selected ?? false}
                      onChange={(e) =>
                        setLeads((prev) =>
                          prev.map((l) => l.id === lead.id ? { ...l, selected: e.target.checked } : l)
                        )
                      }
                      className="w-4 h-4 rounded accent-zinc-900 cursor-pointer flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-zinc-900">{lead.companyName}</span>
                        <SiteQualityBadge quality={lead.siteQuality} />
                        {lead.demoDeletedAt ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-400 border border-zinc-200">
                            <ArrowCounterClockwise size={9} weight="bold" /> Expired
                          </span>
                        ) : lead.demoOpenedAt ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                            <CheckCircle size={9} weight="fill" /> Opened{lead.demoOpenCount ? ` ·${lead.demoOpenCount}` : ""}
                          </span>
                        ) : lead.contactedAt ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-50 text-zinc-400 border border-zinc-200">
                            Not opened
                          </span>
                        ) : null}
                      </div>
                      {lead.demoDeletedAt ? (
                        <span className="text-xs text-zinc-300 line-through">{lead.demoUrl ?? `${DEMO_BASE}/${lead.demoSlug}`}</span>
                      ) : (
                        <EditableSlug
                          slug={lead.demoSlug ?? slugify(lead.companyName)}
                          demoUrl={lead.demoUrl}
                          onChange={(v) => update(lead.id, { demoSlug: v })}
                        />
                      )}
                    </div>
                    <div className="relative">
                      <select
                        value={lead.funnelStage ?? ""}
                        onChange={(e) => update(lead.id, { funnelStage: (e.target.value as FunnelStage) || undefined })}
                        className={`appearance-none text-xs font-bold pl-3 pr-7 py-2 rounded-xl border outline-none cursor-pointer transition-all ${
                          stage ? stage.pill : "bg-zinc-50 text-zinc-400 border-zinc-200 hover:border-zinc-300"
                        }`}
                      >
                        <option value="">Add to funnel…</option>
                        {FUNNEL_STAGES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                      <CaretDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-60" />
                    </div>
                    <button
                      onClick={() => {
                        setReplaceImgLeadId(lead.id);
                        setLogoFile(null);
                        setHeroFile(null);
                      }}
                      title="Replace logo / hero image"
                      className="p-2 text-zinc-300 hover:text-violet-500 hover:bg-violet-50 rounded-xl transition-all flex-shrink-0"
                    >
                      <ImageIcon size={14} weight="bold" />
                    </button>
                    <button
                      onClick={() => deleteDemo(lead)}
                      title="Delete demo"
                      className="p-2 text-zinc-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all flex-shrink-0"
                    >
                      <Trash size={14} weight="bold" />
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Demo bottom pagination */}
            {demoPageSize !== "all" && demoTotalPages > 1 && (
              <div className="flex items-center justify-center gap-0.5 mt-4">
                <button
                  onClick={() => setDemoPage((p) => Math.max(1, p - 1))}
                  disabled={demoSafePage === 1}
                  className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  ←
                </button>
                {Array.from({ length: demoTotalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === demoTotalPages || Math.abs(p - demoSafePage) <= 1)
                  .reduce<(number | "…")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`demo-bot-ellipsis-${i}`} className="px-1 text-xs text-zinc-300">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setDemoPage(p as number)}
                        className={`min-w-[28px] px-2 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          demoSafePage === p
                            ? "bg-zinc-900 text-white"
                            : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setDemoPage((p) => Math.min(demoTotalPages, p + 1))}
                  disabled={demoSafePage === demoTotalPages}
                  className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  →
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── 5. Sales funnel ───────────────────────────────────── */}
        {demoLeads.some((l) => l.funnelStage) && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-black uppercase tracking-widest text-zinc-400">
                4 — Sales funnel
              </label>
              <div className="relative flex items-center">
                <MagnifyingGlass size={12} className="absolute left-2.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={funnelSearch}
                  onChange={(e) => { setFunnelSearch(e.target.value); setFunnelColPages({}); }}
                  placeholder="Search funnel…"
                  className="pl-7 pr-7 py-1.5 text-xs border border-zinc-200 rounded-xl outline-none focus:border-zinc-400 bg-white transition-colors w-40 focus:w-52 placeholder-zinc-400"
                />
                {funnelSearch && (
                  <button onClick={() => { setFunnelSearch(""); setFunnelColPages({}); }} className="absolute right-2 text-zinc-300 hover:text-zinc-600 transition-colors">
                    <X size={11} weight="bold" />
                  </button>
                )}
              </div>
            </div>

            {/* Helper to render a funnel column */}
            {(() => {
              const FUNNEL_PAGE_SIZE = 10;
              const renderCol = (stage: typeof FUNNEL_STAGES[0]) => {
                const allStageLeads = demoLeads.filter((l) => l.funnelStage === stage.id);
                const funnelSearchLower = funnelSearch.toLowerCase();
                const stageLeads = (funnelSearch
                  ? allStageLeads.filter((l) => l.companyName.toLowerCase().includes(funnelSearchLower))
                  : allStageLeads
                ).sort((a, b) => {
                  if (a.demoOpenedAt && !b.demoOpenedAt) return -1;
                  if (!a.demoOpenedAt && b.demoOpenedAt) return 1;
                  return 0;
                });
                const colPage = funnelColPages[stage.id] ?? 1;
                const totalColPages = Math.ceil(stageLeads.length / FUNNEL_PAGE_SIZE);
                const safColPage = Math.min(colPage, totalColPages || 1);
                const pagedLeads = stageLeads.slice((safColPage - 1) * FUNNEL_PAGE_SIZE, safColPage * FUNNEL_PAGE_SIZE);
                const isOver = dragOverStage === stage.id;
                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node))
                        setDragOverStage(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedLeadId) update(draggedLeadId, { funnelStage: stage.id });
                      setDraggedLeadId(null);
                      setDragOverStage(null);
                    }}
                    className={`rounded-2xl border p-4 transition-all ${stage.col} ${
                      isOver ? "ring-2 ring-zinc-400 ring-offset-1 scale-[1.02]" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black uppercase tracking-wide text-zinc-500">{stage.label}</span>
                      <span className="text-xs font-bold text-zinc-400 bg-white/80 border border-zinc-200 rounded-full w-5 h-5 flex items-center justify-center">
                        {funnelSearch ? stageLeads.length : allStageLeads.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {pagedLeads.map((lead) => (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggedLeadId(lead.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => { setDraggedLeadId(null); setDragOverStage(null); }}
                          onClick={() => openLeadDetail(lead)}
                          title="View outreach details"
                          className={`px-3 py-2.5 rounded-xl text-xs font-semibold border shadow-sm cursor-pointer active:cursor-grabbing select-none transition-all flex items-center gap-2 ${
                            unreadLeadIds.has(lead.id)
                              ? "bg-amber-50 border-amber-300 text-amber-900"
                              : `bg-white ${stage.pill}`
                          } ${draggedLeadId === lead.id ? "opacity-40" : "hover:shadow-md"}`}
                        >
                          {lead.demoOpenedAt ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="Demo opened" />
                          ) : lead.contactedAt ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 flex-shrink-0" title="Not opened" />
                          ) : null}
                          <span className="truncate flex-1">{lead.companyName}</span>
                          {lead.smsStatus === "sent" && (
                            <ChatText
                              size={12}
                              weight="fill"
                              className={`flex-shrink-0 ${unreadLeadIds.has(lead.id) ? "text-amber-500" : "opacity-50"}`}
                            />
                          )}
                        </div>
                      ))}
                      {stageLeads.length === 0 && (
                        <div className={`text-center py-6 text-xs rounded-xl transition-all ${
                          isOver ? "bg-white/60 text-zinc-400" : "text-zinc-300"
                        }`}>
                          {isOver ? "Drop here" : funnelSearch ? "No match" : "—"}
                        </div>
                      )}
                    </div>
                    {totalColPages > 1 && (
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/5">
                        <button
                          onClick={() => setFunnelColPages((prev) => ({ ...prev, [stage.id]: Math.max(1, safColPage - 1) }))}
                          disabled={safColPage === 1}
                          className="px-2 py-1 text-[10px] font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-white/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >←</button>
                        <span className="text-[10px] text-zinc-400">{safColPage} / {totalColPages}</span>
                        <button
                          onClick={() => setFunnelColPages((prev) => ({ ...prev, [stage.id]: Math.min(totalColPages, safColPage + 1) }))}
                          disabled={safColPage === totalColPages}
                          className="px-2 py-1 text-[10px] font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-white/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >→</button>
                      </div>
                    )}
                  </div>
                );
              };

              const mainStages = FUNNEL_STAGES.filter((s) => !s.lost);
              const lostStages = FUNNEL_STAGES.filter((s) => s.lost);

              return (
                <>
                  {/* Main pipeline */}
                  <div className="grid grid-cols-4 gap-3">
                    {mainStages.map(renderCol)}
                  </div>

                  {/* Lost / dead-end outcomes */}
                  <div className="mt-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-300 mb-2 px-1">Lost</p>
                    <div className="grid grid-cols-3 gap-3">
                      {lostStages.map(renderCol)}
                    </div>
                  </div>
                </>
              );
            })()}
          </section>
        )}

        {/* ── 6. Analytics — per-batch conversion ──────────────── */}
        {demoLeads.length > 0 && (() => {
          // Conversion metrics for an arbitrary set of leads.
          const metricsOf = (ls: Lead[]) => ({
            total: ls.length,
            contacted: ls.filter((l) => l.smsStatus === "sent").length,
            opened: ls.filter((l) => l.demoOpenedAt).length,
            booked: ls.filter((l) => ["meeting-accepted", "meeting-held", "deal-closed"].includes(l.funnelStage ?? "")).length,
            met: ls.filter((l) => ["meeting-held", "deal-closed"].includes(l.funnelStage ?? "")).length,
            won: ls.filter((l) => l.funnelStage === "deal-closed").length,
          });

          // Group all leads by batch, preserving first-seen (chronological) order.
          const order: string[] = [];
          const byBatch = new Map<string, Lead[]>();
          for (const l of leads) {
            const key = l.batchName?.trim() || "Unbatched";
            if (!byBatch.has(key)) { byBatch.set(key, []); order.push(key); }
            byBatch.get(key)!.push(l);
          }
          const rows = order.map((name) => ({ name, m: metricsOf(byBatch.get(name)!) }));
          const totals = metricsOf(leads);

          // Funnel columns in order. "Leads" is the whole batch (the base); every
          // later column also shows % of the previous step and % of the whole batch.
          const cols: { key: keyof ReturnType<typeof metricsOf>; label: string }[] = [
            { key: "total", label: "Leads" },
            { key: "contacted", label: "Contacted" },
            { key: "opened", label: "Opened" },
            { key: "booked", label: "Booked" },
            { key: "met", label: "Met" },
            { key: "won", label: "Won" },
          ];

          const fmtPct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : "—";

          // One cell: count, then "% of previous step · % of whole batch".
          const renderCell = (m: ReturnType<typeof metricsOf>, idx: number, bold: boolean) => {
            const val = m[cols[idx].key];
            return (
              <td key={cols[idx].key} className="py-2.5 px-3 text-right align-top">
                <div className={`tabular-nums leading-tight ${bold ? "font-bold text-zinc-900" : "text-zinc-700"}`}>{val}</div>
                {idx === 0 ? (
                  <div className="text-[10px] tabular-nums text-zinc-300 leading-tight">100%</div>
                ) : (
                  <div className="text-[10px] tabular-nums text-zinc-400 leading-tight">
                    <span title="% of previous step">{fmtPct(val, m[cols[idx - 1].key])}</span>
                    <span className="text-zinc-300"> · </span>
                    <span className="text-zinc-300" title="% of whole batch">{fmtPct(val, m.total)}</span>
                  </div>
                )}
              </td>
            );
          };

          return (
            <section>
              <label className="block text-xs font-black uppercase tracking-widest text-zinc-400 mb-3">
                5 — Analytics
              </label>
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      <th className="text-left font-bold pb-2 pr-4">Batch</th>
                      {cols.map((c) => (
                        <th key={c.key} className="text-right font-bold pb-2 px-3 whitespace-nowrap">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.name} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
                        <td className="py-2.5 pr-4 font-semibold text-zinc-800 max-w-[220px] truncate align-top" title={r.name}>{r.name}</td>
                        {cols.map((_, idx) => renderCell(r.m, idx, false))}
                      </tr>
                    ))}
                  </tbody>
                  {rows.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-zinc-300">
                        <td className="py-2.5 pr-4 font-bold text-zinc-900 align-top">All batches</td>
                        {cols.map((_, idx) => renderCell(totals, idx, true))}
                      </tr>
                    </tfoot>
                  )}
                </table>
                <p className="text-[11px] text-zinc-300 mt-4">
                  Each cell: count · % of previous step · % of whole batch. Booked includes meetings held &amp; closed; Met includes closed.
                </p>
              </div>
            </section>
          );
        })()}

        {/* Loading state */}
        {loadingLeads && (
          <div className="text-center py-16 text-zinc-300">
            <CircleNotch size={32} weight="thin" className="mx-auto mb-3 animate-spin" />
            <p className="text-sm">Loading leads…</p>
          </div>
        )}

        {/* Empty state */}
        {!loadingLeads && leads.length === 0 && !showAddForm && (
          <div className="text-center py-16 text-zinc-300">
            <Funnel size={40} weight="thin" className="mx-auto mb-3" />
            <p className="text-sm mb-4">Upload a CSV to start</p>
            <button
              onClick={() => { setShowAddForm(true); setTimeout(() => addFormRef.current?.focus(), 50); }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-white border border-zinc-200 text-zinc-500 rounded-xl hover:bg-zinc-50 hover:text-zinc-700 transition-all shadow-sm"
            >
              <Plus size={12} weight="bold" />
              Or add a lead manually
            </button>
          </div>
        )}

      </main>

      {/* ── Funnel lead detail + SMS thread (split panel) ──────── */}
      {detailLead && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop — click to close */}
          <div
            className="flex-1 bg-black/30 backdrop-blur-[2px] cursor-pointer"
            onClick={() => setDetailLead(null)}
          />

          {/* Split panel */}
          <div className="flex h-full w-[860px] max-w-[92vw] shadow-2xl border-l border-zinc-200">

            {/* LEFT: lead details */}
            <div className="w-[360px] flex-shrink-0 h-full bg-white border-r border-zinc-100 flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="text-sm font-bold text-zinc-900">{detailLead.companyName}</p>
                  <p className="text-xs text-zinc-400">{detailLead.ceoName ?? "—"}</p>
                </div>
                <button onClick={() => setDetailLead(null)} className="text-zinc-300 hover:text-zinc-600 transition-colors p-1 -mr-1">
                  <X size={16} weight="bold" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Demo open status */}
                {detailLead.demoDeletedAt ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-50 text-zinc-500 border border-zinc-200">
                    <ArrowCounterClockwise size={14} weight="bold" />
                    Demo never opened — expired & cleaned up{" "}
                    {new Date(detailLead.demoDeletedAt).toLocaleDateString("fi-FI", { dateStyle: "medium" })}.
                  </div>
                ) : detailLead.demoOpenedAt ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle size={14} weight="fill" />
                    Demo opened{detailLead.demoOpenCount ? ` ${detailLead.demoOpenCount}×` : ""} · first{" "}
                    {new Date(detailLead.demoOpenedAt).toLocaleString("fi-FI", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                ) : detailLead.contactedAt ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <WarningCircle size={14} weight="fill" />
                    Demo not opened yet
                  </div>
                ) : null}

                {detailLoading && (
                  <div className="flex items-center justify-center gap-2 py-8 text-zinc-400 text-sm">
                    <CircleNotch size={16} className="animate-spin" />
                    Loading…
                  </div>
                )}

                {!detailLoading && !detailLog && (
                  <div className="text-center py-8 text-zinc-400 text-sm">
                    <ChatText size={24} weight="duotone" className="mx-auto mb-2 text-zinc-300" />
                    No SMS record for this lead yet.
                  </div>
                )}

                {!detailLoading && detailLog && (() => {
                  const sentAt = detailLead.contactedAt ?? detailLog.created_at;
                  const when = sentAt
                    ? new Date(sentAt).toLocaleString("fi-FI", { dateStyle: "medium", timeStyle: "short" })
                    : "—";
                  const isDryRun = detailLog.send_mode === "dry-run";
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${isDryRun ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                          <PaperPlaneTilt size={11} weight="fill" />
                          {isDryRun ? "Dry-run — not actually sent" : "Sent via Twilio"}
                        </span>
                        {detailSuppressed && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                            <WarningCircle size={11} weight="fill" />
                            Opted out (STOP)
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="flex items-center gap-2 text-zinc-500">
                          <Clock size={14} className="text-zinc-400" />
                          {when}
                        </div>
                        <div className="flex items-center gap-2 text-zinc-500">
                          <Phone size={14} className="text-zinc-400" />
                          {detailLog.phone ?? "—"}
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {detailLog.demo_url && (
                          <a href={`${detailLog.demo_url}${STAFF_PREVIEW_HASH}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-zinc-500 hover:text-zinc-800 transition-colors">
                            <Globe size={14} className="text-zinc-400" />
                            <span className="underline underline-offset-2 truncate">{detailLog.demo_url}</span>
                          </a>
                        )}
                        {detailLog.data_source_url && (
                          <div className="flex items-center gap-2 text-zinc-400">
                            <Info size={14} />
                            <span>Data source: </span>
                            <a href={detailLog.data_source_url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-zinc-600 truncate">
                              {detailLog.data_source_url}
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-zinc-100 space-y-1.5 text-[11px] text-zinc-400">
                        <p>
                          Role/size: <span className="text-zinc-600 font-medium">{detailLog.title ?? "—"}{detailLog.company_size != null ? ` · ${detailLog.company_size} hlö` : ""}</span>
                          {"  ·  "}Reviewer: <span className="text-zinc-600 font-medium">{detailLog.reviewer_id ?? "—"}</span>
                        </p>
                        {detailLog.twilio_sid && <p>Twilio ref: <span className="text-zinc-500 font-mono">{detailLog.twilio_sid}</span></p>}
                        {detailLog.legal_basis && (
                          <p className="flex items-start gap-1.5 pt-1">
                            <ShieldCheck size={13} className="text-zinc-400 flex-shrink-0 mt-px" />
                            <span>{detailLog.legal_basis}</span>
                          </p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* RIGHT: SMS thread */}
            <div className="flex-1 h-full bg-zinc-50 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 bg-white flex-shrink-0">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">SMS Thread</p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {detailMessagesLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-zinc-400 text-sm">
                    <CircleNotch size={16} className="animate-spin" /> Loading…
                  </div>
                ) : !detailMessages || detailMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-sm gap-2 py-12">
                    <ChatText size={28} weight="duotone" className="text-zinc-200" />
                    No messages yet.
                  </div>
                ) : (
                  detailMessages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        msg.direction === "outbound"
                          ? "bg-zinc-900 text-white rounded-br-sm"
                          : "bg-white border border-zinc-200 text-zinc-800 rounded-bl-sm shadow-sm"
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                        <p className={`text-[10px] mt-1.5 ${msg.direction === "outbound" ? "text-zinc-500" : "text-zinc-400"}`}>
                          {new Date(msg.created_at).toLocaleString("fi-FI", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Reply input */}
              <div className="flex-shrink-0 border-t border-zinc-200 p-3 bg-white">
                {detailLead.smsStatus !== "sent" ? (
                  <p className="text-center text-xs text-zinc-400 py-1.5">
                    No SMS sent yet — approve from the outreach queue first.
                  </p>
                ) : (
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                      placeholder="Reply… (Enter to send)"
                      rows={2}
                      className="flex-1 resize-none rounded-xl border border-zinc-200 px-3 py-2 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                    />
                    <button
                      onClick={sendReply}
                      disabled={!replyDraft.trim() || replySending}
                      className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0 flex items-center justify-center"
                    >
                      {replySending ? <CircleNotch size={14} className="animate-spin" /> : <PaperPlaneTilt size={14} />}
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Generation modal ──────────────────────────────────── */}
      {gen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-zinc-950 rounded-3xl w-full max-w-3xl flex flex-col border border-zinc-800 shadow-2xl" style={{ height: "72vh" }}>

            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-sm font-bold text-white">
                  {gen.status === "running"
                    ? gen.queue.length > 1
                      ? `Building ${gen.currentIdx + 1} of ${gen.queue.length}: ${gen.queue[gen.currentIdx]?.companyName}`
                      : `Building: ${gen.queue[0]?.companyName}`
                    : gen.status === "done"
                    ? `Done — ${gen.queue.length} demo${gen.queue.length > 1 ? "s" : ""} built`
                    : "Generation stopped"}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {gen.status === "running" ? "Agent is running — this takes a few minutes" : gen.status === "done" ? "Check the demo sites section above" : "See the log for details"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {gen.status === "running" && (
                  <CircleNotch size={16} className="text-zinc-400 animate-spin" />
                )}
                <button
                  onClick={() => setGen(null)}
                  disabled={gen.status === "running"}
                  title={gen.status === "running" ? "Wait for the agent to finish" : "Close"}
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <X size={15} weight="bold" />
                </button>
              </div>
            </div>

            {/* Terminal log */}
            <div className="flex-1 overflow-y-auto p-5 font-mono text-xs leading-relaxed text-zinc-400 whitespace-pre-wrap break-words">
              {gen.log || <span className="text-zinc-600">Starting agent…</span>}
              <div ref={logEndRef} />
            </div>

            {/* Footer — only shown when finished */}
            {(gen.status === "done" || gen.status === "error") && (
              <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
                <span className={`text-xs font-bold ${gen.status === "done" ? "text-emerald-400" : "text-rose-400"}`}>
                  {gen.status === "done"
                    ? gen.skipped > 0
                      ? `✓ Done — ${gen.queue.length - gen.skipped} built, ${gen.skipped} kept in inbox to retry`
                      : "✓ All demos generated successfully"
                    : "✗ Generation encountered an error"}
                </span>
                <button
                  onClick={() => setGen(null)}
                  className="px-4 py-2 text-sm font-bold bg-white text-zinc-900 rounded-xl hover:bg-zinc-100 transition-all active:scale-95"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Replace image modal ───────────────────────────────── */}
      {replaceImgLeadId && (() => {
        const lead = leads.find((l) => l.id === replaceImgLeadId);
        if (!lead) return null;
        return (
          <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setReplaceImgLeadId(null); }}
          >
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-zinc-200">
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-zinc-900">Replace images</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{lead.companyName}</p>
                </div>
                <button
                  onClick={() => setReplaceImgLeadId(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
                >
                  <X size={15} weight="bold" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-6">
                {/* Logo */}
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-3">Logo</p>
                  <div className="flex items-center gap-3 mb-3">
                    {lead.logoUrl ? (
                      <NextImage
                        width={96}
                        height={48}
                        unoptimized
                        src={lead.logoUrl}
                        alt="Current logo"
                        className="h-12 w-24 object-contain rounded-lg border border-zinc-100 bg-zinc-50 p-1 flex-shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-24 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 flex items-center justify-center flex-shrink-0">
                        <ImageIcon size={16} className="text-zinc-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-xs text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-zinc-100 file:text-zinc-600 hover:file:bg-zinc-200 file:cursor-pointer cursor-pointer"
                      />
                      {logoFile && <p className="text-xs text-zinc-400 mt-1 truncate">{logoFile.name}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => logoFile && replaceImage(lead, "logo", logoFile)}
                    disabled={!logoFile || replacingLogo}
                    className="w-full py-2 text-xs font-bold rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {replacingLogo ? <CircleNotch size={12} className="animate-spin" /> : <Check size={12} weight="bold" />}
                    {replacingLogo ? "Saving…" : "Save logo"}
                  </button>
                </div>

                <div className="border-t border-zinc-100" />

                {/* Hero */}
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-3">Hero image</p>
                  <div className="flex items-center gap-3 mb-3">
                    {lead.heroImageUrl ? (
                      <NextImage
                        width={96}
                        height={48}
                        unoptimized
                        src={lead.heroImageUrl}
                        alt="Current hero"
                        className="h-12 w-24 object-cover rounded-lg border border-zinc-100 flex-shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-24 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 flex items-center justify-center flex-shrink-0">
                        <ImageIcon size={16} className="text-zinc-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <input
                        ref={heroInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => setHeroFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-xs text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-zinc-100 file:text-zinc-600 hover:file:bg-zinc-200 file:cursor-pointer cursor-pointer"
                      />
                      {heroFile && <p className="text-xs text-zinc-400 mt-1 truncate">{heroFile.name}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => heroFile && replaceImage(lead, "hero", heroFile)}
                    disabled={!heroFile || replacingHero}
                    className="w-full py-2 text-xs font-bold rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {replacingHero ? <CircleNotch size={12} className="animate-spin" /> : <Check size={12} weight="bold" />}
                    {replacingHero ? "Saving…" : "Save hero image"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
