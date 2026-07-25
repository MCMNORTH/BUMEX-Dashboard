import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/server";

export default async function Home() {
  const auth = await getAuthContext();

  if (!auth.user) {
    redirect("/login");
  }

  redirect(auth.profile?.entity_code ? "/overview" : "/select-entity");
}
