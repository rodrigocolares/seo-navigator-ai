import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

type Status = "validating" | "ready" | "invalid";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>("validating");

  useEffect(() => {
    let cancelled = false;

    // Listen for PASSWORD_RECOVERY / SIGNED_IN events (hash-token flow).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setStatus("ready");
      }
    });

    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hash = url.hash || "";
      const hasHashToken = hash.includes("access_token=") || hash.includes("type=recovery");

      console.debug("[reset-password] code present:", !!code, "hash present:", hasHashToken);

      try {
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (cancelled) return;
          if (error || !data.session) {
            console.debug("[reset-password] exchange failed");
            setStatus("invalid");
            return;
          }
          // Clean sensitive params from URL.
          window.history.replaceState({}, "", url.pathname);
          setStatus("ready");
          return;
        }

        // Hash-token flow: Supabase parses the hash automatically on load.
        // Give it a tick, then check for a session.
        await new Promise((r) => setTimeout(r, 300));
        const { data: s } = await supabase.auth.getSession();
        if (cancelled) return;
        if (s.session) {
          if (hasHashToken) window.history.replaceState({}, "", url.pathname);
          setStatus("ready");
        } else {
          setStatus("invalid");
        }
      } catch (err) {
        if (cancelled) return;
        console.debug("[reset-password] validation error");
        setStatus("invalid");
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas informadas não são iguais.");
      return;
    }
    setLoading(true);
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      setLoading(false);
      setStatus("invalid");
      toast.error("O link de recuperação é inválido ou expirou. Solicite um novo link.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      console.debug("[reset-password] updateUser error:", error.message);
      toast.error("Não foi possível atualizar sua senha. Solicite um novo link.");
      return;
    }
    toast.success("Sua senha foi atualizada com sucesso. Faça login novamente.");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col px-4 py-16">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Criar nova senha</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Defina uma nova senha para acessar sua conta.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-6">
          {status === "invalid" ? (
            <div className="space-y-4 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">
                O link de recuperação é inválido ou expirou. Solicite um novo link.
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">Voltar para login</Link>
              </Button>
            </div>
          ) : status === "validating" ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validando link...
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label className="mb-1.5 block text-xs">Nova senha</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Confirmar nova senha</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Atualizando senha..." : "Atualizar senha"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
