"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/layout/i18n-provider";
import { localeCookieName, type Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function persistLocale(nextLocale: Locale) {
  document.cookie = `${localeCookieName}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.setAttribute("lang", nextLocale);
}

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const [isPending, startTransition] = useTransition();

  function handleChange(nextLocale: Locale) {
    if (nextLocale === locale) {
      return;
    }

    window.localStorage.setItem(localeCookieName, nextLocale);
    persistLocale(nextLocale);
    setLocale(nextLocale);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 rounded-2xl px-3" disabled={isPending}>
          <Languages className="size-4" />
          <span className="hidden text-sm sm:inline">{t("common.language", "Language")}</span>
          <span className="text-xs font-semibold uppercase text-muted-foreground">{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {(["en", "fr"] as const).map((item) => (
          <DropdownMenuItem
            key={item}
            onSelect={() => handleChange(item)}
            disabled={isPending}
            className={locale === item ? "bg-accent" : undefined}
          >
            {t(`common.languages.${item}`, item)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
