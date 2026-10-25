import { signOutAction } from "@/app/login/actions";
import { getCurrentLocale } from "@/lib/i18n/server";

// What someone without Vanguard access sees (app/(app)/layout.tsx): their access was removed, or the ERP database
// cannot be reached. BUMEX One's own screens are gone (2026-10-25).
export async function NoAccess({ reason, email }: { reason: "removed" | "unavailable"; email: string }) {
  const fr = (await getCurrentLocale()) === "fr";
  const say = (french: string, english: string) => (fr ? french : english);
  return (
    <main className="grid min-h-screen place-items-center bg-[#131d33] px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-[#1c2231] shadow-xl">
        <p className="text-xs font-semibold tracking-[.18em] text-[#2b3f66]">BUMEX VANGUARD</p>
        <h1 className="mt-3 text-xl font-semibold">
          {reason === "removed" ? say("Accès non ouvert", "No access") : say("Service momentanément indisponible", "Service temporarily unavailable")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#6a7382]">
          {reason === "removed"
            ? say(
                `Le compte ${email} n'a pas accès à BUMEX Vanguard. Demandez à votre administrateur de vous l'ouvrir.`,
                `The account ${email} has no access to BUMEX Vanguard. Ask your administrator to open it for you.`,
              )
            : say("La base de l'ERP ne répond pas. Réessayez dans quelques minutes.", "The ERP database does not answer. Try again in a few minutes.")}
        </p>
        <form action={signOutAction} className="mt-6">
          <button type="submit" className="h-9 rounded-md bg-[#2b3f66] px-4 text-sm font-medium text-white hover:bg-[#1d2c49]">
            {say("Se déconnecter", "Sign out")}
          </button>
        </form>
      </div>
    </main>
  );
}
