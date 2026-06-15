import { supabase } from "./supabase";

export const productColumns =
  "id,empresa_id,codigo,nombre,categoria,stock,stock_minimo,precio_compra,precio_venta,created_at,updated_at,activo,deleted_at";

export function isMissingHardening(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("deleted_at") ||
    message.includes("activo") ||
    message.includes("updated_at") ||
    message.includes("created_by") ||
    message.includes("updated_by")
  );
}

export async function fetchActiveProducts(empresaId) {
  const modernResult = await supabase
    .from("productos")
    .select(productColumns)
    .eq("empresa_id", empresaId)
    .eq("activo", true)
    .is("deleted_at", null)
    .order("nombre");

  if (!modernResult.error) {
    return {
      ...modernResult,
      hardeningMissing: false,
    };
  }

  if (!isMissingHardening(modernResult.error)) {
    return {
      ...modernResult,
      hardeningMissing: false,
    };
  }

  const legacyResult = await supabase
    .from("productos")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("nombre");

  return {
    ...legacyResult,
    hardeningMissing: !legacyResult.error,
  };
}
