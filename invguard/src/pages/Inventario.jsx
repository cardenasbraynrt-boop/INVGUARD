import { useEffect, useMemo, useState } from "react";
import {
  FiDownload,
  FiEdit2,
  FiPlus,
  FiSave,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";

import { useTenant } from "../context/TenantContext";
import { supabase } from "../services/supabase";
import {
  downloadCsv,
  getStockState,
  getSupabaseMessage,
  money,
  numberFormat,
  toNumber,
} from "../utils/inventory";

const emptyForm = {
  codigo: "",
  nombre: "",
  categoria: "",
  stock: "",
  stock_minimo: "",
  precio_compra: "",
  precio_venta: "",
};

export default function Inventario() {
  const { empresaId } = useTenant();
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("TODAS");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [form, setForm] = useState(emptyForm);

  async function cargarProductos() {
    setLoading(true);
    setError("");

    const { data, error: productsError } = await supabase
      .from("productos")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("nombre");

    if (productsError) {
      setError(getSupabaseMessage(productsError));
      setLoading(false);
      return;
    }

    setProductos(data || []);
    setLoading(false);
  }

  useEffect(() => {
    cargarProductos();
  }, []);

  const categorias = useMemo(() => {
    const values = productos
      .map((product) => product.categoria)
      .filter(Boolean);
    return ["TODAS", ...Array.from(new Set(values)).sort()];
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    const term = query.trim().toLowerCase();

    return productos.filter((product) => {
      const matchesText = [
        product.codigo,
        product.nombre,
        product.categoria,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);

      const matchesCategory =
        category === "TODAS" || product.categoria === category;

      return matchesText && matchesCategory;
    });
  }, [productos, query, category]);

  const valorTotal = productos.reduce(
    (total, product) =>
      total +
      toNumber(product.stock) * toNumber(product.precio_venta),
    0
  );

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function limpiarFormulario() {
    setForm(emptyForm);
    setProductoEditando(null);
    setMostrarFormulario(false);
  }

  function validarFormulario() {
    if (!form.nombre.trim()) {
      return "El nombre del producto es obligatorio.";
    }

    if (toNumber(form.stock) < 0) {
      return "El stock no puede ser negativo.";
    }

    if (toNumber(form.stock_minimo) < 0) {
      return "El stock minimo no puede ser negativo.";
    }

    if (toNumber(form.precio_compra) < 0 || toNumber(form.precio_venta) < 0) {
      return "Los precios no pueden ser negativos.";
    }

    return "";
  }

  async function guardarProducto() {
    const validationError = validarFormulario();

    if (validationError) {
      alert(validationError);
      return;
    }

    setSaving(true);

    const payload = {
      empresa_id: empresaId,
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim(),
      stock: toNumber(form.stock),
      stock_minimo: toNumber(form.stock_minimo),
      precio_compra: toNumber(form.precio_compra),
      precio_venta: toNumber(form.precio_venta),
    };

    const request = productoEditando
      ? supabase
          .from("productos")
          .update(payload)
          .eq("id", productoEditando)
      : supabase.from("productos").insert([payload]);

    const { error: saveError } = await request;

    setSaving(false);

    if (saveError) {
      alert(getSupabaseMessage(saveError));
      return;
    }

    limpiarFormulario();
    await cargarProductos();
  }

  function editarProducto(producto) {
    setProductoEditando(producto.id);
    setMostrarFormulario(true);
    setForm({
      codigo: producto.codigo || "",
      nombre: producto.nombre || "",
      categoria: producto.categoria || "",
      stock: String(producto.stock ?? ""),
      stock_minimo: String(producto.stock_minimo ?? ""),
      precio_compra: String(producto.precio_compra ?? ""),
      precio_venta: String(producto.precio_venta ?? ""),
    });
  }

  async function eliminarProducto(producto) {
    const confirmar = window.confirm(
      `Eliminar ${producto.nombre}? Esta accion no se puede deshacer.`
    );

    if (!confirmar) return;

    const { error: deleteError } = await supabase
      .from("productos")
      .delete()
      .eq("id", producto.id);

    if (deleteError) {
      alert(getSupabaseMessage(deleteError));
      return;
    }

    await cargarProductos();
  }

  function exportarInventario() {
    downloadCsv(
      "invguard-inventario.csv",
      productosFiltrados.map((product) => ({
        codigo: product.codigo,
        nombre: product.nombre,
        categoria: product.categoria,
        stock: product.stock,
        stock_minimo: product.stock_minimo,
        precio_compra: product.precio_compra,
        precio_venta: product.precio_venta,
      }))
    );
  }

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-300">
            Control de productos
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Inventario
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Productos, costos, precios, niveles minimos y estado de stock.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportarInventario}
            disabled={!productosFiltrados.length}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            <FiDownload className="h-4 w-4" />
            Exportar
          </button>
          <button
            type="button"
            onClick={() => {
              setProductoEditando(null);
              setForm(emptyForm);
              setMostrarFormulario(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
          >
            <FiPlus className="h-4 w-4" />
            Nuevo producto
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <p className="text-sm text-neutral-400">Productos</p>
          <p className="mt-2 text-3xl font-semibold">
            {numberFormat.format(productos.length)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <p className="text-sm text-neutral-400">Valor venta</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-200">
            {money.format(valorTotal)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <p className="text-sm text-neutral-400">Resultados filtrados</p>
          <p className="mt-2 text-3xl font-semibold">
            {numberFormat.format(productosFiltrados.length)}
          </p>
        </div>
      </div>

      {mostrarFormulario && (
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">
              {productoEditando ? "Editar producto" : "Nuevo producto"}
            </h2>
            <button
              type="button"
              onClick={limpiarFormulario}
              className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar formulario"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="Codigo"
              value={form.codigo}
              onChange={(event) => updateForm("codigo", event.target.value)}
            />
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="Nombre"
              value={form.nombre}
              onChange={(event) => updateForm("nombre", event.target.value)}
            />
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="Categoria"
              value={form.categoria}
              onChange={(event) =>
                updateForm("categoria", event.target.value)
              }
            />
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="Stock"
              type="number"
              min="0"
              value={form.stock}
              onChange={(event) => updateForm("stock", event.target.value)}
            />
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="Stock minimo"
              type="number"
              min="0"
              value={form.stock_minimo}
              onChange={(event) =>
                updateForm("stock_minimo", event.target.value)
              }
            />
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="Precio compra"
              type="number"
              min="0"
              step="0.01"
              value={form.precio_compra}
              onChange={(event) =>
                updateForm("precio_compra", event.target.value)
              }
            />
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="Precio venta"
              type="number"
              min="0"
              step="0.01"
              value={form.precio_venta}
              onChange={(event) =>
                updateForm("precio_venta", event.target.value)
              }
            />
            <button
              type="button"
              onClick={guardarProducto}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400"
            >
              <FiSave className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-neutral-900">
        <div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-[1fr_220px]">
          <label className="relative block">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2 pl-10 pr-3 text-sm"
              placeholder="Buscar por codigo, producto o categoria"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <select
            className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categorias.map((item) => (
              <option key={item} value={item}>
                {item === "TODAS" ? "Todas las categorias" : item}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-white/[0.03] text-left text-neutral-400">
              <tr>
                <th className="px-5 py-3 font-medium">Codigo</th>
                <th className="px-5 py-3 font-medium">Producto</th>
                <th className="px-5 py-3 font-medium">Categoria</th>
                <th className="px-5 py-3 font-medium">Stock</th>
                <th className="px-5 py-3 font-medium">Minimo</th>
                <th className="px-5 py-3 font-medium">Costo</th>
                <th className="px-5 py-3 font-medium">Venta</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 text-right font-medium">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {productosFiltrados.map((product) => {
                const state = getStockState(product);

                return (
                  <tr key={product.id}>
                    <td className="px-5 py-3 text-neutral-300">
                      {product.codigo || "-"}
                    </td>
                    <td className="px-5 py-3 font-medium">
                      {product.nombre}
                    </td>
                    <td className="px-5 py-3 text-neutral-300">
                      {product.categoria || "-"}
                    </td>
                    <td className="px-5 py-3">
                      {numberFormat.format(product.stock)}
                    </td>
                    <td className="px-5 py-3 text-neutral-300">
                      {numberFormat.format(product.stock_minimo)}
                    </td>
                    <td className="px-5 py-3">
                      {money.format(toNumber(product.precio_compra))}
                    </td>
                    <td className="px-5 py-3">
                      {money.format(toNumber(product.precio_venta))}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs ${state.className}`}
                      >
                        {state.label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => editarProducto(product)}
                          className="rounded-lg border border-white/10 p-2 text-neutral-300 hover:bg-white/10"
                          aria-label="Editar producto"
                        >
                          <FiEdit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarProducto(product)}
                          className="rounded-lg border border-red-500/30 p-2 text-red-200 hover:bg-red-500/10"
                          aria-label="Eliminar producto"
                        >
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && productosFiltrados.length === 0 && (
                <tr>
                  <td
                    colSpan="9"
                    className="px-5 py-8 text-center text-neutral-400"
                  >
                    No hay productos para mostrar.
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
