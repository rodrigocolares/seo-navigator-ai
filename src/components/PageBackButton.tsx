import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

type Origin = "dashboard" | "history" | undefined | null;

interface Props {
  origin?: Origin;
  defaultRoute?: "/dashboard" | "/history";
  label?: string;
  className?: string;
}

/**
 * Smart in-app back button. Always uses TanStack Router — never
 * `window.history.back()` (which can land on login or an external page).
 *
 * Resolution order:
 *  1. `origin === "history"` → /history
 *  2. `origin === "dashboard"` → /dashboard
 *  3. otherwise → `defaultRoute` (default: /dashboard)
 */
export function PageBackButton({
  origin,
  defaultRoute = "/dashboard",
  label = "Voltar",
  className,
}: Props) {
  const to =
    origin === "history"
      ? "/history"
      : origin === "dashboard"
        ? "/dashboard"
        : defaultRoute;

  const targetLabel =
    to === "/history" ? "Voltar ao histórico" : "Voltar ao dashboard";

  return (
    <Link
      to={to}
      title={targetLabel}
      aria-label={targetLabel}
      className={
        "group inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground " +
        (className ?? "")
      }
    >
      <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
      {label}
    </Link>
  );
}
