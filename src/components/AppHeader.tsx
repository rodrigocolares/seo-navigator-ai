import { Link, useNavigate } from "@tanstack/react-router";
import { Radar, LogOut, History, LayoutDashboard, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function AppHeader({ authenticated = false }: { authenticated?: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
            <Radar className="h-4 w-4" />
          </div>
          <span>
            SEO <span className="gradient-text">Insight AI</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {authenticated ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">
                  <LayoutDashboard className="mr-1.5 h-4 w-4" /> Dashboard
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/history">
                  <History className="mr-1.5 h-4 w-4" /> Histórico
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/integrations">
                  <Plug className="mr-1.5 h-4 w-4" /> Integrações
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-1.5 h-4 w-4" /> Sair
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Entrar</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth">Começar grátis</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
