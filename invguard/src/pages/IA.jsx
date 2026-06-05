import { useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import {
  FiAlertTriangle,
  FiCpu,
  FiDownload,
  FiRefreshCw,
  FiShield,
} from "react-icons/fi";

import { useTenant } from "../context/TenantContext";
import { supabase } from "../services/supabase";
import {
  downloadCsv,
  groupByCategory,
  getProductName,
  getSupabaseMessage,
  money,
  numberFormat,
  toNumber,
} from "../utils/inventory";

ChartJS.register(
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: "#a3a3a3",
        boxWidth: 10,
      },
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(255,255,255,0.05)" },
      ticks: { color: "#737373" },
    },
    y: {
      grid: { color: "rgba(255,255,255,0.05)" },
      ticks: { color: "#737373" },
    },
  },
};

function Priority({ level }) {
  const classes = {
    alta: "border-red-500/30 bg-red-500/10 text-red-100",
    media: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    baja: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs ${classes[level]}`}
    >
      {level}
    </span>
  );
}

export default function IA() {
  const { empresaId } = useTenant();
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function cargarAnalisis() {
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
    cargarAnalisis();
  }, []);

  const analysis = useMemo(() => {
    const lowStock = productos
      .filter(
        (product) =>
          toNumber(product.stock) <= toNumber(product.stock_minimo)
      )
      .map((product) => {
        const target = Math.max(toNumber(product.stock_minimo) * 2, 1);
        const sugerido = Math.max(target - toNumber(product.stock), 1);

        return {
          ...product,
          sugerido,
          inversion:
            sugerido * toNumber(product.precio_compra || product.precio_venta),
        };
      })
      .sort((a, b) => b.sugerido - a.sugerido);

    const lossMovements = movimientos.filter((movement) =>
      String(movement.observacion || "")
        .toLowerCase()
        .includes("perdida")
    );

    const lossByProduct = lossMovements.reduce((map, movement) => {
      const key = movement.producto_id;
      const current = map.get(key) || {
        product: movement.productos,
        unidades: 0,
        eventos: 0,
        costo: 0,
      };

      current.unidades += toNumber(movement.cantidad);
      current.eventos += 1;
      current.costo +=
        toNumber(movement.cantidad) *
        toNumber(movement.productos?.precio_compra);

      map.set(key, current);
      return map;
    }, new Map());

    const riskyProducts = Array.from(lossByProduct.values()).sort(
      (a, b) => b.costo - a.costo
    );

    const insights = [];

    if (lowStock.length) {
      insights.push({
        level: "alta",
        title: "Reposicion necesaria",
        body: `${lowStock.length} productos estan en stock bajo o sin stock.`,
      });
    }

    if (riskyProducts.length) {
      insights.push({
        level: "media",
        title: "Perdidas detectadas",
        body: `${riskyProducts.length} productos tienen eventos de perdida registrados.`,
      });
    }

    if (!lowStock.length && !riskyProducts.length) {
      insights.push({
        level: "baja",
        title: "Operacion estable",
        body: "No se detectan alertas criticas con los datos actuales.",
      });
    }

    return {
      lowStock,
      riskyProducts,
      insights,
      categories: Array.from(
        groupByCategory(productos, movimientos).values()
      ),
      totalSuggestedInvestment: lowStock.reduce(
        (total, product) => total + product.inversion,
        0
      ),
    };
  }, [productos, movimientos]);

  function exportarSugerencias() {
    downloadCsv(
      "invguard-reorden-sugerido.csv",
      analysis.lowStock.map((product) => ({
        codigo: product.codigo,
        nombre: product.nombre,
        stock_actual: product.stock,
        stock_minimo: product.stock_minimo,
        cantidad_sugerida: product.sugerido,
        inversion_estimada: product.inversion,
      }))
    );
  }

  const riskChart = {
    labels: analysis.categories.map((item) => item.categoria),
    datasets: [
      {
        label: "Costo de perdida",
        data: analysis.categories.map((item) => item.costoPerdida),
        backgroundColor: "rgba(239,68,68,0.72)",
        borderRadius: 4,
      },
    ],
  };

  const projectionChart = {
    labels: ["Hoy", "D+1", "D+2", "D+3", "D+4", "D+5", "D+6"],
    datasets: [
      {
        label: "Inversion sugerida",
        data: [0, 0.18, 0.32, 0.52, 0.7, 0.86, 1].map(
          (factor) => analysis.totalSuggestedInvestment * factor
        ),
        borderColor: "#14b8a6",
        backgroundColor: "rgba(20,184,166,0.12)",
        fill: true,
        tension: 0.35,
        pointBackgroundColor: "#14b8a6",
      },
    ],
  };

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-300">
            Motor de recomendaciones
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Analisis inteligente
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Alertas operativas calculadas desde inventario y movimientos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={cargarAnalisis}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            <FiRefreshCw className="h-4 w-4" />
            Actualizar
          </button>
          <button
            type="button"
            onClick={exportarSugerencias}
            disabled={!analysis.lowStock.length}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            <FiDownload className="h-4 w-4" />
            Exportar reorden
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
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-400">Alertas</p>
            <FiAlertTriangle className="h-5 w-5 text-amber-300" />
          </div>
          <p className="mt-2 text-3xl font-semibold">
            {numberFormat.format(analysis.insights.length)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-400">Reordenes</p>
            <FiCpu className="h-5 w-5 text-teal-300" />
          </div>
          <p className="mt-2 text-3xl font-semibold">
            {numberFormat.format(analysis.lowStock.length)}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-400">Inversion sugerida</p>
            <FiShield className="h-5 w-5 text-emerald-300" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-emerald-200">
            {money.format(analysis.totalSuggestedInvestment)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Riesgo por categoria</h2>
            <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2.5 py-1 text-xs text-red-100">
              Perdidas
            </span>
          </div>
          <div className="h-64">
            <Bar data={riskChart} options={chartOptions} />
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Proyeccion de compra</h2>
            <span className="rounded-full border border-teal-400/25 bg-teal-400/10 px-2.5 py-1 text-xs text-teal-100">
              7 dias
            </span>
          </div>
          <div className="h-64">
            <Line data={projectionChart} options={chartOptions} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-white/10 bg-neutral-900">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-lg font-semibold">Alertas</h2>
          </div>

          <div className="divide-y divide-white/10">
            {analysis.insights.map((insight) => (
              <div key={insight.title} className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-semibold">{insight.title}</h3>
                  <Priority level={insight.level} />
                </div>
                <p className="text-sm text-neutral-400">{insight.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-900">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-lg font-semibold">Reorden sugerido</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-white/[0.03] text-left text-neutral-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Producto</th>
                  <th className="px-5 py-3 font-medium">Stock</th>
                  <th className="px-5 py-3 font-medium">Minimo</th>
                  <th className="px-5 py-3 font-medium">Comprar</th>
                  <th className="px-5 py-3 font-medium">Inversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {analysis.lowStock.map((product) => (
                  <tr key={product.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium">{product.nombre}</p>
                      <p className="text-xs text-neutral-500">
                        {product.codigo || "Sin codigo"}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      {numberFormat.format(product.stock)}
                    </td>
                    <td className="px-5 py-3">
                      {numberFormat.format(product.stock_minimo)}
                    </td>
                    <td className="px-5 py-3 font-semibold text-teal-200">
                      {numberFormat.format(product.sugerido)}
                    </td>
                    <td className="px-5 py-3">
                      {money.format(product.inversion)}
                    </td>
                  </tr>
                ))}

                {!loading && analysis.lowStock.length === 0 && (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-5 py-8 text-center text-neutral-400"
                    >
                      No hay compras sugeridas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-neutral-900">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">Productos con riesgo</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-white/[0.03] text-left text-neutral-400">
              <tr>
                <th className="px-5 py-3 font-medium">Producto</th>
                <th className="px-5 py-3 font-medium">Eventos</th>
                <th className="px-5 py-3 font-medium">Unidades</th>
                <th className="px-5 py-3 font-medium">Costo estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {analysis.riskyProducts.map((item) => (
                <tr key={getProductName(item.product)}>
                  <td className="px-5 py-3">
                    {getProductName(item.product)}
                  </td>
                  <td className="px-5 py-3">
                    {numberFormat.format(item.eventos)}
                  </td>
                  <td className="px-5 py-3">
                    {numberFormat.format(item.unidades)}
                  </td>
                  <td className="px-5 py-3">{money.format(item.costo)}</td>
                </tr>
              ))}

              {!loading && analysis.riskyProducts.length === 0 && (
                <tr>
                  <td
                    colSpan="4"
                    className="px-5 py-8 text-center text-neutral-400"
                  >
                    No hay productos con perdidas registradas.
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
