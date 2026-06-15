import { useEffect, useState } from "react";
import { FiLock, FiMail } from "react-icons/fi";

import { supabase } from "../services/supabase";
import { getSupabaseMessage } from "../utils/inventory";

const requireAuth = import.meta.env.VITE_REQUIRE_AUTH !== "false";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(requireAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!requireAuth) return undefined;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (error) {
      setMessage(getSupabaseMessage(error));
      return;
    }

    setMessage("Sesion iniciada.");
  }

  if (!requireAuth) return children;

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-950 text-neutral-100">
        <p className="text-sm text-neutral-400">Cargando sesion...</p>
      </div>
    );
  }

  if (session) return children;

  return (
    <div className="grid min-h-screen place-items-center bg-neutral-950 p-4 text-neutral-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-white/10 bg-neutral-900 p-6"
      >
        <div className="mb-6">
          <div className="mb-4 inline-flex rounded-lg bg-teal-500/15 p-3 text-teal-200">
            <FiLock className="h-6 w-6" />
          </div>
          <p className="mb-2 text-sm font-medium text-teal-300">
            Acceso privado
          </p>
          <h1 className="text-2xl font-semibold">Entrar a InvGuard</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Usa el correo y la contrasena que te entrego el administrador.
            Cada negocio ve solo sus propios datos.
          </p>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-neutral-400">
            Correo de acceso
          </span>
          <div className="relative">
            <FiMail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-500" />
            <input
              type="email"
              autoComplete="email"
              placeholder="tu@negocio.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2 pl-10 pr-3 text-sm"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-neutral-400">
            Contrasena
          </span>
          <div className="relative">
            <FiLock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-500" />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Tu contrasena"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2 pl-10 pr-3 text-sm"
              minLength={6}
              required
            />
          </div>
        </label>

        {message && (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-neutral-200">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
        >
          {submitting ? "Entrando..." : "Entrar a mi inventario"}
        </button>

        <p className="mt-4 text-center text-xs leading-5 text-neutral-500">
          Si aun no tienes acceso, pide tu usuario al administrador de
          InvGuard. No hay registro publico.
        </p>
      </form>
    </div>
  );
}
