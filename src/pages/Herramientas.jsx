import { useEffect, useMemo, useState } from "react";
import {
  FiCopy,
  FiDatabase,
  FiDownload,
  FiFileText,
  FiPackage,
  FiPrinter,
  FiRefreshCw,
  FiSend,
  FiUpload,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import { useTenant } from "../context/TenantContext";
import {
  fetchActiveProducts,
  isMissingHardening,
} from "../services/productQueries";
import { supabase } from "../services/supabase";
import {
  buildWhatsAppUrl,
  cleanText,
  downloadCsv,
  formatDate,
  generateProductCode,
  getCategoryOptions,
  getReorderList,
  getSupabaseMessage,
  money,
  normalizeCategoryName,
  numberFormat,
  parseCsv,
  toNumber,
} from "../utils/inventory";

const businessDefaults = {
  nombre: "Mi negocio",
  contacto: "",
  proveedor: "",
};

const requireAuth = import.meta.env.VITE_REQUIRE_AUTH !== "false";

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export default function Herramientas() {
  const { empresaId, empresa, isSuperAdmin, membership, user } = useTenant();
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [business, setBusiness] = useState(() => {
    const saved = window.localStorage.getItem("invguard-business");
    return saved ? JSON.parse(saved) : businessDefaults;
  });

  const canImportProducts =
    !requireAuth ||
    isSuperAdmin ||
    ["ADMIN", "SUPERVISOR"].includes(membership?.rol);

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
        .limit(2000),
      supabase
        .from("producto_lotes")
        .select("id,empresa_id,producto_id,codigo_lote,proveedor,fecha_ingreso,fecha_vencimiento,cantidad_inicial,cantidad_actual,created_at")
        .eq("empresa_id", empresaId)
        .order("fecha_vencimiento", { ascending: true })
        .limit(2000),
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

  useEffect(() => {
    window.localStorage.setItem(
      "invguard-business",
      JSON.stringify(business)
    );
  }, [business]);

  const categoryOptions = useMemo(
    () => getCategoryOptions(productos),
    [productos]
  );

  const reorden = useMemo(() => getReorderList(productos), [productos]);

  const pedidoTexto = useMemo(() => {
    const lines = [
      `Pedido sugerido - ${business.nombre || empresa?.nombre || "Mi negocio"}`,
      `Fecha: ${new Date().toLocaleDateString("es-PE")}`,
      "",
      ...reorden.map(
        (product) =>
          `- ${product.nombre} (${product.codigo || "s/c"}): ${numberFormat.format(
            product.cantidad_sugerida
          )} unidades`
      ),
    ];

    if (business.proveedor) {
      lines.unshift(`Proveedor: ${business.proveedor}`);
    }

    return lines.join("\n");
  }, [business.nombre, business.proveedor, empresa?.nombre, reorden]);

  const inversionReorden = reorden.reduce(
    (total, product) => total + product.inversion_estimada,
    0
  );

  const ventasSalidas = movimientos
    .filter((movement) => movement.tipo === "SALIDA")
    .reduce((total, movement) => total + toNumber(movement.cantidad), 0);

  async function copiarPedido() {
    await navigator.clipboard.writeText(pedidoTexto);
    alert("Pedido copiado.");
  }

  function abrirWhatsApp() {
    window.open(
      buildWhatsAppUrl(business.contacto, pedidoTexto),
      "_blank",
      "noopener,noreferrer"
    );
  }

  function exportarBackup() {
    const payload = {
      generado_en: new Date().toISOString(),
      empresa_id: empresaId,
      productos,
      movimientos,
      lotes,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "invguard-respaldo.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportarReporte() {
    downloadCsv(
      "invguard-reporte-operativo.csv",
      movimientos.map((movement) => ({
        fecha: movement.created_at,
        producto: movement.productos?.nombre || movement.producto_id,
        tipo: movement.tipo,
        cantidad: movement.cantidad,
        observacion: movement.observacion,
      }))
    );
  }

  async function importarCsv(event) {
    if (!canImportProducts) {
      alert("Tu rol puede ver reportes, pero no importar productos.");
      event.target.value = "";
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const text = await readFile(file);
      const rows = parseCsv(text);
      const existingCodes = new Set(
        productos
          .map((product) => String(product.codigo || "").toLowerCase())
          .filter(Boolean)
      );
      const importCodes = new Set();
      const payload = rows
        .filter((row) => cleanText(row.nombre))
        .reduce((items, row) => {
          const categoria = normalizeCategoryName(row.categoria, categoryOptions);
          const nombre = cleanText(row.nombre);
          const codigo =
            cleanText(row.codigo) ||
            generateProductCode({
              productos: [...productos, ...items],
              categoria,
              nombre,
            });
          const normalizedCode = codigo.toLowerCase();

          if (existingCodes.has(normalizedCode) || importCodes.has(normalizedCode)) {
            throw new Error(
              `Codigo duplicado en importacion: ${codigo}. Corrigelo o deja el codigo vacio para generarlo automaticamente.`
            );
          }

          importCodes.add(normalizedCode);

          items.push({
            empresa_id: empresaId,
            codigo,
            nombre,
            categoria,
            stock: toNumber(row.stock),
            stock_minimo: toNumber(row.stock_minimo),
            precio_compra: toNumber(row.precio_compra),
            precio_venta: toNumber(row.precio_venta),
            activo: true,
            created_by: user?.id || null,
            updated_by: user?.id || null,
          });

          return items;
        }, []);

      if (!payload.length) {
        alert("No se encontraron productos validos.");
        setImporting(false);
        return;
      }

      const { error: importError } = await supabase
        .from("productos")
        .insert(payload);

      if (importError) {
        alert(
          isMissingHardening(importError)
            ? "Falta ejecutar supabase/hardening.sql para importar con auditoria y permisos avanzados."
            : getSupabaseMessage(importError)
        );
        setImporting(false);
        return;
      }

      await cargarDatos();
      alert(`${payload.length} productos importados.`);
    } catch (readError) {
      alert(readError.message);
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-300">
            Reportes y compras
          </p>
          <h1 className="mt-1 text-3xl font-semibold">Reportes</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Exporta movimientos, prepara pedidos de compra y guarda un respaldo
            de productos, movimientos y lotes.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarDatos}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
        >
          <FiRefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <p className="text-sm text-neutral-400">Productos activos</p>
          <p className="mt-2 text-3xl font-semibold">
            {numberFormat.format(productos.length)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <p className="text-sm text-neutral-400">Salidas registradas</p>
          <p className="mt-2 text-3xl font-semibold">
            {numberFormat.format(ventasSalidas)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <p className="text-sm text-neutral-400">Compra sugerida</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-200">
            {money.format(inversionReorden)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <h2 className="text-lg font-semibold">Datos del negocio</h2>

          <div className="mt-5 grid gap-3">
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="Nombre comercial"
              value={business.nombre}
              onChange={(event) =>
                setBusiness((current) => ({
                  ...current,
                  nombre: event.target.value,
                }))
              }
            />
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="WhatsApp proveedor"
              value={business.contacto}
              onChange={(event) =>
                setBusiness((current) => ({
                  ...current,
                  contacto: event.target.value,
                }))
              }
            />
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="Proveedor principal"
              value={business.proveedor}
              onChange={(event) =>
                setBusiness((current) => ({
                  ...current,
                  proveedor: event.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold">Pedido sugerido</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copiarPedido}
                disabled={!reorden.length}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
              >
                <FiCopy className="h-4 w-4" />
                Copiar
              </button>
              <button
                type="button"
                onClick={abrirWhatsApp}
                disabled={!reorden.length}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
              >
                <FiSend className="h-4 w-4" />
                WhatsApp
              </button>
            </div>
          </div>

          <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-white/10 bg-neutral-950">
            {reorden.length ? (
              <pre className="whitespace-pre-wrap p-4 text-sm leading-6 text-neutral-300">
                {pedidoTexto}
              </pre>
            ) : (
              <EmptyState
                icon={FiPackage}
                title="No hay productos para pedir"
                body="El pedido sugerido aparece cuando algun producto esta en stock minimo o por debajo."
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="mb-4 flex items-center gap-3">
            <FiFileText className="h-5 w-5 text-teal-300" />
            <h2 className="text-lg font-semibold">Reportes</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportarReporte}
              disabled={!movimientos.length}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
            >
              <FiDownload className="h-4 w-4" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
            >
              <FiPrinter className="h-4 w-4" />
              Imprimir
            </button>
          </div>
          <p className="mt-4 text-sm text-neutral-400">
            Ultimo movimiento:{" "}
            {movimientos[0] ? formatDate(movimientos[0].created_at) : "-"}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="mb-4 flex items-center gap-3">
            <FiUpload className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold">Importar inventario</h2>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">
            <FiUpload className="h-4 w-4" />
            {importing ? "Importando..." : "Seleccionar CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={importarCsv}
              className="hidden"
              disabled={importing || !canImportProducts}
            />
          </label>
          <p className="mt-4 text-sm text-neutral-400">
            Columnas: codigo, nombre, categoria, stock, stock_minimo,
            precio_compra, precio_venta.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="mb-4 flex items-center gap-3">
            <FiDatabase className="h-5 w-5 text-emerald-300" />
            <h2 className="text-lg font-semibold">Respaldo</h2>
          </div>
          <button
            type="button"
            onClick={exportarBackup}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
          >
            <FiDownload className="h-4 w-4" />
            Descargar JSON
          </button>
          <p className="mt-4 text-sm text-neutral-400">
            Incluye productos, movimientos y lotes con vencimiento.
          </p>
        </div>
      </div>
    </section>
  );
}
