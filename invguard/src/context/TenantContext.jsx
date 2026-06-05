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

function getBusinessName(user) {
  return (
    user?.user_metadata?.business_name ||
    user?.email?.split("@")?.[0] ||
    "Mi negocio"
  );
}

export function TenantProvider({ children }) {
  const [user, setUser] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);

  async function loadTenant() {
    setLoading(true);
    setError("");
    setSetupRequired(false);

    const { data: userResult, error: userError } =
      await supabase.auth.getUser();

    if (userError || !userResult.user) {
      setUser(null);
      setEmpresa(null);
      setMembership(null);
      setLoading(false);
      return;
    }

    const currentUser = userResult.user;
    setUser(currentUser);

    const { data: membershipRows, error: membershipError } = await supabase
      .from("empresa_usuarios")
      .select("id, rol, email, empresa:empresas(id,nombre,rubro,ciudad,created_at)")
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

    const inviteToken = new URLSearchParams(window.location.search).get(
      "invite"
    );

    if (inviteToken) {
      const { error: inviteError } = await supabase.rpc(
        "aceptar_invitacion_empresa",
        {
          p_token: inviteToken,
        }
      );

      if (inviteError) {
        setSetupRequired(true);
        setError(getSupabaseMessage(inviteError));
        setLoading(false);
        return;
      }

      window.history.replaceState({}, "", window.location.pathname);
      await loadTenant();
      return;
    }

    const { data: createdEmpresa, error: empresaError } = await supabase
      .from("empresas")
      .insert([
        {
          nombre: getBusinessName(currentUser),
          owner_id: currentUser.id,
          rubro: currentUser.user_metadata?.business_type || "",
          ciudad: currentUser.user_metadata?.city || "",
        },
      ])
      .select("*")
      .single();

    if (empresaError) {
      setSetupRequired(true);
      setError(getSupabaseMessage(empresaError));
      setLoading(false);
      return;
    }

    const { error: relationError } = await supabase
      .from("empresa_usuarios")
      .insert([
        {
          empresa_id: createdEmpresa.id,
          user_id: currentUser.id,
          email: currentUser.email,
          rol: "ADMIN",
        },
      ]);

    if (relationError) {
      setSetupRequired(true);
      setError(getSupabaseMessage(relationError));
      setLoading(false);
      return;
    }

    setEmpresa(createdEmpresa);
    setMembership({ rol: "ADMIN", email: currentUser.email });
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
      loading,
      error,
      setupRequired,
      reloadTenant: loadTenant,
    }),
    [user, empresa, membership, loading, error, setupRequired]
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
