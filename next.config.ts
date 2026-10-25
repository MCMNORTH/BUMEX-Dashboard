import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Loaded by Node at run time rather than bundled: it reads its own files and Google credentials (lib/erp/db.ts).
  serverExternalPackages: ["@google-cloud/cloud-sql-connector"],
  experimental: {
    // How long the browser reuses a page it already has. Each page sets its own
    // lifetime (`unstable_dynamicStaleTime`); Next uses this default for pages
    // it re-renders after a refresh or a change, which would otherwise be
    // fetched again on the next visit.
    staleTimes: { dynamic: 30 },
  },
  // BUMEX One's pages, retired: their addresses (in e-mails, notifications, bookmarks) open the Vanguard room or record
  // that replaced them (`tab` names a record as kind:id, the colon encoded). The first ERP pages went the same way.
  async redirects() {
    const room = (source: string, query: string) => ({ source, destination: `/vanguard?${query}`, permanent: false });
    return [
      room("/erp", "room=accounting"),
      room("/erp/:path*", "room=accounting"),
      room("/overview", "room=myday"),
      room("/my-work", "room=myday&tab=work"),
      room("/projects", "room=missions"),
      room("/projects/:id/workflow", "room=missions&tab=mission%3A:id%3Arules"),
      room("/projects/:id", "room=missions&tab=mission%3A:id"),
      room("/tickets", "room=tasks"),
      room("/tickets/:id", "room=tasks&tab=ticket%3A:id"),
      room("/staffing", "room=missions&tab=planning"),
      room("/planning", "room=missions&tab=week"),
      room("/calendar", "room=missions&tab=calendar"),
      room("/roadmap", "room=missions&tab=milestones"),
      room("/clients", "room=clients&tab=customers"),
      room("/clients/:id", "room=clients&tab=client%3A:id"),
      room("/contracts", "room=clients&tab=contracts"),
      room("/contracts/:id", "room=clients&tab=contract%3A:id"),
      room("/team", "room=hr&tab=people"),
      room("/team/:id", "room=hr&tab=person%3A:id"),
      room("/timesheet", "room=time"),
      room("/documents", "room=archives&tab=documents"),
      room("/finance", "room=reports&tab=archive"),
      room("/finance/:path*", "room=reports&tab=archive"),
      room("/reports", "room=reports&tab=activity"),
      room("/activity", "room=settings&tab=history"),
      room("/notifications", "room=inbox"),
      room("/settings", "room=settings&tab=account"),
      room("/settings/users", "room=settings&tab=access"),
      room("/settings/roles", "room=settings&tab=access"),
      room("/settings/:page", "room=settings&tab=account"),
      { source: "/search", destination: "/vanguard", permanent: false },
      { source: "/shareholders", destination: "/vanguard", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
