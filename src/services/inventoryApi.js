import { supabase } from "./supabase";
import { toNumber } from "../utils/inventory";

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

  const { data: producto, error: productoError } = await supabase
    .from("productos")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("id", productoId)
    .single();

  if (productoError || !producto) {
    return {
      data: null,
      error:
        productoError ||
        new Error("No se pudo encontrar el producto."),
      mode: "fallback",
    };
  }

  let nuevoStock = toNumber(producto.stock);

  if (tipo === "ENTRADA") {
    nuevoStock += cantidad;
  }

  if (tipo === "SALIDA") {
    nuevoStock -= cantidad;
  }

  if (nuevoStock < 0) {
    return {
      data: null,
      error: new Error("Stock insuficiente."),
      mode: "fallback",
    };
  }

  const { error: movimientoError } = await supabase
    .from("movimientos")
    .insert([
      {
        empresa_id: empresaId,
        producto_id: productoId,
        tipo,
        cantidad,
        observacion,
      },
    ]);

  if (movimientoError) {
    return {
      data: null,
      error: movimientoError,
      mode: "fallback",
    };
  }

  const { error: stockError } = await supabase
    .from("productos")
    .update({ stock: nuevoStock })
    .eq("empresa_id", empresaId)
    .eq("id", productoId);

  return {
    data: stockError ? null : { stock_actual: nuevoStock },
    error: stockError,
    mode: "fallback",
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
