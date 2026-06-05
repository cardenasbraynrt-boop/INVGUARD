import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import AuthGate from "./components/AuthGate";
import Sidebar from "./components/Sidebar";
import { TenantProvider, useTenant } from "./context/TenantContext";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const Herramientas = lazy(() => import("./pages/Herramientas"));
const IA = lazy(() => import("./pages/IA"));
const Inventario = lazy(() => import("./pages/Inventario"));
const Movimientos = lazy(() => import("./pages/Movimientos"));
const Perdidas = lazy(() => import("./pages/Perdidas"));

function LoadingScreen() {
  return (
    <div className="grid min-h-[55vh] place-items-center p-8">
      <div className="rounded-lg border border-white/10 bg-neutral-900 px-4 py-3 text-sm text-neutral-300">
        Cargando modulo...
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
          Falta activar la base multiusuario
        </h1>
        <p className="mt-3 text-sm leading-6 text-amber-100/90">
          La app ya esta lista para cuentas y datos privados, pero primero
          debes ejecutar el SQL de Supabase en{" "}
          <span className="font-semibold">supabase/multi_tenant.sql</span>.
          Eso crea empresas por usuario, permisos RLS y la funcion segura de
          movimientos.
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
          Ya ejecute el SQL, reintentar
        </button>
      </div>
    </div>
  );
}

function TenantGate({ children }) {
  const { loading, setupRequired } = useTenant();

  if (loading) return <LoadingScreen />;
  if (setupRequired) return <SetupRequired />;

  return children;
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
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inventario" element={<Inventario />} />
                    <Route path="/movimientos" element={<Movimientos />} />
                    <Route path="/perdidas" element={<Perdidas />} />
                    <Route path="/ia" element={<IA />} />
                    <Route path="/herramientas" element={<Herramientas />} />
                    <Route path="/admin" element={<Admin />} />
                  </Routes>
                </Suspense>
              </main>
            </div>
          </TenantGate>
        </BrowserRouter>
      </TenantProvider>
    </AuthGate>
  );
}
