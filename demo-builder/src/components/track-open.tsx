"use client";

import { useEffect } from "react";

/**
 * URL hash the dashboard appends to its own demo links so the salesperson's
 * preview opens don't get counted as the lead's. The SMS sent to the lead uses
 * the bare demo_url (no hash), so their open fires the beacon normally.
 */
export const STAFF_PREVIEW_HASH = "#smview";

/**
 * The "link listener". Renders nothing — on mount it fires a fire-and-forget
 * beacon recording that this demo page was opened by a real browser.
 *
 * Why a client beacon and not server-side counting:
 *  - Demo pages are permanently CDN-cached (revalidate = false), so a server
 *    render only ever fires on the first cold render — never the lead's visit.
 *  - SMS/WhatsApp link-preview crawlers fetch the HTML but don't run JS, so
 *    this only fires for genuine human opens, not unfurl bots.
 *
 * Staff preview opens are excluded two ways: this hash check (links clicked from
 * the dashboard) and, server-side, record_demo_open only counts opens that land
 * after the lead was actually contacted (so pre-send QA opens never count).
 */
export function TrackOpen({ slug }: { slug: string }) {
  useEffect(() => {
    // Skip automated browsers (Puppeteer screenshots, headless crawlers).
    if (typeof navigator === "undefined" || navigator.webdriver) return;
    // Skip our own preview opens, flagged via the URL hash by the dashboard.
    if (typeof window !== "undefined" && window.location.hash === STAFF_PREVIEW_HASH) return;
    try {
      navigator.sendBeacon(`/api/track-open?slug=${encodeURIComponent(slug)}`);
    } catch {
      // Best-effort — never let tracking break the page.
    }
  }, [slug]);

  return null;
}
