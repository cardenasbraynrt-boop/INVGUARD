import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FiActivity,
  FiCpu,
  FiLogOut,
  FiMapPin,
  FiPackage,
  FiRepeat,
  FiSettings,
  FiTool,
  FiTrendingDown,
} from "react-icons/fi";

import { supabase } from "../services/supabase";
import { useTenant } from "../context/TenantContext";

const requireAuth = import.meta.env.VITE_REQUIRE_AUTH !== "false";

const items = [
  {
    to: "/",
    label: "Dashboard",
    icon: FiActivity,
  },
  {
    to: "/inventario",
    label: "Inventario",
    icon: FiPackage,
  },
  {
    to: "/movimientos",
    label: "Movimientos",
    icon: FiRepeat,
  },
  {
    to: "/perdidas",
    label: "Perdidas",
    icon: FiTrendingDown,
  },
  {
    to: "/ia",
    label: "Analisis",
    icon: FiCpu,
  },
  {
    to: "/herramientas",
    label: "Herramientas",
    icon: FiTool,
  },
  {
    to: "/admin",
    label: "Admin",
    icon: FiSettings,
  },
];

export default function Sidebar() {
  const { empresa, isSuperAdmin } = useTenant();
  const [userEmail, setUserEmail] = useState("");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => {
      setClock(
        new Intl.DateTimeFormat("es-PE", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date())
      );
    };

    tick();
    const interval = window.setInterval(tick, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!requireAuth) return undefined;

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || "");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || "");
    });

    return () => subscription.unsubscribe();
  }, []);

  const visibleItems =
    !empresa && isSuperAdmin
      ? items.filter((item) => item.to === "/admin")
      : items;

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/95 backdrop-blur">
      <div className="flex flex-col gap-3 px-4 py-3 lg:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-400 text-neutral-950">
              <FiPackage className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                Inv<span className="text-teal-300">Guard</span>
              </h1>
              <p className="flex items-center gap-1 text-xs text-neutral-400">
                <FiMapPin className="h-3.5 w-3.5 text-teal-300" />
                {empresa?.nombre ||
                  (isSuperAdmin ? "Super Admin" : "Inventario privado")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1 text-teal-100">
              <span className="h-2 w-2 rounded-full bg-teal-300" />
              {isSuperAdmin ? "Control maestro" : "Sincronizado"}
            </span>
            <span>{clock}</span>
            {requireAuth && userEmail && (
              <span className="max-w-[180px] truncate">{userEmail}</span>
            )}
            {requireAuth && (
              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-neutral-300 hover:bg-white/5 hover:text-white"
              >
                <FiLogOut className="h-4 w-4" />
                Salir
              </button>
            )}
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [
                    "flex min-w-max items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "border-teal-300 text-teal-200"
                      : "border-transparent text-neutral-400 hover:text-white",
                  ].join(" ")
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
