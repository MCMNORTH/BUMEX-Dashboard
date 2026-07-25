import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/service";
import { getAuthContext } from "@/lib/auth/server";
import { getDocumentById, getDocumentDownloadUrl } from "@/lib/documents/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext();

  if (!auth.user || !auth.profile || !auth.role) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const document = await getDocumentById(id, auth.role);

  if (!document) {
    return new NextResponse("Not found", { status: 404 });
  }

  const signedUrl = await getDocumentDownloadUrl(id);

  if (!signedUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  await logActivity({
    userId: auth.profile.id,
    action: "Viewed document",
    entityType: "document",
    entityId: id,
    metadata: {
      kind: "view",
      summary: "Document opened from library",
    },
  });

  return NextResponse.redirect(signedUrl);
}
