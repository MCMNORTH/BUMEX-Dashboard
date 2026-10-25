import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/server";

// The app is BUMEX Vanguard (app/(app)/layout.tsx decides who enters it).
export default async function Home() {
  const auth = await getAuthContext();

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.profile?.entity_code) {
    redirect("/select-entity");
  }

  redirect("/vanguard");
}
