import { requireRouteAccess } from "@/lib/auth/server";
import { Card, CardContent } from "@/components/ui/card";

export default async function SettingsWorkspacePage() {
  await requireRouteAccess("settings");

  return (
    <Card className="border-border/70 bg-card/72 backdrop-blur-xl">
      <CardContent className="px-6 py-8">
        <p className="text-sm font-medium">IUEAFUZIURZEJEZJ</p>
      </CardContent>
    </Card>
  );
}
