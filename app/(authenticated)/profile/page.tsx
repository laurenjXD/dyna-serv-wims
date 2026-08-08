// `/profile` — specs/05-ui-shell-and-navigation design.md §3.2 (registry id
// "profile", capability "none", surface "shared" — any authenticated user).
// Renders inside the shared shell (app/(authenticated)/layout.tsx); no
// RouteGuard wrapping is needed here since "none" already means "any
// authenticated session" and AuthenticatedShellBoundary has already gated
// that before this page renders (same pattern as app/(authenticated)/page.tsx).

import { getOwnProfile } from "./actions";
import { ProfileContainer } from "@/components/profile/ProfileContainer";
import { ShellStateView } from "@/components/global/ShellStateView";

export default async function ProfilePage() {
  const profile = await getOwnProfile();

  if (!profile) {
    // Session resolved server-side but no user_profiles row was found (or
    // getUser() failed at this exact instant) — safe fallback, never a
    // thrown error boundary.
    return <ShellStateView state={{ kind: "forbidden" }} />;
  }

  return <ProfileContainer profile={profile} />;
}
