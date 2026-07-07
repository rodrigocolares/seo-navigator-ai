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

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    // Supabase JS parses the recovery hash automatically and fires PASSWORD_RECOVERY.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });
    // Fallback: check for existing session (link already consumed on this page).
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady(true);
      else {
        // If no session materialized shortly after mount, treat link as invalid.
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: s2 }) => {
            if (!s2.session) setInvalid(true);
          });
        }, 1500);
      }
    });
    return () => data.subscription.unsubscribe();
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
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
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
          {invalid && !ready ? (
            <div className="space-y-4 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">
                O link de recuperação é inválido ou expirou. Solicite um novo link.
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">Voltar para login</Link>
              </Button>
            </div>
          ) : !ready ? (
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
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Atualizar senha
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
