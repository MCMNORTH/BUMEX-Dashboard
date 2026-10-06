import { redirect } from "next/navigation";

// There are no workspace-level settings yet; the page only held placeholder text.
export default function SettingsWorkspacePage() {
  redirect("/settings");
}
