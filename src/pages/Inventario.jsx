import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertTriangle,
  FiBox,
  FiDownload,
  FiEdit2,
  FiPlus,
  FiSave,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import { useTenant } from "../context/TenantContext";
import { fetchActiveProducts, isMissingHardening } from "../services/productQueries";
import { supabase } from "../services/supabase";
import {
  cleanText,
  downloadCsv,
  formatDateOnly,
  generateProductCode,
  getCategoryOptions,
  getExpiryState,
  getStockState,
  getSupabaseMessage,
  money,
  normalizeCategoryName,
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
  codigo_lote: "",
  proveedor: "",
  fecha_vencimiento: "",
  nueva_categoria: "",
};

const pageSize = 50;
const requireAuth = import.meta.env.VITE_REQUIRE_AUTH !== "false";

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-neutral-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export default function Inventario() {
  const { empresaId, isSuperAdmin, membership, user } = useTenant();
  const [productos, setProductos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("TODAS");
  const [quickFilter, setQuickFilter] = useState("TODOS");
  const [page, setPage] = useState(1);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const canManageProducts =
    !requireAuth ||
    isSuperAdmin ||
    ["ADMIN", "SUPERVISOR"].includes(membership?.rol);
  const canDeleteProducts =
    !requireAuth || isSuperAdmin || membership?.rol === "ADMIN";

  async function cargarProductos() {
    if (!empresaId) {
      setProductos([]);
      setLotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const [productosResult, lotesResult] = await Promise.all([
      fetchActiveProducts(empresaId),
      supabase
        .from("producto_lotes")
        .select(
          "id,empresa_id,producto_id,codigo_lote,proveedor,fecha_ingreso,fecha_vencimiento,cantidad_inicial,cantidad_actual,created_at,updated_at"
        )
        .eq("empresa_id", empresaId)
        .gt("cantidad_actual", 0)
        .order("fecha_vencimiento", { ascending: true }),
    ]);

    if (productosResult.error) {
      setError(getSupabaseMessage(productosResult.error));
      setLoading(false);
      return;
    }

    setProductos(productosResult.data || []);
    setLotes(lotesResult.error ? [] : lotesResult.data || []);

    if (lotesResult.error) {
      setError(
        "Para usar lotes y vencimientos ejecuta supabase/lotes_vencimientos.sql."
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    cargarProductos();
  }, [empresaId]);

  const categoryOptions = useMemo(
    () => getCategoryOptions(productos),
    [productos]
  );
  const categorias = useMemo(
    () => ["TODAS", ...categoryOptions],
    [categoryOptions]
  );

  const categoryInput =
    form.categoria === "__NUEVA__" ? form.nueva_categoria : form.categoria;
  const normalizedFormCategory = normalizeCategoryName(
    categoryInput,
    categoryOptions
  );
  const autoProductCode = productoEditando
    ? form.codigo || "Se mantiene el codigo actual"
    : generateProductCode({
        productos,
        categoria: normalizedFormCategory,
        nombre: form.nombre,
      });

  const lotesPorProducto = useMemo(() => {
    return lotes.reduce((map, lote) => {
      const current = map.get(lote.producto_id) || [];
      current.push(lote);
      map.set(lote.producto_id, current);
      return map;
    }, new Map());
  }, [lotes]);

  const lotesConAlerta = useMemo(
    () =>
      lotes.filter((lote) => {
        const state = getExpiryState(lote);
        return state.days !== null && state.days >= 0 && state.days <= 30;
      }),
    [lotes]
  );

  const lotesVencidos = useMemo(
    () =>
      lotes.filter((lote) => {
        const state = getExpiryState(lote);
        return state.days !== null && state.days < 0;
      }),
    [lotes]
  );

  const productosPorVencerIds = useMemo(
    () => new Set(lotesConAlerta.map((lote) => lote.producto_id)),
    [lotesConAlerta]
  );

  const productosVencidosIds = useMemo(
    () => new Set(lotesVencidos.map((lote) => lote.producto_id)),
    [lotesVencidos]
  );

  const quickFilterOptions = useMemo(
    () => [
      {
        value: "TODOS",
        label: "Todos",
        count: productos.length,
      },
      {
        value: "SIN_STOCK",
        label: "Sin stock",
        count: productos.filter((product) => toNumber(product.stock) <= 0)
          .length,
      },
      {
        value: "STOCK_BAJO",
        label: "Stock bajo",
        count: productos.filter(
          (product) =>
            toNumber(product.stock) > 0 &&
            toNumber(product.stock) <= toNumber(product.stock_minimo)
        ).length,
      },
      {
        value: "POR_VENCER",
        label: "Por vencer",
        count: productosPorVencerIds.size,
      },
      {
        value: "VENCIDOS",
        label: "Vencidos",
        count: productosVencidosIds.size,
      },
      {
        value: "SIN_LOTE",
        label: "Sin lote",
        count: productos.filter((product) => !lotesPorProducto.has(product.id))
          .length,
      },
    ],
    [productos, productosPorVencerIds, productosVencidosIds, lotesPorProducto]
  );

  const productosFiltrados = useMemo(() => {
    const term = query.trim().toLowerCase();

    return productos.filter((product) => {
      const productCategory = normalizeCategoryName(
        product.categoria,
        categoryOptions
      );
      const matchesText = [
        product.codigo,
        product.nombre,
        productCategory,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);

      const matchesCategory =
        category === "TODAS" || productCategory === category;

      const matchesQuickFilter =
        quickFilter === "TODOS" ||
        (quickFilter === "SIN_STOCK" && toNumber(product.stock) <= 0) ||
        (quickFilter === "STOCK_BAJO" &&
          toNumber(product.stock) > 0 &&
          toNumber(product.stock) <= toNumber(product.stock_minimo)) ||
        (quickFilter === "POR_VENCER" &&
          productosPorVencerIds.has(product.id)) ||
        (quickFilter === "VENCIDOS" &&
          productosVencidosIds.has(product.id)) ||
        (quickFilter === "SIN_LOTE" && !lotesPorProducto.has(product.id));

      return matchesText && matchesCategory && matchesQuickFilter;
    });
  }, [
    productos,
    query,
    category,
    quickFilter,
    productosPorVencerIds,
    productosVencidosIds,
    lotesPorProducto,
    categoryOptions,
  ]);

  useEffect(() => {
    setPage(1);
  }, [query, category, quickFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(productosFiltrados.length / pageSize)
  );
  const safePage = Math.min(page, totalPages);
  const productosPaginados = productosFiltrados.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

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

    if (form.categoria === "__NUEVA__" && !form.nueva_categoria.trim()) {
      return "Escribe el nombre de la nueva categoria o elige una existente.";
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

    if (
      !productoEditando &&
      (form.fecha_vencimiento || form.codigo_lote || form.proveedor) &&
      toNumber(form.stock) <= 0
    ) {
      return "Para crear un lote inicial necesitas stock mayor a cero.";
    }

    return "";
  }

  async function guardarProducto() {
    if (!canManageProducts) {
      setError("Tu rol puede revisar inventario, pero no modificar productos.");
      return;
    }

    const validationError = validarFormulario();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    const resolvedCategory = normalizeCategoryName(categoryInput, categoryOptions);
    const resolvedCode = productoEditando
      ? cleanText(form.codigo) ||
        generateProductCode({
          productos: productos.filter((product) => product.id !== productoEditando),
          categoria: resolvedCategory,
          nombre: form.nombre,
        })
      : generateProductCode({
          productos,
          categoria: resolvedCategory,
          nombre: form.nombre,
        });

    const payload = {
      empresa_id: empresaId,
      codigo: resolvedCode,
      nombre: cleanText(form.nombre),
      categoria: resolvedCategory,
      stock: toNumber(form.stock),
      stock_minimo: toNumber(form.stock_minimo),
      precio_compra: toNumber(form.precio_compra),
      precio_venta: toNumber(form.precio_venta),
      activo: true,
      updated_by: user?.id || null,
    };

    if (!productoEditando) {
      payload.created_by = user?.id || null;
    }

    const request = productoEditando
      ? supabase.from("productos").update(payload).eq("id", productoEditando)
      : supabase.from("productos").insert([payload]).select("*").single();

    const { data: savedProduct, error: saveError } = await request;

    if (saveError) {
      if (isMissingHardening(saveError)) {
        setSaving(false);
        setError(
          "Falta ejecutar supabase/hardening.sql para guardar con auditoria, soft delete y permisos avanzados."
        );
        return;
      }

      setSaving(false);
      setError(getSupabaseMessage(saveError));
      return;
    }

    if (
      !productoEditando &&
      savedProduct?.id &&
      toNumber(form.stock) > 0 &&
      (form.fecha_vencimiento || form.codigo_lote || form.proveedor)
    ) {
      const { error: loteError } = await supabase.from("producto_lotes").insert([
        {
          empresa_id: empresaId,
          producto_id: savedProduct.id,
          codigo_lote: cleanText(form.codigo_lote) || null,
          proveedor: cleanText(form.proveedor) || null,
          fecha_vencimiento: form.fecha_vencimiento || null,
          cantidad_inicial: toNumber(form.stock),
          cantidad_actual: toNumber(form.stock),
          created_by: user?.id || null,
        },
      ]);

      if (loteError) {
        setSaving(false);
        setError(getSupabaseMessage(loteError));
        return;
      }
    }

    setSaving(false);
    limpiarFormulario();
    await cargarProductos();
  }

  function editarProducto(producto) {
    setProductoEditando(producto.id);
    setMostrarFormulario(true);
    setForm({
      codigo: producto.codigo || "",
      nombre: producto.nombre || "",
      categoria: normalizeCategoryName(producto.categoria, categoryOptions),
      stock: String(producto.stock ?? ""),
      stock_minimo: String(producto.stock_minimo ?? ""),
      precio_compra: String(producto.precio_compra ?? ""),
      precio_venta: String(producto.precio_venta ?? ""),
      codigo_lote: "",
      proveedor: "",
      fecha_vencimiento: "",
      nueva_categoria: "",
    });
  }

  async function eliminarProducto(producto) {
    if (!canDeleteProducts) {
      setError("Solo un ADMIN puede eliminar productos.");
      return;
    }

    const confirmar = window.confirm(
      `Ocultar ${producto.nombre} del inventario? Sus movimientos quedaran en el historial.`
    );

    if (!confirmar) return;

    const { error: deleteError } = await supabase.rpc("soft_delete_producto", {
      p_empresa_id: empresaId,
      p_producto_id: producto.id,
    });

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
        categoria: normalizeCategoryName(product.categoria, categoryOptions),
        stock: product.stock,
        stock_minimo: product.stock_minimo,
        precio_compra: product.precio_compra,
        precio_venta: product.precio_venta,
        proximo_vencimiento:
          lotesPorProducto.get(product.id)?.[0]?.fecha_vencimiento || "",
      }))
    );
  }

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-300">
            Lista de productos
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Inventario
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Agrega productos, define stock minimo y usa fecha de vencimiento
            cuando el producto pueda caducar.
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
            disabled={!canManageProducts}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
          >
            <FiPlus className="h-4 w-4" />
            Agregar producto
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          <p className="text-sm text-neutral-400">Vencen pronto</p>
          <p className="mt-2 text-3xl font-semibold">
            {numberFormat.format(lotesConAlerta.length)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <p className="text-sm text-neutral-400">Vencidos</p>
          <p
            className={`mt-2 text-3xl font-semibold ${
              lotesVencidos.length ? "text-red-200" : ""
            }`}
          >
            {numberFormat.format(lotesVencidos.length)}
          </p>
        </div>
      </div>

      {(lotesVencidos.length > 0 || lotesConAlerta.length > 0) && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
              <div>
                <p className="font-semibold text-amber-50">
                  Hay productos que necesitan revision
                </p>
                <p className="mt-1 text-sm text-amber-100/80">
                  {lotesVencidos.length > 0
                    ? `${lotesVencidos.length} lotes ya vencieron.`
                    : `${lotesConAlerta.length} lotes vencen dentro de 30 dias.`}{" "}
                  Revisa la pantalla de perdidas antes de venderlos o descontarlos.
                </p>
              </div>
            </div>
            <Link
              to="/perdidas"
              className="inline-flex items-center justify-center rounded-lg border border-amber-200/30 px-3 py-2 text-sm font-semibold text-amber-50 hover:bg-amber-200/10"
            >
              Revisar vencimientos
            </Link>
          </div>
        </div>
      )}

      {mostrarFormulario && (
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">
              {productoEditando ? "Editar producto" : "Agregar producto"}
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

          <div className="space-y-5">
            <div>
              <p className="mb-3 text-sm font-semibold text-neutral-200">
                Datos del producto
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <Field
                  label="Codigo automatico"
                  hint={
                    productoEditando
                      ? "Puedes conservarlo para no cambiar reportes anteriores."
                      : "InvGuard lo crea al guardar para evitar codigos repetidos."
                  }
                >
                  {productoEditando ? (
                    <input
                      className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                      value={form.codigo}
                      onChange={(event) =>
                        updateForm("codigo", event.target.value)
                      }
                    />
                  ) : (
                    <div className="rounded-lg border border-teal-400/20 bg-teal-400/10 px-3 py-2 text-sm font-semibold text-teal-100">
                      {autoProductCode}
                    </div>
                  )}
                </Field>
                <Field label="Nombre del producto">
                  <input
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                    placeholder="Ej. Arroz 5 kg"
                    value={form.nombre}
                    onChange={(event) => updateForm("nombre", event.target.value)}
                  />
                </Field>
                <Field label="Categoria">
                  <div className="space-y-2">
                    <select
                      className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                      value={
                        form.categoria === "__NUEVA__"
                          ? "__NUEVA__"
                          : categoryOptions.includes(form.categoria)
                            ? form.categoria
                            : ""
                      }
                      onChange={(event) => {
                        updateForm("categoria", event.target.value);
                        if (event.target.value !== "__NUEVA__") {
                          updateForm("nueva_categoria", "");
                        }
                      }}
                    >
                      <option value="">Sin categoria</option>
                      {categoryOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                      <option value="__NUEVA__">+ Crear nueva categoria</option>
                    </select>
                    {form.categoria === "__NUEVA__" && (
                      <input
                        className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                        placeholder="Nombre de nueva categoria"
                        value={form.nueva_categoria}
                        onChange={(event) =>
                          updateForm("nueva_categoria", event.target.value)
                        }
                      />
                    )}
                  </div>
                </Field>
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-neutral-200">
                Stock y precios
              </p>
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Stock actual">
                  <input
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                    placeholder="0"
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(event) => updateForm("stock", event.target.value)}
                  />
                </Field>
                <Field label="Avisar cuando quede">
                  <input
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                    placeholder="5"
                    type="number"
                    min="0"
                    value={form.stock_minimo}
                    onChange={(event) =>
                      updateForm("stock_minimo", event.target.value)
                    }
                  />
                </Field>
                <Field label="Costo de compra">
                  <input
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                    placeholder="0.00"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.precio_compra}
                    onChange={(event) =>
                      updateForm("precio_compra", event.target.value)
                    }
                  />
                </Field>
                <Field label="Precio de venta">
                  <input
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                    placeholder="0.00"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.precio_venta}
                    onChange={(event) =>
                      updateForm("precio_venta", event.target.value)
                    }
                  />
                </Field>
              </div>
            </div>

            {!productoEditando && (
              <div className="rounded-lg border border-sky-400/20 bg-sky-400/10 p-4">
                <p className="text-sm font-semibold text-sky-50">
                  Lote y vencimiento inicial
                </p>
                <p className="mt-1 text-sm text-sky-100/80">
                  Usalo en alimentos, medicinas, cosmeticos o productos que vencen.
                  Si no aplica, dejalo vacio.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Lote">
                    <input
                      className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                      placeholder="Ej. L-2026-01"
                      value={form.codigo_lote}
                      onChange={(event) =>
                        updateForm("codigo_lote", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Proveedor">
                    <input
                      className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                      placeholder="Nombre del proveedor"
                      value={form.proveedor}
                      onChange={(event) =>
                        updateForm("proveedor", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Fecha de vencimiento">
                    <input
                      className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                      type="date"
                      value={form.fecha_vencimiento}
                      onChange={(event) =>
                        updateForm("fecha_vencimiento", event.target.value)
                      }
                    />
                  </Field>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={limpiarFormulario}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarProducto}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400"
              >
                <FiSave className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar producto"}
              </button>
            </div>
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

        <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-4 py-3">
          {quickFilterOptions.map((item) => {
            const active = quickFilter === item.value;

            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setQuickFilter(item.value)}
                className={`flex min-w-max items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  active
                    ? "border-teal-300 bg-teal-400/15 text-teal-100"
                    : "border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{item.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    active
                      ? "bg-teal-300 text-neutral-950"
                      : "bg-white/10 text-neutral-300"
                  }`}
                >
                  {numberFormat.format(item.count)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-white/[0.03] text-left text-neutral-400">
              <tr>
                <th className="px-5 py-3 font-medium">Codigo</th>
                <th className="px-5 py-3 font-medium">Producto</th>
                <th className="px-5 py-3 font-medium">Categoria</th>
                <th className="px-5 py-3 font-medium">Stock</th>
                <th className="px-5 py-3 font-medium">Minimo</th>
                <th className="px-5 py-3 font-medium">Costo</th>
                <th className="px-5 py-3 font-medium">Venta</th>
                <th className="px-5 py-3 font-medium">Vencimiento</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 text-right font-medium">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {productosPaginados.map((product) => {
                const state = getStockState(product);
                const nextLot = lotesPorProducto.get(product.id)?.[0];
                const expiryState = getExpiryState(nextLot);
                const productCategory = normalizeCategoryName(
                  product.categoria,
                  categoryOptions
                );

                return (
                  <tr key={product.id}>
                    <td className="px-5 py-3 text-neutral-300">
                      {product.codigo || "-"}
                    </td>
                    <td className="px-5 py-3 font-medium">
                      {product.nombre}
                    </td>
                    <td className="px-5 py-3 text-neutral-300">
                      {productCategory || "-"}
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
                      {nextLot ? (
                        <div className="space-y-1">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${expiryState.className}`}
                          >
                            {expiryState.label}
                          </span>
                          <p className="text-xs text-neutral-500">
                            {formatDateOnly(nextLot.fecha_vencimiento)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-neutral-500">Sin lote</span>
                      )}
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
                          disabled={!canManageProducts}
                          className="rounded-lg border border-white/10 p-2 text-neutral-300 hover:bg-white/10"
                          aria-label="Editar producto"
                        >
                          <FiEdit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarProducto(product)}
                          disabled={!canDeleteProducts}
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
                    colSpan="10"
                    className="px-0 py-0"
                  >
                    {productos.length === 0 ? (
                      <EmptyState
                        icon={FiBox}
                        title="Agrega tu primer producto"
                        body="Empieza con los productos que mas vendes o usas. Luego podras controlar stock, precios y vencimientos."
                        actionLabel="Agregar producto"
                        actionIcon={FiPlus}
                        disabled={!canManageProducts}
                        onAction={() => {
                          setProductoEditando(null);
                          setForm(emptyForm);
                          setMostrarFormulario(true);
                        }}
                      />
                    ) : (
                      <EmptyState
                        icon={FiSearch}
                        title="No encontramos productos con ese filtro"
                        body="Prueba con otro nombre, categoria o cambia el filtro rapido."
                      />
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {productosFiltrados.length > pageSize && (
          <div className="flex flex-col gap-3 border-t border-white/10 p-4 text-sm text-neutral-300 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Mostrando {numberFormat.format((safePage - 1) * pageSize + 1)}-
              {numberFormat.format(
                Math.min(safePage * pageSize, productosFiltrados.length)
              )}{" "}
              de {numberFormat.format(productosFiltrados.length)} productos
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
              >
                Anterior
              </button>
              <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={safePage >= totalPages}
                className="rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
