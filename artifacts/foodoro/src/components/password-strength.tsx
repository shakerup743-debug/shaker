import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  password: string;
}

type Level = 0 | 1 | 2 | 3 | 4;

function score(pw: string): Level {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s) as Level;
}

const LEVELS = [
  { label: "", color: "bg-muted" },
  { label: "pwStrength.weak", color: "bg-red-500" },
  { label: "pwStrength.fair", color: "bg-yellow-500" },
  { label: "pwStrength.good", color: "bg-blue-500" },
  { label: "pwStrength.strong", color: "bg-green-500" },
] as const;

export function PasswordStrength({ password }: Props) {
  const { t } = useTranslation();
  const level = useMemo(() => score(password), [password]);

  if (!password) return null;

  const info = LEVELS[level];

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < level ? info.color : "bg-muted"}`}
          />
        ))}
      </div>
      {level > 0 && (
        <p className={`text-xs font-medium ${level === 1 ? "text-red-500" : level === 2 ? "text-yellow-500" : level === 3 ? "text-blue-500" : "text-green-500"}`}>
          {t(info.label)}
        </p>
      )}
    </div>
  );
}
