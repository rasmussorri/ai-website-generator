"use client";

import NextLink from "next/link";

import NextImage from "next/image";
import React, { useState, useEffect } from "react";

interface EmailQueueLead {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string;
  title: string | null;
  employeeCount: number | null;
  dataSourceUrl: string | null;
  demoUrl: string | null;
  gifUrl: string | null;
  emailSubject: string;
  emailText: string;
}

export default function EmailQueue() {
  const [leads, setLeads] = useState<EmailQueueLead[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [signature, setSignature] = useState({ name: "", website: "" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/outreach/email/leads", { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load queue");
        return json;
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        setLoadError(null);
        setLeads(json.leads);
        if (json.signature) setSignature(json.signature);
        setIndex(0);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Failed to load queue");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const advance = () => {
    setCardError(null);
    setIndex((i) => i + 1);
  };

  const approve = async (lead: EmailQueueLead) => {
    setBusy(true);
    setCardError(null);
    try {
      const res = await fetch("/api/outreach/email/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Send failed");
      setToast(`Lähetetty: ${lead.companyName}`);
      setTimeout(() => setToast(null), 4000);
      advance();
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const skip = async (lead: EmailQueueLead) => {
    setBusy(true);
    setCardError(null);
    try {
      const res = await fetch("/api/outreach/email/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Skip failed");
      }
      advance();
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "Skip failed");
    } finally {
      setBusy(false);
    }
  };

  const remaining = leads.length - index;
  const lead = leads[index] ?? null;

  // ─── Email preview ────────────────────────────────────────────────────────
  const emailPreview = lead?.emailText ?? "";

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#f0f0f0",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #1e1e1e",
          position: "sticky",
          top: 0,
          background: "#0a0a0a",
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            padding: "0 24px",
            height: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em" }}>
              Email review queue
            </span>
            {!loading && !loadError && (
              <span style={{ fontSize: 12, color: "#555", fontFamily: "monospace" }}>
                {remaining > 0 ? `${remaining} jäljellä` : "tyhjä"}
              </span>
            )}
          </div>
          <NextLink
            href="/dashboard/outreach"
            style={{ fontSize: 12, color: "#555", textDecoration: "none" }}
          >
            ← SMS queue
          </NextLink>
        </div>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px" }}>
        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#444", fontSize: 14 }}>
            Ladataan jonoa — GIF-kuvat generoidaan ensimmäisellä latauksella, tämä voi kestää hetken…
          </div>
        )}

        {/* Load error */}
        {loadError && (
          <div
            style={{
              padding: "12px 16px",
              background: "#1a0a0a",
              border: "1px solid #4a1a1a",
              borderRadius: 8,
              color: "#f87171",
              fontSize: 13,
            }}
          >
            {loadError}
          </div>
        )}

        {/* Empty */}
        {!loading && !loadError && remaining === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#444", fontSize: 14 }}>
            Jono on tyhjä — kaikki liidit on käsitelty.
          </div>
        )}

        {/* Card */}
        {!loading && !loadError && lead && (
          <div
            style={{
              background: "#111",
              border: "1px solid #1e1e1e",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* Card header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #1a1a1a" }}>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                {lead.companyName}
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "#666",
                  lineHeight: 1.7,
                }}
              >
                {lead.contactName && <span>{lead.contactName} · </span>}
                <span>{lead.contactEmail}</span>
                {lead.title && <span> · {lead.title}</span>}
                {lead.employeeCount != null && <span> · {lead.employeeCount} hlö</span>}
              </div>
              {lead.dataSourceUrl && (
                <div style={{ marginTop: 4 }}>
                  <a
                    href={lead.dataSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontFamily: "monospace", fontSize: 11, color: "#444", textDecoration: "none" }}
                  >
                    {lead.dataSourceUrl}
                  </a>
                </div>
              )}
            </div>

            {/* GIF preview */}
            <div style={{ background: "#0d0d0d" }}>
              {lead.gifUrl ? (
                <NextImage
                  width={640}
                  height={400}
                  unoptimized
                  src={lead.gifUrl}
                  alt="Demo preview"
                  style={{ display: "block", width: "100%", height: "auto", border: "none" }}
                />
              ) : (
                <div
                  style={{
                    height: 220,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#333",
                    fontSize: 13,
                    fontFamily: "monospace",
                  }}
                >
                  GIF ei saatavilla
                </div>
              )}
            </div>

            {/* Email preview */}
            <div style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#444", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Aihe: {lead.emailSubject}
              </div>
              <div
                style={{
                  background: "#0d0d0d",
                  border: "1px solid #1e1e1e",
                  borderRadius: 8,
                  padding: "14px 16px",
                  fontSize: 14,
                  color: "#c0c0c0",
                  lineHeight: 1.65,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
              >
                <p style={{ margin: "0 0 12px 0", whiteSpace: "pre-line" }}>{emailPreview}</p>
                {lead.gifUrl && (
                  <div
                    style={{
                      height: 40,
                      background: "#1a1a1a",
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: 10,
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: "#444",
                      marginBottom: 12,
                    }}
                  >
                    [GIF-kuva]
                  </div>
                )}
                <p style={{ margin: 0, color: "#888" }}>
                  {signature.name}
                  <br />
                  <span style={{ color: "#555" }}>{signature.website}</span>
                </p>
              </div>
            </div>

            {/* Error */}
            {cardError && (
              <div
                style={{
                  margin: "0 24px 16px",
                  padding: "10px 14px",
                  background: "#1a0a0a",
                  border: "1px solid #4a1a1a",
                  borderRadius: 8,
                  color: "#f87171",
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
              >
                {cardError}
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                padding: "0 24px 24px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <button
                onClick={() => approve(lead)}
                disabled={busy}
                style={{
                  padding: "10px 24px",
                  background: busy ? "#1a2a1a" : "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.6 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {busy ? "…" : "Lähetä"}
              </button>
              <button
                onClick={() => skip(lead)}
                disabled={busy}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  color: "#555",
                  border: "1px solid #222",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                Ohita
              </button>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "#333",
                }}
              >
                {index + 1} / {leads.length}
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#16a34a",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            pointerEvents: "none",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
