import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/server";
import { globalSearch } from "@/lib/search/service";

export async function GET(request: Request) {
  const auth = await getAuthContext();

  if (!auth.user || !auth.profile || !auth.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await globalSearch(query, {
    id: auth.profile.id,
    role: auth.role,
  });

  return NextResponse.json({ results });
}
