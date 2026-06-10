import { useEffect, useMemo, useState } from "react";
import {
  ArcElement,
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
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  FiAlertTriangle,
  FiBox,
  FiCalendar,
  FiDollarSign,
  FiRefreshCw,
  FiTrendingDown,
} from "react-icons/fi";

import { useTenant } from "../context/TenantContext";
import { supabase } from "../services/supabase";
import {
  calculateStats,
  formatDate,
  formatDateOnly,
  groupByCategory,
  getExpiryState,
  getProductName,
  getStockState,
  getSupabaseMessage,
  money,
  numberFormat,
} from "../utils/inventory";

ChartJS.register(
  ArcElement,
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

function Metric({ icon: Icon, label, value, tone = "text-white" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-neutral-400">{label}</p>
        <Icon className="h-5 w-5 text-teal-300" />
      </div>
      <p className={`mt-3 text-3xl font-semibold ${tone}`}>
        {value}
      </p>
    </div>
  );
}

function ChartCard({ title, badge, children }) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {badge && (
          <span className="rounded-full border border-teal-400/25 bg-teal-400/10 px-2.5 py-1 text-xs text-teal-100">
            {badge}
          </span>
        )}
      </div>
      <div className="h-64">{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const { empresaId } = useTenant();
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function cargarDashboard() {
    setLoading(true);
    setError("");

    const [productosResult, movimientosResult, lotesResult] = await Promise.all([
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
      supabase
        .from("producto_lotes")
        .select("*, productos(nombre, codigo, precio_compra, precio_venta)")
        .eq("empresa_id", empresaId)
        .gt("cantidad_actual", 0)
        .order("fecha_vencimiento", { ascending: true }),
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
    cargarDashboard();
  }, []);

  const stats = useMemo(
    () => calculateStats(productos, movimientos),
    [productos, movimientos]
  );

  const margenEstimado =
    stats.valorInventario - stats.costoInventario;

  const lotesEnRiesgo = useMemo(
    () =>
      lotes.filter((lote) => {
        const state = getExpiryState(lote);
        return state.days !== null && state.days <= 30;
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

  const categoryStats = useMemo(
    () => Array.from(groupByCategory(productos, movimientos).values()),
    [productos, movimientos]
  );

  const perdidasChart = {
    labels: categoryStats.map((item) => item.categoria),
    datasets: [
      {
        label: "Costo de perdida",
        data: categoryStats.map((item) => item.costoPerdida),
        backgroundColor: [
          "#14b8a6",
          "#f59e0b",
          "#ef4444",
          "#38bdf8",
          "#a3e635",
          "#f97316",
        ],
        borderWidth: 0,
      },
    ],
  };

  const movimientoChart = {
    labels: categoryStats.map((item) => item.categoria),
    datasets: [
      {
        label: "Entradas",
        data: categoryStats.map((item) => item.entradas),
        backgroundColor: "rgba(20,184,166,0.75)",
        borderRadius: 4,
      },
      {
        label: "Salidas",
        data: categoryStats.map((item) => item.salidas),
        backgroundColor: "rgba(245,158,11,0.72)",
        borderRadius: 4,
      },
    ],
  };

  const recentMovements = movimientos.slice(0, 8).reverse();
  const trendChart = {
    labels: recentMovements.map((movement) =>
      new Date(movement.created_at).toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "2-digit",
      })
    ),
    datasets: [
      {
        label: "Cantidad",
        data: recentMovements.map((movement) =>
          movement.tipo === "SALIDA"
            ? -Number(movement.cantidad)
            : Number(movement.cantidad)
        ),
        borderColor: "#14b8a6",
        backgroundColor: "rgba(20,184,166,0.12)",
        pointBackgroundColor: "#14b8a6",
        fill: true,
        tension: 0.35,
      },
    ],
  };

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-300">
            Operacion en tiempo real
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Inventario, stock critico, movimientos y valor operativo.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarDashboard}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric
          icon={FiBox}
          label="Productos"
          value={loading ? "..." : numberFormat.format(stats.productos)}
        />
        <Metric
          icon={FiRefreshCw}
          label="Unidades en stock"
          value={loading ? "..." : numberFormat.format(stats.stockTotal)}
        />
        <Metric
          icon={FiDollarSign}
          label="Valor de inventario"
          value={loading ? "..." : money.format(stats.valorInventario)}
          tone="text-emerald-200"
        />
        <Metric
          icon={FiAlertTriangle}
          label="Productos criticos"
          value={
            loading ? "..." : numberFormat.format(stats.stockBajo.length)
          }
          tone={stats.stockBajo.length ? "text-amber-200" : "text-white"}
        />
        <Metric
          icon={FiCalendar}
          label="Vencimientos"
          value={loading ? "..." : numberFormat.format(lotesEnRiesgo.length)}
          tone={lotesVencidos.length ? "text-red-200" : "text-sky-200"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.8fr]">
        <ChartCard title="Perdidas por categoria" badge="Mes actual">
          <Doughnut
            data={perdidasChart}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: "62%",
              plugins: chartOptions.plugins,
            }}
          />
        </ChartCard>

        <ChartCard title="Entradas y salidas" badge="Categorias">
          <Bar data={movimientoChart} options={chartOptions} />
        </ChartCard>

        <ChartCard title="Tendencia operativa" badge="Reciente">
          <Line data={trendChart} options={chartOptions} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-white/10 bg-neutral-900">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-lg font-semibold">Movimientos recientes</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
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
                {movimientos.slice(0, 8).map((movement) => (
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
                      Aun no hay movimientos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Resumen financiero</h2>
              <FiTrendingDown className="h-5 w-5 text-teal-300" />
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-neutral-400">Costo inventario</span>
                <span>{money.format(stats.costoInventario)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-neutral-400">Valor venta</span>
                <span>{money.format(stats.valorInventario)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-white/10 pt-3">
                <span className="text-neutral-400">Margen estimado</span>
                <span className="font-semibold text-emerald-200">
                  {money.format(margenEstimado)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-neutral-900">
            <div className="border-b border-white/10 p-5">
              <h2 className="text-lg font-semibold">Stock critico</h2>
            </div>
            <div className="divide-y divide-white/10">
              {stats.stockBajo.slice(0, 6).map((product) => {
                const state = getStockState(product);

                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div>
                      <p className="font-medium">{product.nombre}</p>
                      <p className="text-sm text-neutral-400">
                        Minimo {product.stock_minimo} / actual {product.stock}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs ${state.className}`}
                    >
                      {state.label}
                    </span>
                  </div>
                );
              })}

              {!loading && stats.stockBajo.length === 0 && (
                <p className="p-5 text-sm text-neutral-400">
                  No hay productos criticos.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-neutral-900">
            <div className="border-b border-white/10 p-5">
              <h2 className="text-lg font-semibold">Vencimientos</h2>
            </div>
            <div className="divide-y divide-white/10">
              {lotesEnRiesgo.slice(0, 6).map((lote) => {
                const state = getExpiryState(lote);

                return (
                  <div
                    key={lote.id}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div>
                      <p className="font-medium">
                        {lote.productos?.nombre || "Producto"}
                      </p>
                      <p className="text-sm text-neutral-400">
                        {numberFormat.format(lote.cantidad_actual)} unid. /{" "}
                        {formatDateOnly(lote.fecha_vencimiento)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs ${state.className}`}
                    >
                      {state.label}
                    </span>
                  </div>
                );
              })}

              {!loading && lotesEnRiesgo.length === 0 && (
                <p className="p-5 text-sm text-neutral-400">
                  No hay lotes por vencer en 30 dias.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
