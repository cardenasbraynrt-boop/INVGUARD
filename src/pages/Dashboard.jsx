import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  FiArrowRight,
  FiBox,
  FiCalendar,
  FiCheckCircle,
  FiDollarSign,
  FiPlus,
  FiRefreshCw,
  FiRepeat,
  FiTrendingDown,
} from "react-icons/fi";

import { useTenant } from "../context/TenantContext";
import { fetchActiveProducts } from "../services/productQueries";
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
  toNumber,
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

function ActionCard({ tone = "teal", title, body, to, action }) {
  const tones = {
    teal: "border-teal-400/25 bg-teal-400/10 text-teal-100",
    amber: "border-amber-400/25 bg-amber-400/10 text-amber-100",
    red: "border-red-400/25 bg-red-400/10 text-red-100",
    sky: "border-sky-400/25 bg-sky-400/10 text-sky-100",
    emerald: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
  };

  return (
    <Link
      to={to}
      className={`flex h-full flex-col justify-between rounded-lg border p-5 transition hover:bg-white/[0.04] ${tones[tone]}`}
    >
      <div>
        <h3 className="font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-300">{body}</p>
      </div>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">
        {action}
        <FiArrowRight className="h-4 w-4" />
      </span>
    </Link>
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
        .limit(500),
      supabase
        .from("producto_lotes")
        .select("id,empresa_id,producto_id,codigo_lote,proveedor,fecha_ingreso,fecha_vencimiento,cantidad_inicial,cantidad_actual,created_at, productos(nombre, codigo, precio_compra, precio_venta)")
        .eq("empresa_id", empresaId)
        .gt("cantidad_actual", 0)
        .order("fecha_vencimiento", { ascending: true })
        .limit(500),
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
  }, [empresaId]);

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

  const lotesPorVencer7 = useMemo(
    () =>
      lotes.filter((lote) => {
        const state = getExpiryState(lote);
        return state.days !== null && state.days >= 0 && state.days <= 7;
      }),
    [lotes]
  );

  const dineroEnRiesgo = useMemo(
    () =>
      lotesEnRiesgo.reduce(
        (total, lote) =>
          total +
          toNumber(lote.cantidad_actual) *
            toNumber(
              lote.productos?.precio_compra || lote.productos?.precio_venta
            ),
        0
      ),
    [lotesEnRiesgo]
  );

  const accionesHoy = useMemo(() => {
    const acciones = [];

    if (!loading && productos.length === 0) {
      acciones.push({
        tone: "teal",
        title: "Agrega tu primer producto",
        body: "Empieza con los productos que mas se mueven. Luego podras registrar entradas, salidas y vencimientos.",
        to: "/inventario",
        action: "Ir a inventario",
      });
    }

    if (stats.stockBajo.length) {
      acciones.push({
        tone: "amber",
        title: `${stats.stockBajo.length} productos necesitan reposicion`,
        body: "Revisa el stock bajo antes de quedarte sin productos para vender o atender.",
        to: "/inventario",
        action: "Ver stock bajo",
      });
    }

    if (lotesVencidos.length) {
      acciones.push({
        tone: "red",
        title: `${lotesVencidos.length} lotes vencidos`,
        body: "Confirma las perdidas por vencimiento para mantener el stock limpio y confiable.",
        to: "/perdidas",
        action: "Revisar perdidas",
      });
    }

    if (lotesPorVencer7.length) {
      acciones.push({
        tone: "sky",
        title: `${lotesPorVencer7.length} lotes vencen esta semana`,
        body: "Prioriza su venta o revisa si corresponde separarlos antes de perder dinero.",
        to: "/perdidas",
        action: "Ver vencimientos",
      });
    }

    if (!loading && productos.length > 0 && movimientos.length === 0) {
      acciones.push({
        tone: "emerald",
        title: "Registra tu primer movimiento",
        body: "Usa entradas para compras o salidas para ventas, consumos y ajustes.",
        to: "/movimientos",
        action: "Registrar ahora",
      });
    }

    return acciones;
  }, [loading, productos.length, movimientos.length, stats.stockBajo.length, lotesVencidos.length, lotesPorVencer7.length]);

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
            Lo importante de hoy
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Inicio
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Revisa primero stock bajo, vencimientos y movimientos recientes.
            Si algo necesita accion, aparecera aqui.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/movimientos"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
          >
            <FiRepeat className="h-4 w-4" />
            Registrar movimiento
          </Link>
          <Link
            to="/inventario"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            <FiPlus className="h-4 w-4" />
            Agregar producto
          </Link>
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
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Que hacer ahora</h2>
            <p className="mt-1 text-sm text-neutral-400">
              InvGuard ordena las alertas para que atiendas primero lo urgente.
            </p>
          </div>
        </div>

        {accionesHoy.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {accionesHoy.map((accion) => (
              <ActionCard key={accion.title} {...accion} />
            ))}
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4 text-emerald-50 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <FiCheckCircle className="mt-0.5 h-5 w-5 text-emerald-200" />
              <div>
                <p className="font-semibold">Todo se ve en orden</p>
                <p className="mt-1 text-sm text-emerald-100/80">
                  No hay stock bajo ni vencimientos urgentes con los datos actuales.
                </p>
              </div>
            </div>
            <Link
              to="/movimientos"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200/30 px-3 py-2 text-sm font-semibold text-emerald-50 hover:bg-emerald-200/10"
            >
              Registrar movimiento
              <FiArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric
          icon={FiBox}
          label="Productos registrados"
          value={loading ? "..." : numberFormat.format(stats.productos)}
        />
        <Metric
          icon={FiRefreshCw}
          label="Unidades en stock"
          value={loading ? "..." : numberFormat.format(stats.stockTotal)}
        />
        <Metric
          icon={FiDollarSign}
          label="Valor para vender"
          value={loading ? "..." : money.format(stats.valorInventario)}
          tone="text-emerald-200"
        />
        <Metric
          icon={FiAlertTriangle}
          label="Stock bajo"
          value={
            loading ? "..." : numberFormat.format(stats.stockBajo.length)
          }
          tone={stats.stockBajo.length ? "text-amber-200" : "text-white"}
        />
        <Metric
          icon={FiCalendar}
          label="Por vencer"
          value={loading ? "..." : numberFormat.format(lotesEnRiesgo.length)}
          tone={lotesVencidos.length ? "text-red-200" : "text-sky-200"}
        />
        <Metric
          icon={FiTrendingDown}
          label="Dinero en riesgo"
          value={loading ? "..." : money.format(dineroEnRiesgo)}
          tone={dineroEnRiesgo ? "text-red-200" : "text-white"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.8fr]">
        <ChartCard title="Donde se pierde dinero" badge="Mes actual">
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

        <ChartCard title="Movimiento por categoria" badge="Categorias">
          <Bar data={movimientoChart} options={chartOptions} />
        </ChartCard>

        <ChartCard title="Actividad reciente" badge="Reciente">
          <Line data={trendChart} options={chartOptions} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-white/10 bg-neutral-900">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-lg font-semibold">Ultimos movimientos</h2>
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
                      Todavia no hay movimientos. Registra una entrada o salida para empezar.
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
              <h2 className="text-lg font-semibold">Dinero en inventario</h2>
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
              <div className="flex justify-between gap-4">
                <span className="text-neutral-400">Costo en riesgo</span>
                <span className={dineroEnRiesgo ? "text-red-200" : ""}>
                  {money.format(dineroEnRiesgo)}
                </span>
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
              <h2 className="text-lg font-semibold">Productos para reponer</h2>
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
                  No hay productos con stock bajo.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-neutral-900">
            <div className="border-b border-white/10 p-5">
              <h2 className="text-lg font-semibold">Vencimientos cercanos</h2>
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
                  No hay lotes por vencer en los proximos 30 dias.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
