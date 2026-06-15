import { supabase } from "./supabase";

function isMissingRpc(error) {
  return (
    error?.code === "PGRST202" ||
    String(error?.message || "")
      .toLowerCase()
      .includes("could not find the function")
  );
}

export async function registrarMovimientoInventario({
  empresaId,
  productoId,
  tipo,
  cantidad,
  observacion,
  fechaVencimiento,
  codigoLote,
  proveedor,
}) {
  const wantsLot =
    tipo === "ENTRADA" &&
    Boolean(fechaVencimiento || codigoLote || proveedor);

  const rpcResult = await supabase.rpc("registrar_movimiento_lote", {
    p_empresa_id: empresaId,
    p_producto_id: productoId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_observacion: observacion,
    p_fecha_vencimiento: fechaVencimiento || null,
    p_codigo_lote: codigoLote || "",
    p_proveedor: proveedor || "",
  });

  if (!rpcResult.error) {
    return {
      data: rpcResult.data,
      error: null,
      mode: "rpc",
    };
  }

  if (!isMissingRpc(rpcResult.error)) {
    return {
      data: null,
      error: rpcResult.error,
      mode: "rpc",
    };
  }

  if (wantsLot) {
    return {
      data: null,
      error: new Error(
        "Para registrar lotes y vencimientos ejecuta supabase/lotes_vencimientos.sql."
      ),
      mode: "rpc",
    };
  }

  const legacyRpcResult = await supabase.rpc("registrar_movimiento", {
    p_empresa_id: empresaId,
    p_producto_id: productoId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_observacion: observacion,
  });

  if (!legacyRpcResult.error) {
    return {
      data: legacyRpcResult.data,
      error: null,
      mode: "rpc",
    };
  }

  if (!isMissingRpc(legacyRpcResult.error)) {
    return {
      data: null,
      error: legacyRpcResult.error,
      mode: "rpc",
    };
  }

  return {
    data: null,
    error: new Error(
      "Falta activar las funciones seguras de inventario. Ejecuta supabase/multi_tenant.sql y supabase/lotes_vencimientos.sql."
    ),
    mode: "rpc",
  };
}

export async function registrarPerdidaLote({
  empresaId,
  loteId,
  cantidad,
  observacion,
}) {
  const rpcResult = await supabase.rpc("registrar_perdida_lote", {
    p_empresa_id: empresaId,
    p_lote_id: loteId,
    p_cantidad: cantidad || null,
    p_observacion: observacion || "",
  });

  return {
    data: rpcResult.data,
    error: rpcResult.error,
    mode: "rpc",
  };
}
