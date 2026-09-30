import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity/service";
import { getAuthContext } from "@/lib/auth/server";
import { getDocumentById, getDocumentDownloadUrl } from "@/lib/documents/service";
import { getInvoiceById } from "@/lib/finance/service";

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

  if (document.related_type === "invoice" && document.related_id) {
    const invoice = await getInvoiceById(document.related_id, auth.role);
    if (invoice && invoice.approval_status !== "approved") {
      return new NextResponse("Cette facture attend la validation d’un administrateur.", { status: 403 });
    }
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
