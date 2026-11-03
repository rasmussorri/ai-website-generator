"use client";

import NextLink from "next/link";

import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  CircleNotch,
  ChatText,
  PaperPlaneTilt,
  ArrowSquareOut,
  WarningCircle,
  CheckCircle,
} from "@phosphor-icons/react";

interface Conversation {
  id: string;
  company_name: string;
  ceo_name: string | null;
  phone: string | null;
  demo_url: string | null;
  funnel_stage: string | null;
  latest: { direction: string; body: string; created_at: string };
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  twilio_sid: string | null;
  created_at: string;
}

interface Thread {
  lead: {
    id: string;
    company_name: string;
    ceo_name: string | null;
    phone: string | null;
    demo_url: string | null;
  };
  messages: Message[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" });
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadLoading, setThreadLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/outreach/conversations", { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        return json;
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        setConversations(json.conversations);
        setLoadError(null);
        setSelectedId((current) => current ?? json.conversations[0]?.id ?? null);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Failed to load");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/outreach/conversations/${selectedId}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load thread");
        return json;
      })
      .then((json) => { if (!controller.signal.aborted) setThread(json); })
      .catch(() => { if (!controller.signal.aborted) setThread(null); })
      .finally(() => { if (!controller.signal.aborted) setThreadLoading(false); });
    return () => controller.abort();
  }, [selectedId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages]);

  const sendReply = async () => {
    if (!reply.trim() || !selectedId || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/outreach/conversations/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Send failed");
      setReply("");
      // Append the new message to the thread optimistically
      if (json.message) {
        setThread((prev) =>
          prev ? { ...prev, messages: [...prev.messages, json.message] } : prev
        );
      }
      if (json.mode === "dry-run") {
        setToast("Sent (dry-run — no real SMS)");
      } else {
        setToast("Sent");
      }
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendReply();
    }
  };

  const selected = conversations.find((c) => c.id === selectedId);

  return (
    <div className="h-screen flex flex-col bg-zinc-50" style={{ fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 flex-none">
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChatText weight="bold" className="text-zinc-700 w-5 h-5" />
            <span className="font-bold text-zinc-900 text-sm tracking-tight">Conversations</span>
          </div>
          <NextLink
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <ArrowLeft size={13} />
            Back to dashboard
          </NextLink>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 flex-none border-r border-zinc-200 bg-white flex flex-col overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-zinc-400 text-sm">
              <CircleNotch size={16} className="animate-spin" />
              Loading…
            </div>
          )}
          {loadError && (
            <div className="m-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-rose-50 text-rose-600 border border-rose-200">
              <WarningCircle size={13} weight="fill" />
              {loadError}
            </div>
          )}
          {!loading && !loadError && conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-400 text-sm px-4 text-center">
              <ChatText size={24} weight="duotone" className="text-zinc-300" />
              No replies yet. Send some outreach first.
            </div>
          )}
          <ul className="overflow-y-auto flex-1">
            {conversations.map((c) => {
              const isSelected = c.id === selectedId;
              const isInbound = c.latest?.direction === "inbound";
              return (
                <li key={c.id}>
                  <button
                    onClick={() => { if (c.id !== selectedId) { setThreadLoading(true); setSendError(null); setSelectedId(c.id); } }}
                    className={`w-full text-left px-4 py-3.5 border-b border-zinc-100 transition-colors ${
                      isSelected ? "bg-zinc-100" : "hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm font-semibold text-zinc-900 leading-tight truncate ${isInbound ? "text-zinc-900" : "text-zinc-600"}`}>
                        {c.company_name}
                      </span>
                      <span className="text-[11px] text-zinc-400 flex-none mt-0.5">
                        {c.latest ? timeAgo(c.latest.created_at) : ""}
                      </span>
                    </div>
                    {c.ceo_name && (
                      <div className="text-xs text-zinc-400 mt-0.5 truncate">{c.ceo_name}</div>
                    )}
                    {c.latest && (
                      <div className="text-xs text-zinc-500 mt-1 truncate leading-relaxed">
                        {c.latest.direction === "outbound" ? "You: " : ""}
                        {c.latest.body}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Thread panel */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!selectedId || !selected ? (
            <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
              Select a conversation
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex-none border-b border-zinc-200 bg-white px-6 py-3.5 flex items-center justify-between">
                <div>
                  <div className="font-bold text-zinc-900 text-sm">{selected.company_name}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {selected.ceo_name && <span>{selected.ceo_name} · </span>}
                    {selected.phone}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selected.demo_url && (
                    <a
                      href={selected.demo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-all"
                    >
                      <ArrowSquareOut size={12} weight="bold" />
                      Demo site
                    </a>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                {threadLoading && (
                  <div className="flex items-center justify-center gap-2 py-12 text-zinc-400 text-sm">
                    <CircleNotch size={16} className="animate-spin" />
                    Loading thread…
                  </div>
                )}
                {!threadLoading && thread && thread.messages.length === 0 && (
                  <div className="text-center py-12 text-zinc-400 text-sm">No messages yet.</div>
                )}
                {!threadLoading &&
                  thread?.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          msg.direction === "outbound"
                            ? "bg-zinc-900 text-white rounded-br-md"
                            : "bg-white border border-zinc-200 text-zinc-900 rounded-bl-md shadow-sm"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                        <p
                          className={`text-[11px] mt-1.5 ${
                            msg.direction === "outbound" ? "text-zinc-400" : "text-zinc-400"
                          }`}
                        >
                          {shortDate(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                <div ref={bottomRef} />
              </div>

              {/* Reply box */}
              <div className="flex-none border-t border-zinc-200 bg-white px-6 py-4">
                {sendError && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs bg-rose-50 text-rose-600 border border-rose-200">
                    <WarningCircle size={13} weight="fill" />
                    {sendError}
                  </div>
                )}
                <div className="flex gap-3 items-end">
                  <textarea
                    ref={textareaRef}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a reply… (⌘ Enter to send)"
                    rows={3}
                    className="flex-1 px-4 py-3 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 resize-none font-mono leading-relaxed"
                  />
                  <button
                    onClick={sendReply}
                    disabled={!reply.trim() || sending}
                    className="flex items-center gap-1.5 px-4 py-3 text-sm font-bold bg-zinc-900 text-white rounded-xl hover:bg-zinc-700 transition-all disabled:opacity-40 flex-none"
                  >
                    {sending ? (
                      <CircleNotch size={15} className="animate-spin" />
                    ) : (
                      <PaperPlaneTilt size={15} weight="bold" />
                    )}
                    Send
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 mt-2">
                  {reply.length} chars · replying to {selected.phone}
                </p>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-semibold shadow-lg">
          <CheckCircle size={15} weight="fill" className="text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
