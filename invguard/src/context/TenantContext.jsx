/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../services/supabase";
import { getSupabaseMessage } from "../utils/inventory";

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [user, setUser] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [membership, setMembership] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(false);

  async function loadTenant() {
    setLoading(true);
    setError("");
    setSetupRequired(false);
    setAccessBlocked(false);

    const { data: userResult, error: userError } =
      await supabase.auth.getUser();

    if (userError || !userResult.user) {
      setUser(null);
      setEmpresa(null);
      setMembership(null);
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    const currentUser = userResult.user;
    setUser(currentUser);

    const { data: superAdminResult, error: superAdminError } =
      await supabase.rpc("es_super_admin");

    if (superAdminError) {
      setSetupRequired(true);
      setError(getSupabaseMessage(superAdminError));
      setLoading(false);
      return;
    }

    const nextIsSuperAdmin = Boolean(superAdminResult);
    setIsSuperAdmin(nextIsSuperAdmin);

    const { data: membershipRows, error: membershipError } = await supabase
      .from("empresa_usuarios")
      .select(
        "id, rol, email, empresa:empresas(id,nombre,rubro,ciudad,estado,plan,beta_started_at,trial_ends_at,created_at)"
      )
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (membershipError) {
      setSetupRequired(true);
      setError(getSupabaseMessage(membershipError));
      setLoading(false);
      return;
    }

    const membershipRow = membershipRows?.[0];

    if (membershipRow?.empresa) {
      setEmpresa(membershipRow.empresa);
      setMembership({
        id: membershipRow.id,
        rol: membershipRow.rol,
        email: membershipRow.email,
      });
      setLoading(false);
      return;
    }

    setEmpresa(null);
    setMembership(null);

    if (!nextIsSuperAdmin) {
      setAccessBlocked(true);
      setError(
        "Tu cuenta aun no tiene acceso asignado. Pide al administrador que te agregue a un negocio."
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    loadTenant();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadTenant();
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      user,
      empresa,
      empresaId: empresa?.id,
      membership,
      isSuperAdmin,
      loading,
      error,
      setupRequired,
      accessBlocked,
      reloadTenant: loadTenant,
    }),
    [
      user,
      empresa,
      membership,
      isSuperAdmin,
      loading,
      error,
      setupRequired,
      accessBlocked,
    ]
  );

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);

  if (!context) {
    throw new Error("useTenant debe usarse dentro de TenantProvider");
  }

  return context;
}
