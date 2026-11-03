"use client";

import NextLink from "next/link";

import React, { useState, useEffect, useCallback } from "react";
import {
  Buildings,
  ArrowLeft,
  CircleNotch,
  CheckCircle,
  X,
  Globe,
  ArrowSquareOut,
  PaperPlaneTilt,
  WarningCircle,
  ChatText,
} from "@phosphor-icons/react";
import { STAFF_PREVIEW_HASH } from "@/components/track-open";

interface QueueLead {
  id: string;
  company_name: string;
  ceo_name: string | null;
  title: string | null;
  company_size: number | null;
  url: string | null;
  phone: string | null;
  normalizedPhone: string;
  demo_url: string | null;
  draft: string;
}

type SendMode = "live" | "dry-run";

// Per-card editable state, keyed by lead id.
interface CardEdits {
  message: string;
  title: string;
  companySize: string;
}

export default function OutreachQueue() {
  const [leads, setLeads] = useState<QueueLead[]>([]);
  const [edits, setEdits] = useState<Record<string, CardEdits>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendMode, setSendMode] = useState<SendMode>("dry-run");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [currentPage, setCurrentPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/outreach/queue");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load queue");
      setLeads(json.leads);
      setSendMode(json.sendMode);
      setEdits(
        Object.fromEntries(
          (json.leads as QueueLead[]).map((l) => [
            l.id,
            {
              message: l.draft,
              title: l.title ?? "Toimitusjohtaja",
              companySize: l.company_size != null ? String(l.company_size) : "",
            },
          ])
        )
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setEdit = (id: string, patch: Partial<CardEdits>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const removeCard = (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setCardError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const approve = async (lead: QueueLead) => {
    setBusyId(lead.id);
    setCardError((prev) => ({ ...prev, [lead.id]: "" }));
    const e = edits[lead.id];
    try {
      const res = await fetch("/api/outreach/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          message: e.message,
          title: e.title,
          companySize: e.companySize,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Send failed");
      removeCard(lead.id);
      setToast(json.mode === "live" ? `Sent to ${lead.company_name}` : `Logged (dry-run) for ${lead.company_name}`);
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setCardError((prev) => ({ ...prev, [lead.id]: err instanceof Error ? err.message : "Send failed" }));
    } finally {
      setBusyId(null);
    }
  };

  const skip = async (lead: QueueLead) => {
    setBusyId(lead.id);
    try {
      const res = await fetch("/api/outreach/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Skip failed");
      }
      removeCard(lead.id);
    } catch (err) {
      setCardError((prev) => ({ ...prev, [lead.id]: err instanceof Error ? err.message : "Skip failed" }));
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = pageSize === "all" ? 1 : Math.ceil(leads.length / pageSize);
  const safePage = Math.min(currentPage, totalPages || 1);
  const pagedLeads = pageSize === "all"
    ? leads
    : leads.slice((safePage - 1) * pageSize, safePage * pageSize);
  const PAGE_SIZES: (number | "all")[] = [10, 25, 50, "all"];

  return (
    <div className="min-h-screen bg-zinc-50" style={{ fontFamily: "var(--font-body)" }}>
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Buildings weight="bold" className="text-zinc-700 w-5 h-5" />
            <span className="font-bold text-zinc-900 text-sm tracking-tight">SMS review queue</span>
            {leads.length > 0 && (
              <span className="text-xs text-zinc-400">
                {pageSize === "all" ? leads.length : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, leads.length)} of ${leads.length}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Page size toggle */}
            {leads.length > 0 && (
              <div className="flex items-center bg-zinc-100 rounded-xl p-0.5 gap-0.5">
                {PAGE_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setPageSize(s); setCurrentPage(1); }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
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
            <NextLink href="/dashboard/outreach/email" className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors font-medium">
              Email queue
            </NextLink>
            <NextLink href="/dashboard/conversations" className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors font-medium">
              <ChatText size={14} weight="bold" />
              Inbox
            </NextLink>
            <NextLink href="/dashboard" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
              <ArrowLeft size={13} />
              Back to dashboard
            </NextLink>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-8 py-8 space-y-5">
        {/* Mode banner */}
        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold border ${
            sendMode === "live"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          <WarningCircle size={15} weight="fill" />
          {sendMode === "live"
            ? "LIVE — approving a card sends a real SMS via Twilio."
            : "DRY-RUN — no Twilio credentials set. Approving logs a compliance record but sends nothing."}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-zinc-400 text-sm">
            <CircleNotch size={18} className="animate-spin" />
            Loading queue…
          </div>
        )}

        {loadError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-rose-50 text-rose-600 border border-rose-200">
            <WarningCircle size={16} weight="fill" />
            {loadError}
          </div>
        )}

        {!loading && !loadError && leads.length === 0 && (
          <div className="text-center py-20 text-zinc-400 text-sm">
            <CheckCircle size={28} weight="duotone" className="mx-auto mb-3 text-emerald-400" />
            Queue is empty — every eligible lead has been actioned.
          </div>
        )}

        {/* Pagination controls */}
        {pageSize !== "all" && totalPages > 1 && (
          <div className="flex items-center justify-center gap-0.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
                        : "text-zinc-400 hover:text-zinc-700 hover:bg-white hover:shadow-sm"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              →
            </button>
          </div>
        )}

        {pagedLeads.map((lead) => {
          const e = edits[lead.id];
          const busy = busyId === lead.id;
          const err = cardError[lead.id];
          const chars = e?.message.length ?? 0;
          const segments = Math.max(1, Math.ceil(chars / 153)); // GSM-7 multipart est.
          return (
            <div key={lead.id} className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4 shadow-sm">
              {/* Lead header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-bold text-zinc-900 text-base">{lead.company_name}</div>
                  <div className="text-sm text-zinc-500">
                    {lead.ceo_name ?? "—"} · {lead.normalizedPhone}
                  </div>
                </div>
                {lead.demo_url && (
                  <a
                    href={`${lead.demo_url}${STAFF_PREVIEW_HASH}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-all flex-shrink-0"
                  >
                    <ArrowSquareOut size={12} weight="bold" />
                    Demo site
                  </a>
                )}
              </div>

              {/* Compliance fields */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Title (role)</span>
                  <input
                    value={e?.title ?? ""}
                    onChange={(ev) => setEdit(lead.id, { title: ev.target.value })}
                    className="mt-1 w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Company size</span>
                  <input
                    type="number"
                    value={e?.companySize ?? ""}
                    placeholder="employees"
                    onChange={(ev) => setEdit(lead.id, { companySize: ev.target.value })}
                    className="mt-1 w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                  />
                </label>
              </div>

              {/* Data source */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Globe size={13} />
                Data source:{" "}
                {lead.url ? (
                  <a href={lead.url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-700 underline underline-offset-2">
                    {lead.url}
                  </a>
                ) : (
                  "—"
                )}
              </div>

              {/* SMS draft */}
              <label className="block">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">SMS message</span>
                <textarea
                  value={e?.message ?? ""}
                  onChange={(ev) => setEdit(lead.id, { message: ev.target.value })}
                  rows={4}
                  className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 resize-none font-mono leading-relaxed"
                />
                <span className="text-[11px] text-zinc-400">
                  {chars} chars · ~{segments} SMS segment{segments !== 1 ? "s" : ""}
                </span>
              </label>

              {err && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-rose-50 text-rose-600 border border-rose-200">
                  <WarningCircle size={14} weight="fill" />
                  {err}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => approve(lead)}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-all disabled:opacity-50"
                >
                  {busy ? <CircleNotch size={14} className="animate-spin" /> : <PaperPlaneTilt size={14} weight="bold" />}
                  {sendMode === "live" ? "Approve & send" : "Approve (dry-run)"}
                </button>
                <button
                  onClick={() => skip(lead)}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-zinc-500 hover:text-zinc-700 transition-all disabled:opacity-50"
                >
                  <X size={14} weight="bold" />
                  Skip
                </button>
              </div>
            </div>
          );
        })}

        {/* Bottom pagination */}
        {pageSize !== "all" && totalPages > 1 && (
          <div className="flex items-center justify-center gap-0.5 pt-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
                  <span key={`bot-ellipsis-${i}`} className="px-1 text-xs text-zinc-300">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p as number)}
                    className={`min-w-[28px] px-2 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      safePage === p
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-400 hover:text-zinc-700 hover:bg-white hover:shadow-sm"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              →
            </button>
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-semibold shadow-lg">
          <CheckCircle size={16} weight="fill" className="text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
