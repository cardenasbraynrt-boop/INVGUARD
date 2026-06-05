import { useEffect, useState } from "react";
import { FiBriefcase, FiLock, FiMail, FiUserPlus } from "react-icons/fi";

import { supabase } from "../services/supabase";
import { getSupabaseMessage } from "../utils/inventory";

const requireAuth = import.meta.env.VITE_REQUIRE_AUTH !== "false";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(requireAuth);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
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

    const request =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                business_name: businessName || "Mi negocio",
                business_type: businessType,
              },
            },
          });

    const { error } = await request;

    setSubmitting(false);

    if (error) {
      setMessage(getSupabaseMessage(error));
      return;
    }

    setMessage(
      mode === "login"
        ? "Sesion iniciada."
        : "Usuario creado. Si Supabase pide confirmacion, revise el correo."
    );
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
            {mode === "login" ? (
              <FiLock className="h-6 w-6" />
            ) : (
              <FiUserPlus className="h-6 w-6" />
            )}
          </div>
          <h1 className="text-2xl font-semibold">
            {mode === "login" ? "Ingresar a InvGuard" : "Crear usuario"}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Crea tu cuenta y tus datos quedaran separados de otros negocios.
          </p>
        </div>

        {mode === "signup" && (
          <div className="mb-3 grid gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-400">
                Nombre del negocio
              </span>
              <div className="relative">
                <FiBriefcase className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-500" />
                <input
                  type="text"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2 pl-10 pr-3 text-sm"
                  placeholder="Ej. Bodega San Jose"
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-neutral-400">
                Rubro
              </span>
              <select
                value={businessType}
                onChange={(event) => setBusinessType(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              >
                <option value="">Seleccionar</option>
                <option value="Bodega">Bodega</option>
                <option value="Minimarket">Minimarket</option>
                <option value="Ferreteria">Ferreteria</option>
                <option value="Farmacia">Farmacia</option>
                <option value="Almacen">Almacen</option>
                <option value="Restaurante">Restaurante</option>
                <option value="Otro">Otro</option>
              </select>
            </label>
          </div>
        )}

        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-neutral-400">Correo</span>
          <div className="relative">
            <FiMail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-500" />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2 pl-10 pr-3 text-sm"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-neutral-400">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
            minLength={6}
            required
          />
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
          {submitting
            ? "Procesando..."
            : mode === "login"
              ? "Ingresar"
              : "Crear cuenta"}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-3 w-full rounded-lg border border-white/10 px-4 py-2 text-sm text-neutral-300 hover:bg-white/5"
        >
          {mode === "login"
            ? "Crear usuario nuevo"
            : "Ya tengo usuario"}
        </button>
      </form>
    </div>
  );
}
