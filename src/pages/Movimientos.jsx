import { useEffect, useMemo, useState } from "react";
import {
  FiDownload,
  FiPackage,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiTrendingDown,
  FiTrendingUp,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import { useTenant } from "../context/TenantContext";
import { fetchActiveProducts } from "../services/productQueries";
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
  codigo_lote: "",
  proveedor: "",
  fecha_vencimiento: "",
};

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-neutral-300">{label}</span>
      {children}
    </label>
  );
}

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
    if (!empresaId) {
      setProductos([]);
      setMovimientos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const [productosResult, movimientosResult] = await Promise.all([
      fetchActiveProducts(empresaId),
      supabase
        .from("movimientos")
        .select("id,empresa_id,producto_id,tipo,cantidad,observacion,created_at, productos(nombre, codigo, stock, stock_minimo)")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(300),
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
  }, [empresaId]);

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
      setError("Busca y selecciona un producto antes de registrar el movimiento.");
      return;
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError("La cantidad debe ser mayor a cero.");
      return;
    }

    const selectedProduct =
      productoSeleccionado ||
      productos.find((product) => Number(product.id) === productoId);

    if (
      form.tipo === "SALIDA" &&
      selectedProduct &&
      cantidad > toNumber(selectedProduct.stock)
    ) {
      setError(
        `No puedes sacar ${numberFormat.format(
          cantidad
        )} unidades. Stock disponible: ${numberFormat.format(
          selectedProduct.stock
        )}.`
      );
      return;
    }

    setSaving(true);
    setError("");

    const { error: movimientoError } =
      await registrarMovimientoInventario({
        empresaId,
        productoId,
        tipo: form.tipo,
        cantidad,
        observacion: form.observacion.trim(),
        codigoLote: form.codigo_lote.trim(),
        proveedor: form.proveedor.trim(),
        fechaVencimiento: form.fecha_vencimiento,
      });

    setSaving(false);

    if (movimientoError) {
      setError(getSupabaseMessage(movimientoError));
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
            Movimiento de stock
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Entradas y salidas
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Registra compras, ventas, consumo interno o ajustes. InvGuard
            actualiza el stock automaticamente.
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
          label="Registros"
          value={numberFormat.format(movimientos.length)}
          tone="text-teal-300"
        />
      </div>

      <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Registrar entrada o salida</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Elige el producto y marca si el stock aumenta o disminuye.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.3fr_220px_150px_1fr_auto]">
          <Field label="Producto">
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-500" />
              <input
                type="text"
                placeholder="Buscar por nombre o codigo"
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
          </Field>

          <Field label="Tipo">
            <div className="grid grid-cols-2 rounded-lg border border-white/10 bg-neutral-950 p-1">
              {[
                ["ENTRADA", "Entrada"],
                ["SALIDA", "Salida"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      tipo: value,
                    }))
                  }
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    form.tipo === value
                      ? value === "ENTRADA"
                        ? "bg-emerald-400 text-neutral-950"
                        : "bg-amber-300 text-neutral-950"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Cantidad">
            <input
              type="number"
              min="1"
              max={
                form.tipo === "SALIDA" && productoSeleccionado
                  ? productoSeleccionado.stock
                  : undefined
              }
              placeholder="0"
              value={form.cantidad}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  cantidad: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Detalle">
            <input
              placeholder="Ej. compra, venta, ajuste"
              value={form.observacion}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  observacion: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
            />
          </Field>

          <div className="flex items-end">
            <button
              type="button"
              onClick={registrarMovimiento}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400"
            >
              <FiSave className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>

        {form.tipo === "ENTRADA" && (
          <div className="mt-4 rounded-lg border border-sky-400/20 bg-sky-400/10 p-4">
            <p className="text-sm font-semibold text-sky-50">
              Datos opcionales de la compra
            </p>
            <p className="mt-1 text-sm text-sky-100/80">
              Completa esto si el producto tiene lote, proveedor o vencimiento.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Field label="Lote">
                <input
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder="Ej. L-2026-01"
                  value={form.codigo_lote}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      codigo_lote: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Proveedor">
                <input
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder="Nombre del proveedor"
                  value={form.proveedor}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      proveedor: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Fecha de vencimiento">
                <input
                  className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                  type="date"
                  value={form.fecha_vencimiento}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      fecha_vencimiento: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
          </div>
        )}

        {productoSeleccionado && (
          <div className="mt-4 rounded-lg border border-white/10 bg-neutral-950 p-4">
            <div className="grid gap-3 md:grid-cols-4">
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
            {form.tipo === "SALIDA" && (
              <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
                Salida maxima sugerida:{" "}
                {numberFormat.format(productoSeleccionado.stock)} unidades.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-neutral-900">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">Historial de entradas y salidas</h2>
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
                    className="px-0 py-0"
                  >
                    <EmptyState
                      icon={FiPackage}
                      title="Aun no hay entradas ni salidas"
                      body={
                        productos.length
                          ? "Busca un producto arriba y registra la primera entrada o salida."
                          : "Primero agrega productos en Inventario para poder mover stock."
                      }
                    />
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
