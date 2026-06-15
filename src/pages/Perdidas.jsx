import { useEffect, useMemo, useState } from "react";
import {
  FiDownload,
  FiPackage,
  FiSave,
  FiSearch,
  FiShield,
  FiTrendingDown,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import { useTenant } from "../context/TenantContext";
import { fetchActiveProducts } from "../services/productQueries";
import { supabase } from "../services/supabase";
import {
  registrarMovimientoInventario,
  registrarPerdidaLote,
} from "../services/inventoryApi";
import {
  downloadCsv,
  formatDate,
  formatDateOnly,
  getExpiryState,
  getProductName,
  getSupabaseMessage,
  money,
  numberFormat,
  toNumber,
} from "../utils/inventory";

const motivos = [
  "Merma",
  "Robo",
  "Vencimiento",
  "Rotura",
  "Ajuste de inventario",
];

const emptyForm = {
  producto_id: "",
  cantidad: "",
  motivo: "Merma",
  observacion: "",
};

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-neutral-300">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

export default function Perdidas() {
  const { empresaId } = useTenant();
  const [productos, setProductos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [productoSeleccionado, setProductoSeleccionado] =
    useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function cargarDatos() {
    if (!empresaId) {
      setProductos([]);
      setMovimientos([]);
      setLotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const [productosResult, movimientosResult, lotesResult] = await Promise.all([
      fetchActiveProducts(empresaId),
      supabase
        .from("movimientos")
        .select("id,empresa_id,producto_id,tipo,cantidad,observacion,created_at, productos(nombre, codigo, precio_compra, precio_venta)")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("producto_lotes")
        .select("id,empresa_id,producto_id,codigo_lote,proveedor,fecha_ingreso,fecha_vencimiento,cantidad_inicial,cantidad_actual,created_at, productos(nombre, codigo, precio_compra, precio_venta, stock)")
        .eq("empresa_id", empresaId)
        .gt("cantidad_actual", 0)
        .order("fecha_vencimiento", { ascending: true })
        .limit(1000),
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
    setLotes(lotesResult.error ? [] : lotesResult.data || []);
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

  const perdidas = useMemo(
    () =>
      movimientos.filter((movement) =>
        String(movement.observacion || "")
          .toLowerCase()
          .includes("perdida")
      ),
    [movimientos]
  );

  const unidadesPerdidas = perdidas.reduce(
    (total, movement) => total + toNumber(movement.cantidad),
    0
  );

  const costoEstimado = perdidas.reduce(
    (total, movement) =>
      total +
      toNumber(movement.cantidad) *
        toNumber(movement.productos?.precio_compra),
    0
  );

  const productosAfectados = new Set(
    perdidas.map((movement) => movement.producto_id)
  ).size;

  const lotesVencidos = useMemo(
    () =>
      lotes.filter((lote) => {
        const state = getExpiryState(lote);
        return state.days !== null && state.days < 0;
      }),
    [lotes]
  );

  const lotesPorVencer = useMemo(
    () =>
      lotes.filter((lote) => {
        const state = getExpiryState(lote);
        return state.days !== null && state.days >= 0 && state.days <= 7;
      }),
    [lotes]
  );

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

  async function registrarPerdida() {
    const cantidad = toNumber(form.cantidad);
    const productoId = Number(form.producto_id);

    if (!productoId) {
      setError("Busca y selecciona el producto afectado.");
      return;
    }

    if (cantidad <= 0) {
      setError("La cantidad perdida debe ser mayor a cero.");
      return;
    }

    const selectedProduct =
      productoSeleccionado ||
      productos.find((product) => Number(product.id) === productoId);

    if (selectedProduct && cantidad > toNumber(selectedProduct.stock)) {
      setError(
        `No puedes registrar ${numberFormat.format(
          cantidad
        )} unidades perdidas. Stock disponible: ${numberFormat.format(
          selectedProduct.stock
        )}.`
      );
      return;
    }

    setSaving(true);
    setError("");

    const observacion = [
      `PERDIDA: ${form.motivo}`,
      form.observacion.trim(),
    ]
      .filter(Boolean)
      .join(" - ");

    const { error: perdidaError } =
      await registrarMovimientoInventario({
        empresaId,
        productoId,
        tipo: "SALIDA",
        cantidad,
        observacion,
      });

    setSaving(false);

    if (perdidaError) {
      setError(getSupabaseMessage(perdidaError));
      return;
    }

    limpiarFormulario();
    await cargarDatos();
  }

  async function registrarPerdidaVencimiento(lote) {
    const cantidadSugerida = Math.min(
      toNumber(lote.cantidad_actual),
      toNumber(lote.productos?.stock)
    );

    if (cantidadSugerida <= 0) {
      setError("Este lote no tiene stock disponible para registrar perdida.");
      return;
    }

    const confirmed = window.confirm(
      `Registrar perdida por vencimiento de ${cantidadSugerida} unidades de ${
        lote.productos?.nombre || "este producto"
      }?`
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");

    const { error: perdidaError } = await registrarPerdidaLote({
      empresaId,
      loteId: lote.id,
      cantidad: cantidadSugerida,
      observacion: "Confirmado desde alerta de vencimiento",
    });

    setSaving(false);

    if (perdidaError) {
      setError(getSupabaseMessage(perdidaError));
      return;
    }

    await cargarDatos();
  }

  function exportarPerdidas() {
    downloadCsv(
      "invguard-perdidas.csv",
      perdidas.map((movement) => ({
        fecha: movement.created_at,
        producto: getProductName(movement.productos),
        cantidad: movement.cantidad,
        costo_estimado:
          toNumber(movement.cantidad) *
          toNumber(movement.productos?.precio_compra),
        observacion: movement.observacion,
      }))
    );
  }

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-300">
            Dinero que se puede perder
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Perdidas
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Confirma vencimientos, mermas, roturas o robos para descontarlos
            del stock con control.
          </p>
        </div>

        <button
          type="button"
          onClick={exportarPerdidas}
          disabled={!perdidas.length}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
        >
          <FiDownload className="h-4 w-4" />
          Exportar
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          label="Perdidas registradas"
          value={numberFormat.format(perdidas.length)}
        />
        <Metric
          label="Unidades perdidas"
          value={numberFormat.format(unidadesPerdidas)}
        />
        <Metric
          label="Costo estimado"
          value={money.format(costoEstimado)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-red-400/20 bg-neutral-900">
          <div className="border-b border-red-400/20 p-5">
            <h2 className="text-lg font-semibold">
              Perdidas sugeridas por vencimiento
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Confirma antes de descontar stock. InvGuard no descuenta a ciegas.
            </p>
          </div>
          <div className="divide-y divide-white/10">
            {lotesVencidos.map((lote) => {
              const state = getExpiryState(lote);
              const cantidadSugerida = Math.min(
                toNumber(lote.cantidad_actual),
                toNumber(lote.productos?.stock)
              );

              return (
                <div
                  key={lote.id}
                  className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {lote.productos?.nombre || "Producto"}
                    </p>
                    <p className="text-sm text-neutral-400">
                      Lote {lote.codigo_lote || "-"} / vence{" "}
                      {formatDateOnly(lote.fecha_vencimiento)} /{" "}
                      {numberFormat.format(cantidadSugerida)} unid.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs ${state.className}`}
                    >
                      {state.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => registrarPerdidaVencimiento(lote)}
                      disabled={saving || cantidadSugerida <= 0}
                      className="rounded-lg bg-red-400 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Confirmar perdida
                    </button>
                  </div>
                </div>
              );
            })}

            {!loading && lotesVencidos.length === 0 && (
              <EmptyState
                icon={FiShield}
                title="No hay lotes vencidos pendientes"
                body="Cuando un lote venza, aparecera aqui para que confirmes la perdida antes de descontar stock."
              />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-5">
          <h2 className="text-lg font-semibold text-amber-50">
            Vencen esta semana
          </h2>
          <div className="mt-4 space-y-3">
            {lotesPorVencer.slice(0, 5).map((lote) => {
              const state = getExpiryState(lote);

              return (
                <div
                  key={lote.id}
                  className="rounded-lg border border-white/10 bg-neutral-950/50 p-3"
                >
                  <p className="font-medium">{lote.productos?.nombre}</p>
                  <p className="mt-1 text-sm text-amber-100/80">
                    {numberFormat.format(lote.cantidad_actual)} unid. /{" "}
                    {state.label}
                  </p>
                </div>
              );
            })}

            {!loading && lotesPorVencer.length === 0 && (
              <p className="text-sm text-amber-100/80">
                No hay lotes venciendo esta semana.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
        <div className="flex items-center gap-3">
          <FiShield className="h-5 w-5 text-teal-300" />
          <h2 className="text-lg font-semibold">Registrar perdida</h2>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_150px_190px_1fr_auto]">
          <Field label="Producto afectado">
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
                        Stock {producto.stock}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          <Field label="Cantidad">
            <input
              type="number"
              min="1"
              max={productoSeleccionado ? productoSeleccionado.stock : undefined}
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

          <Field label="Motivo">
            <select
              value={form.motivo}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  motivo: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
            >
              {motivos.map((motivo) => (
                <option key={motivo} value={motivo}>
                  {motivo}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Detalle">
            <input
              placeholder="Ej. envase roto, producto vencido"
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
              onClick={registrarPerdida}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-300"
            >
              <FiSave className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>

        {productoSeleccionado && (
          <div className="mt-4 rounded-lg border border-white/10 bg-neutral-950 p-4 text-sm text-neutral-300">
            <p>
              Producto seleccionado:{" "}
              <span className="font-medium text-white">
                {productoSeleccionado.nombre}
              </span>{" "}
              con stock actual de {productoSeleccionado.stock}.
            </p>
            <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-amber-100">
              Perdida maxima permitida:{" "}
              {numberFormat.format(productoSeleccionado.stock)} unidades.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-neutral-900">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">Historial de perdidas</h2>
          <FiTrendingDown className="h-5 w-5 text-amber-300" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-white/[0.03] text-left text-neutral-400">
              <tr>
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Producto</th>
                <th className="px-5 py-3 font-medium">Cantidad</th>
                <th className="px-5 py-3 font-medium">Costo estimado</th>
                <th className="px-5 py-3 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {perdidas.map((movement) => (
                <tr key={movement.id}>
                  <td className="px-5 py-3 text-neutral-300">
                    {formatDate(movement.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    {getProductName(movement.productos)}
                  </td>
                  <td className="px-5 py-3">
                    {numberFormat.format(movement.cantidad)}
                  </td>
                  <td className="px-5 py-3">
                    {money.format(
                      toNumber(movement.cantidad) *
                        toNumber(movement.productos?.precio_compra)
                    )}
                  </td>
                  <td className="px-5 py-3 text-neutral-400">
                    {movement.observacion}
                  </td>
                </tr>
              ))}

              {!loading && perdidas.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
                    className="px-0 py-0"
                  >
                    <EmptyState
                      icon={FiPackage}
                      title="Aun no hay perdidas registradas"
                      body="Cuando confirmes una merma, robo, rotura o vencimiento, quedara registrado aqui."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
        Productos afectados por perdidas: {productosAfectados}.
      </div>
    </section>
  );
}
