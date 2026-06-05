import { useEffect, useMemo, useState } from "react";
import {
  FiDownload,
  FiSave,
  FiSearch,
  FiShield,
  FiTrendingDown,
} from "react-icons/fi";

import { useTenant } from "../context/TenantContext";
import { supabase } from "../services/supabase";
import { registrarMovimientoInventario } from "../services/inventoryApi";
import {
  downloadCsv,
  formatDate,
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
  const [movimientos, setMovimientos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [productoSeleccionado, setProductoSeleccionado] =
    useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
        .select("*, productos(nombre, codigo, precio_compra, precio_venta)")
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
      alert("Seleccione un producto.");
      return;
    }

    if (cantidad <= 0) {
      alert("La cantidad debe ser mayor a cero.");
      return;
    }

    setSaving(true);

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
      alert(getSupabaseMessage(perdidaError));
      return;
    }

    limpiarFormulario();
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
            Control preventivo
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Perdidas
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Registra mermas, robos, vencimientos y ajustes como salidas
            controladas.
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
          label="Eventos de perdida"
          value={numberFormat.format(perdidas.length)}
        />
        <Metric
          label="Unidades afectadas"
          value={numberFormat.format(unidadesPerdidas)}
        />
        <Metric
          label="Costo estimado"
          value={money.format(costoEstimado)}
        />
      </div>

      <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
        <div className="flex items-center gap-3">
          <FiShield className="h-5 w-5 text-teal-300" />
          <h2 className="text-lg font-semibold">Registrar perdida</h2>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_160px_190px_1fr_auto]">
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
                      Stock {producto.stock}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

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

          <select
            value={form.motivo}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                motivo: event.target.value,
              }))
            }
            className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
          >
            {motivos.map((motivo) => (
              <option key={motivo} value={motivo}>
                {motivo}
              </option>
            ))}
          </select>

          <input
            placeholder="Detalle"
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
            onClick={registrarPerdida}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-300"
          >
            <FiSave className="h-4 w-4" />
            {saving ? "Guardando..." : "Registrar"}
          </button>
        </div>

        {productoSeleccionado && (
          <p className="mt-4 rounded-lg border border-white/10 bg-neutral-950 p-3 text-sm text-neutral-300">
            Producto seleccionado:{" "}
            <span className="font-medium text-white">
              {productoSeleccionado.nombre}
            </span>{" "}
            con stock actual de {productoSeleccionado.stock}.
          </p>
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
                    className="px-5 py-8 text-center text-neutral-400"
                  >
                    Aun no hay perdidas registradas.
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
