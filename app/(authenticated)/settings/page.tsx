// `/settings` — redirects to the default settings sub-route (`/settings/team`
// per design.md §1.2's visual layout, "Team Members" listed first). The
// RouteGuard/capability check itself lives in ./layout.tsx and applies to
// this redirect too since it wraps every child route.

import { redirect } from "next/navigation";

export default function SettingsIndexPage() {
  redirect("/settings/team");
}
