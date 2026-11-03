import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// On the Vercel deployment only the individual demo pages (/<slug>) are public.
// The dashboard, API routes, and root index are local-only — block them on Vercel.
export function middleware(req: NextRequest) {
  if (!process.env.VERCEL) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Public exceptions on Vercel: revalidation, the Twilio STOP webhook (must be
  // internet-reachable so opt-outs sync), the demo open-tracking beacon (fires
  // from live demo pages), and the cleanup cron (gated by CRON_SECRET).
  const publicApi =
    pathname === "/api/revalidate" ||
    pathname === "/api/sms/inbound" ||
    pathname === "/api/track-open" ||
    pathname === "/api/cron/cleanup-demos";

  if (
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    (pathname.startsWith("/api/") && !publicApi)
  ) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ["/((?!_next|favicon.ico|images).*)"],
};
