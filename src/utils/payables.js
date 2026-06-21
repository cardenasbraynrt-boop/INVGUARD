import { toNumber } from "./inventory.js";

export function toDateInput(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function addDaysToDate(days, value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

export function getPayableState(account, today = new Date()) {
  if (account?.estado === "PAGADO" || toNumber(account?.saldo) <= 0) {
    return {
      key: "PAGADO",
      label: "Pagado",
      days: null,
      className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    };
  }

  if (account?.estado === "ANULADO") {
    return {
      key: "ANULADO",
      label: "Anulado",
      days: null,
      className: "border-white/10 bg-white/5 text-neutral-300",
    };
  }

  const target = new Date(`${account?.fecha_vencimiento}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.ceil((target.getTime() - start.getTime()) / 86400000);

  if (days < 0) {
    return {
      key: "VENCIDO",
      label: `${Math.abs(days)} dias vencido`,
      days,
      className: "border-red-400/30 bg-red-400/10 text-red-100",
    };
  }

  if (days === 0) {
    return {
      key: "HOY",
      label: "Vence hoy",
      days,
      className: "border-amber-300/35 bg-amber-300/10 text-amber-100",
    };
  }

  if (days <= toNumber(account?.recordatorio_dias)) {
    return {
      key: "PROXIMO",
      label: `Vence en ${days} dias`,
      days,
      className: "border-sky-400/25 bg-sky-400/10 text-sky-100",
    };
  }

  return {
    key: account?.estado === "PARCIAL" ? "PARCIAL" : "PENDIENTE",
    label: account?.estado === "PARCIAL" ? "Pago parcial" : "Pendiente",
    days,
    className: "border-white/10 bg-white/5 text-neutral-300",
  };
}

export function summarizePayables(accounts = [], today = new Date()) {
  return accounts.reduce(
    (summary, account) => {
      const state = getPayableState(account, today);
      const balance = toNumber(account.saldo);

      if (!["PAGADO", "ANULADO"].includes(state.key)) {
        summary.pending += balance;
        summary.open += 1;
      }

      if (state.key === "VENCIDO") {
        summary.overdue += balance;
        summary.overdueCount += 1;
      }

      if (["HOY", "PROXIMO"].includes(state.key)) {
        summary.dueSoon += balance;
        summary.dueSoonCount += 1;
      }

      return summary;
    },
    {
      pending: 0,
      overdue: 0,
      dueSoon: 0,
      open: 0,
      overdueCount: 0,
      dueSoonCount: 0,
    }
  );
}

export function isPayablesSetupMissing(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("cuentas_por_pagar") ||
    message.includes("proveedores") ||
    message.includes("pagos_proveedor") ||
    message.includes("registrar_pago_proveedor")
  );
}
