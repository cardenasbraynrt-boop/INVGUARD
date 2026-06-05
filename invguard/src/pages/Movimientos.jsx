import { useEffect, useMemo, useState } from "react";
import {
  FiDownload,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiTrendingDown,
  FiTrendingUp,
} from "react-icons/fi";

import { useTenant } from "../context/TenantContext";
import { supabase } from "../services/supabase";
import { registrarMovimientoInventario } from "../services/inventoryApi";
import {
  downloadCsv,
  formatDate,
  getProductName,
  getStockState,
  getSupabaseMessage,
  numberFormat,
  toNumber,
} from "../utils/inventory";

const emptyForm = {
  producto_id: "",
  tipo: "ENTRADA",
  cantidad: "",
  observacion: "",
};

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-neutral-400">{label}</p>
        <Icon className={`h-5 w-5 ${tone}`} />
      </div>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

export default function Movimientos() {
  const { empresaId } = useTenant();
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [productoSeleccionado, setProductoSeleccionado] =
    useState(null);
  const [form, setForm] = useState(emptyForm);

  async function cargarDatos() {
    setLoading(true);
    setError("");

    const [productosResult, movimientosResult] = await Promise.all([
      supabase
        .from("productos")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("nombre"),
      supabase
        .from("movimientos")
        .select("*, productos(nombre, codigo, stock, stock_minimo)")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false }),
    ]);

    if (productosResult.error || movimientosResult.error) {
      setError(
        getSupabaseMessage(
          productosResult.error || movimientosResult.error
        )
      );
      setLoading(false);
      return;
    }

    setProductos(productosResult.data || []);
    setMovimientos(movimientosResult.data || []);
    setLoading(false);
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  const productosFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();

    if (!term) return [];

    return productos
      .filter((product) =>
        [product.codigo, product.nombre, product.categoria]
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 8);
  }, [productos, busqueda]);

  const totalEntradas = movimientos
    .filter((movement) => movement.tipo === "ENTRADA")
    .reduce((total, movement) => total + toNumber(movement.cantidad), 0);

  const totalSalidas = movimientos
    .filter((movement) => movement.tipo === "SALIDA")
    .reduce((total, movement) => total + toNumber(movement.cantidad), 0);

  function seleccionarProducto(producto) {
    setProductoSeleccionado(producto);
    setBusqueda(producto.nombre);
    setForm((current) => ({
      ...current,
      producto_id: producto.id,
    }));
  }

  function limpiarFormulario() {
    setBusqueda("");
    setProductoSeleccionado(null);
    setForm(emptyForm);
  }

  async function registrarMovimiento() {
    const cantidad = toNumber(form.cantidad);
    const productoId = Number(form.producto_id);

    if (!productoId) {
      alert("Seleccione un producto.");
      return;
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      alert("La cantidad debe ser mayor a cero.");
      return;
    }

    setSaving(true);

    const { error: movimientoError } =
      await registrarMovimientoInventario({
        empresaId,
        productoId,
        tipo: form.tipo,
        cantidad,
        observacion: form.observacion.trim(),
      });

    setSaving(false);

    if (movimientoError) {
      alert(getSupabaseMessage(movimientoError));
      return;
    }

    limpiarFormulario();
    await cargarDatos();
  }

  function exportarMovimientos() {
    downloadCsv(
      "invguard-movimientos.csv",
      movimientos.map((movement) => ({
        fecha: movement.created_at,
        producto: getProductName(movement.productos),
        tipo: movement.tipo,
        cantidad: movement.cantidad,
        observacion: movement.observacion,
      }))
    );
  }

  const selectedState = productoSeleccionado
    ? getStockState(productoSeleccionado)
    : null;

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-300">
            Kardex operativo
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Movimientos
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Entradas, salidas y actualizacion automatica de stock.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={cargarDatos}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            <FiRefreshCw className="h-4 w-4" />
            Actualizar
          </button>
          <button
            type="button"
            onClick={exportarMovimientos}
            disabled={!movimientos.length}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            <FiDownload className="h-4 w-4" />
            Exportar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          icon={FiTrendingUp}
          label="Entradas"
          value={numberFormat.format(totalEntradas)}
          tone="text-emerald-300"
        />
        <Metric
          icon={FiTrendingDown}
          label="Salidas"
          value={numberFormat.format(totalSalidas)}
          tone="text-amber-300"
        />
        <Metric
          icon={FiRefreshCw}
          label="Movimientos"
          value={numberFormat.format(movimientos.length)}
          tone="text-teal-300"
        />
      </div>

      <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
        <h2 className="text-lg font-semibold">Registrar movimiento</h2>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_180px_160px_1fr_auto]">
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Buscar producto"
              value={busqueda}
              onChange={(event) => {
                setBusqueda(event.target.value);
                setProductoSeleccionado(null);
                setForm((current) => ({
                  ...current,
                  producto_id: "",
                }));
              }}
              className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2 pl-10 pr-3 text-sm"
            />

            {productosFiltrados.length > 0 && !productoSeleccionado && (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-white/10 bg-neutral-950 shadow-xl">
                {productosFiltrados.map((producto) => (
                  <button
                    key={producto.id}
                    type="button"
                    onClick={() => seleccionarProducto(producto)}
                    className="block w-full px-4 py-3 text-left text-sm hover:bg-white/10"
                  >
                    <span className="font-medium">{producto.nombre}</span>
                    <span className="ml-2 text-neutral-500">
                      {producto.codigo || "Sin codigo"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={form.tipo}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                tipo: event.target.value,
              }))
            }
            className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
          >
            <option value="ENTRADA">Entrada</option>
            <option value="SALIDA">Salida</option>
          </select>

          <input
            type="number"
            min="1"
            placeholder="Cantidad"
            value={form.cantidad}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                cantidad: event.target.value,
              }))
            }
            className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
          />

          <input
            placeholder="Observacion"
            value={form.observacion}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                observacion: event.target.value,
              }))
            }
            className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={registrarMovimiento}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400"
          >
            <FiSave className="h-4 w-4" />
            {saving ? "Guardando..." : "Registrar"}
          </button>
        </div>

        {productoSeleccionado && (
          <div className="mt-4 grid gap-3 rounded-lg border border-white/10 bg-neutral-950 p-4 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-neutral-500">Producto</p>
              <p className="mt-1 font-medium">{productoSeleccionado.nombre}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-neutral-500">Codigo</p>
              <p className="mt-1">{productoSeleccionado.codigo || "-"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-neutral-500">Stock</p>
              <p className="mt-1 font-medium">
                {numberFormat.format(productoSeleccionado.stock)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-neutral-500">Estado</p>
              <span
                className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs ${selectedState.className}`}
              >
                {selectedState.label}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-neutral-900">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">Historial</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-white/[0.03] text-left text-neutral-400">
              <tr>
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Producto</th>
                <th className="px-5 py-3 font-medium">Tipo</th>
                <th className="px-5 py-3 font-medium">Cantidad</th>
                <th className="px-5 py-3 font-medium">Observacion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {movimientos.map((movement) => (
                <tr key={movement.id}>
                  <td className="px-5 py-3 text-neutral-300">
                    {formatDate(movement.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    {getProductName(movement.productos)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        movement.tipo === "ENTRADA"
                          ? "text-emerald-300"
                          : "text-amber-300"
                      }
                    >
                      {movement.tipo}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {numberFormat.format(movement.cantidad)}
                  </td>
                  <td className="px-5 py-3 text-neutral-400">
                    {movement.observacion || "-"}
                  </td>
                </tr>
              ))}

              {!loading && movimientos.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
                    className="px-5 py-8 text-center text-neutral-400"
                  >
                    No hay movimientos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
