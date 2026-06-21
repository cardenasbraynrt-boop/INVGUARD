import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import AuthGate from "./components/AuthGate";
import Sidebar from "./components/Sidebar";
import { TenantProvider, useTenant } from "./context/TenantContext";
import { supabase } from "./services/supabase";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const CuentasPagar = lazy(() => import("./pages/CuentasPagar"));
const Herramientas = lazy(() => import("./pages/Herramientas"));
const IA = lazy(() => import("./pages/IA"));
const Inventario = lazy(() => import("./pages/Inventario"));
const Movimientos = lazy(() => import("./pages/Movimientos"));
const Perdidas = lazy(() => import("./pages/Perdidas"));

function LoadingScreen() {
  return (
    <div className="grid min-h-[55vh] place-items-center p-8">
      <div className="rounded-lg border border-white/10 bg-neutral-900 px-4 py-3 text-sm text-neutral-300">
        Preparando tu inventario...
      </div>
    </div>
  );
}

function SetupRequired() {
  const { error, reloadTenant } = useTenant();

  return (
    <div className="grid min-h-[70vh] place-items-center p-6">
      <div className="max-w-2xl rounded-lg border border-amber-400/30 bg-amber-400/10 p-6 text-amber-50">
        <h1 className="text-2xl font-semibold">
          Falta activar la base para clientes
        </h1>
        <p className="mt-3 text-sm leading-6 text-amber-100/90">
          InvGuard ya esta listo para datos privados por negocio, pero falta
          ejecutar el SQL de Supabase en{" "}
          <span className="font-semibold">supabase/multi_tenant.sql</span>.
          Eso activa negocios, usuarios, permisos y movimientos seguros.
        </p>
        {error && (
          <p className="mt-4 rounded-lg border border-white/10 bg-neutral-950/40 p-3 text-sm">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={reloadTenant}
          className="mt-5 rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-200"
        >
          Ya active la base, reintentar
        </button>
      </div>
    </div>
  );
}

function AccessBlocked() {
  const { error, reloadTenant } = useTenant();

  return (
    <div className="grid min-h-[70vh] place-items-center p-6">
      <div className="max-w-xl rounded-lg border border-white/10 bg-neutral-900 p-6 text-neutral-100">
        <h1 className="text-2xl font-semibold">Acceso pendiente</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Tu cuenta existe, pero todavia no esta conectada a un negocio.
          Pide al administrador de InvGuard que te asigne acceso.
        </p>
        {error && (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reloadTenant}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-neutral-300 hover:bg-white/5"
          >
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}

function SuspendedBusiness() {
  const { empresa, reloadTenant } = useTenant();

  return (
    <div className="grid min-h-[70vh] place-items-center p-6">
      <div className="max-w-xl rounded-lg border border-red-400/30 bg-red-400/10 p-6 text-red-50">
        <h1 className="text-2xl font-semibold">Negocio suspendido</h1>
        <p className="mt-3 text-sm leading-6 text-red-100/90">
          {empresa?.nombre || "Este negocio"} esta suspendido temporalmente.
          Contacta al administrador de InvGuard para reactivar el acceso.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reloadTenant}
            className="rounded-lg bg-red-200 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-red-100"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="rounded-lg border border-red-200/30 px-4 py-2 text-sm text-red-50 hover:bg-red-100/10"
          >
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}

function TenantGate({ children }) {
  const { accessBlocked, empresa, isSuperAdmin, loading, setupRequired } =
    useTenant();

  if (loading) return <LoadingScreen />;
  if (setupRequired) return <SetupRequired />;
  if (accessBlocked) return <AccessBlocked />;
  if (empresa?.estado === "SUSPENDIDO" && !isSuperAdmin) {
    return <SuspendedBusiness />;
  }

  return children;
}

function AppRoutes() {
  const { empresa, isSuperAdmin } = useTenant();

  if (!empresa && isSuperAdmin) {
    return (
      <Routes>
        <Route path="*" element={<Admin />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/inventario" element={<Inventario />} />
      <Route path="/movimientos" element={<Movimientos />} />
      <Route path="/cuentas-pagar" element={<CuentasPagar />} />
      <Route path="/perdidas" element={<Perdidas />} />
      <Route path="/ia" element={<IA />} />
      <Route path="/herramientas" element={<Herramientas />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthGate>
      <TenantProvider>
        <BrowserRouter>
          <TenantGate>
            <div className="min-h-screen bg-neutral-950 text-neutral-100">
              <Sidebar />

              <main className="min-w-0">
                <Suspense fallback={<LoadingScreen />}>
                  <AppRoutes />
                </Suspense>
              </main>
            </div>
          </TenantGate>
        </BrowserRouter>
      </TenantProvider>
    </AuthGate>
  );
}
