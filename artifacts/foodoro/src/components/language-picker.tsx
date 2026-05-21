import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Globe, Check } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "@/i18n/languages";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function LanguagePicker(): JSX.Element {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="language-picker-trigger"
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-card border border-border text-xs font-medium hover:bg-accent transition-colors"
        >
          <Globe size={13} className="text-primary" />
          <span className="text-base leading-none">{active.flag}</span>
          <span className="text-foreground">{active.nameNative}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bg-card border-border text-foreground max-h-[420px] overflow-y-auto w-60"
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            data-testid={`language-option-${l.code}`}
            onClick={() => void i18n.changeLanguage(l.code)}
            className="flex items-center justify-between gap-2 cursor-pointer text-xs"
          >
            <span className="flex items-center gap-2">
              <span className="text-base leading-none">{l.flag}</span>
              <span className="font-medium">{l.nameNative}</span>
              <span className="text-muted-foreground text-[10px]">{l.nameEn}</span>
            </span>
            {l.code === active.code && <Check size={13} className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
