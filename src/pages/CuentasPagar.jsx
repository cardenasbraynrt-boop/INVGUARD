import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiCreditCard,
  FiDollarSign,
  FiFileText,
  FiMail,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiTruck,
  FiUsers,
  FiX,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import { useTenant } from "../context/TenantContext";
import { supabase } from "../services/supabase";
import {
  formatDate,
  formatDateOnly,
  getSupabaseMessage,
  money,
  numberFormat,
  toNumber,
} from "../utils/inventory";
import {
  addDaysToDate,
  getPayableState,
  isPayablesSetupMissing,
  summarizePayables,
  toDateInput,
} from "../utils/payables";

const requireAuth = import.meta.env.VITE_REQUIRE_AUTH !== "false";

const emptyProvider = {
  nombre: "",
  documento: "",
  contacto: "",
  telefono: "",
  email: "",
  notas: "",
};

const emptyAccount = {
  proveedor_id: "",
  concepto: "",
  documento_ref: "",
  fecha_emision: toDateInput(),
  fecha_vencimiento: addDaysToDate(30),
  total: "",
  recordatorio_dias: "3",
  notas: "",
};

const emptyPayment = {
  monto: "",
  fecha_pago: toDateInput(),
  medio: "TRANSFERENCIA",
  referencia: "",
  notas: "",
};

const filterOptions = [
  ["ABIERTAS", "Por pagar"],
  ["VENCIDAS", "Vencidas"],
  ["PROXIMAS", "Proximas"],
  ["PAGADAS", "Pagadas"],
  ["TODAS", "Todas"],
];

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-neutral-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

function Metric({ icon: Icon, label, value, tone = "text-white" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-neutral-400">{label}</p>
        <Icon className="h-5 w-5 text-teal-300" />
      </div>
      <p className={`mt-2 break-words text-2xl font-semibold ${tone}`}>
        {value}
      </p>
    </div>
  );
}

function PayableBadge({ account }) {
  const state = getPayableState(account);
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${state.className}`}>
      {state.label}
    </span>
  );
}

export default function CuentasPagar() {
  const { empresaId, isSuperAdmin, membership, user } = useTenant();
  const [view, setView] = useState("CUENTAS");
  const [filter, setFilter] = useState("ABIERTAS");
  const [query, setQuery] = useState("");
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [setupMissing, setSetupMissing] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [providerForm, setProviderForm] = useState(emptyProvider);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [paymentForm, setPaymentForm] = useState(emptyPayment);

  const canManage =
    !requireAuth ||
    isSuperAdmin ||
    ["ADMIN", "SUPERVISOR"].includes(membership?.rol);

  async function loadData() {
    if (!empresaId) {
      setProviders([]);
      setAccounts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setSetupMissing(false);

    const [providersResult, accountsResult] = await Promise.all([
      supabase
        .from("proveedores")
        .select("id,empresa_id,nombre,documento,contacto,telefono,email,notas,activo,created_at,updated_at")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("nombre"),
      supabase
        .from("cuentas_por_pagar")
        .select("id,empresa_id,proveedor_id,concepto,documento_ref,fecha_emision,fecha_vencimiento,total,saldo,estado,recordatorio_dias,notas,created_at,updated_at, proveedor:proveedores(id,nombre,telefono,email,contacto), pagos:pagos_proveedor(id,monto,fecha_pago,medio,referencia,notas,created_at)")
        .eq("empresa_id", empresaId)
        .order("fecha_vencimiento", { ascending: true })
        .limit(1000),
    ]);

    const loadError = providersResult.error || accountsResult.error;
    if (loadError) {
      if (isPayablesSetupMissing(loadError)) {
        setSetupMissing(true);
      } else {
        setError(getSupabaseMessage(loadError));
      }
      setLoading(false);
      return;
    }

    setProviders(providersResult.data || []);
    setAccounts(accountsResult.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [empresaId]);

  const summary = useMemo(() => summarizePayables(accounts), [accounts]);

  const visibleAccounts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return accounts.filter((account) => {
      const state = getPayableState(account);
      const matchesFilter =
        filter === "TODAS" ||
        (filter === "ABIERTAS" && !["PAGADO", "ANULADO"].includes(state.key)) ||
        (filter === "VENCIDAS" && state.key === "VENCIDO") ||
        (filter === "PROXIMAS" && ["HOY", "PROXIMO"].includes(state.key)) ||
        (filter === "PAGADAS" && state.key === "PAGADO");
      const matchesText = [
        account.proveedor?.nombre,
        account.concepto,
        account.documento_ref,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
      return matchesFilter && matchesText;
    });
  }, [accounts, filter, query]);

  function resetNotices() {
    setError("");
    setMessage("");
  }

  function openAccountForm() {
    resetNotices();
    setAccountForm({
      ...emptyAccount,
      proveedor_id: providers[0]?.id ? String(providers[0].id) : "",
      fecha_emision: toDateInput(),
      fecha_vencimiento: addDaysToDate(30),
    });
    setShowAccountForm(true);
    setShowProviderForm(false);
    setSelectedAccount(null);
  }

  function openProviderForm() {
    resetNotices();
    setProviderForm(emptyProvider);
    setShowProviderForm(true);
    setShowAccountForm(false);
    setSelectedAccount(null);
  }

  async function saveProvider() {
    if (!canManage) return;
    if (!providerForm.nombre.trim()) {
      setError("Escribe el nombre del proveedor.");
      return;
    }

    setSaving(true);
    resetNotices();
    const { data, error: saveError } = await supabase
      .from("proveedores")
      .insert([
        {
          empresa_id: empresaId,
          nombre: providerForm.nombre.trim(),
          documento: providerForm.documento.trim() || null,
          contacto: providerForm.contacto.trim() || null,
          telefono: providerForm.telefono.trim() || null,
          email: providerForm.email.trim().toLowerCase() || null,
          notas: providerForm.notas.trim() || null,
          created_by: user?.id || null,
          updated_by: user?.id || null,
        },
      ])
      .select("id,nombre")
      .single();
    setSaving(false);

    if (saveError) {
      setError(
        saveError.code === "23505"
          ? "Ya existe un proveedor con ese nombre. Buscalo en la lista."
          : getSupabaseMessage(saveError)
      );
      return;
    }

    setShowProviderForm(false);
    setMessage("Proveedor guardado.");
    await loadData();
    if (data?.id) {
      setAccountForm((current) => ({
        ...current,
        proveedor_id: String(data.id),
      }));
    }
  }

  async function saveAccount() {
    if (!canManage) return;
    const total = toNumber(accountForm.total);

    if (!accountForm.proveedor_id) {
      setError("Elige el proveedor al que debes pagar.");
      return;
    }
    if (!accountForm.concepto.trim()) {
      setError("Escribe que compraste o por que debes pagar.");
      return;
    }
    if (total <= 0) {
      setError("El total debe ser mayor a cero.");
      return;
    }
    if (!accountForm.fecha_vencimiento) {
      setError("Elige la fecha limite de pago.");
      return;
    }
    if (accountForm.fecha_vencimiento < accountForm.fecha_emision) {
      setError("La fecha limite no puede ser anterior a la fecha de compra.");
      return;
    }

    setSaving(true);
    resetNotices();
    const { error: saveError } = await supabase
      .from("cuentas_por_pagar")
      .insert([
        {
          empresa_id: empresaId,
          proveedor_id: Number(accountForm.proveedor_id),
          concepto: accountForm.concepto.trim(),
          documento_ref: accountForm.documento_ref.trim() || null,
          fecha_emision: accountForm.fecha_emision,
          fecha_vencimiento: accountForm.fecha_vencimiento,
          total,
          saldo: total,
          recordatorio_dias: Number(accountForm.recordatorio_dias),
          notas: accountForm.notas.trim() || null,
          created_by: user?.id || null,
          updated_by: user?.id || null,
        },
      ]);
    setSaving(false);

    if (saveError) {
      setError(getSupabaseMessage(saveError));
      return;
    }

    setShowAccountForm(false);
    setMessage("Cuenta por pagar guardada. InvGuard la mostrara por prioridad.");
    await loadData();
  }

  function openPayment(account) {
    resetNotices();
    setSelectedAccount(account);
    setPaymentForm({
      ...emptyPayment,
      monto: String(account.saldo),
      fecha_pago: toDateInput(),
    });
    setShowAccountForm(false);
    setShowProviderForm(false);
  }

  async function savePayment() {
    if (!canManage || !selectedAccount) return;
    const amount = toNumber(paymentForm.monto);
    const balance = toNumber(selectedAccount.saldo);

    if (amount <= 0) {
      setError("El pago debe ser mayor a cero.");
      return;
    }
    if (amount > balance) {
      setError(`El pago no puede superar el saldo de ${money.format(balance)}.`);
      return;
    }
    if (paymentForm.fecha_pago > toDateInput()) {
      setError("La fecha del pago no puede estar en el futuro.");
      return;
    }

    const confirmed = window.confirm(
      `Confirmar pago de ${money.format(amount)} a ${selectedAccount.proveedor?.nombre || "este proveedor"}?`
    );
    if (!confirmed) return;

    setSaving(true);
    resetNotices();
    const { error: paymentError } = await supabase.rpc(
      "registrar_pago_proveedor",
      {
        p_empresa_id: empresaId,
        p_cuenta_id: selectedAccount.id,
        p_monto: amount,
        p_fecha_pago: paymentForm.fecha_pago,
        p_medio: paymentForm.medio,
        p_referencia: paymentForm.referencia.trim(),
        p_notas: paymentForm.notas.trim(),
      }
    );
    setSaving(false);

    if (paymentError) {
      setError(getSupabaseMessage(paymentError));
      return;
    }

    setSelectedAccount(null);
    setMessage(
      amount === balance
        ? "Pago completo registrado. La cuenta quedo pagada."
        : "Abono registrado. El saldo pendiente fue actualizado."
    );
    await loadData();
  }

  if (setupMissing) {
    return (
      <section className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-amber-400/30 bg-amber-400/10 p-6 text-amber-50">
          <FiCreditCard className="h-7 w-7" />
          <h1 className="mt-4 text-2xl font-semibold">Activa pagos a proveedores</h1>
          <p className="mt-3 text-sm leading-6 text-amber-100/85">
            Ejecuta <strong>supabase/proveedores_pagos.sql</strong> en Supabase SQL Editor y vuelve a intentar.
          </p>
          <button
            type="button"
            onClick={loadData}
            className="mt-5 rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950"
          >
            Ya lo ejecute, reintentar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-300">Dinero comprometido</p>
          <h1 className="mt-1 text-3xl font-semibold">Pagos a proveedores</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Revisa primero lo vencido, registra abonos y conserva la referencia de cada pago.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            <FiRefreshCw className="h-4 w-4" />
            Actualizar
          </button>
          <button
            type="button"
            onClick={
              providers.length
                ? openAccountForm
                : () => {
                    setView("PROVEEDORES");
                    openProviderForm();
                  }
            }
            disabled={!canManage}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
          >
            <FiPlus className="h-4 w-4" />
            {providers.length ? "Nueva cuenta" : "Agregar proveedor"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}
      {message && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <FiCheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={FiDollarSign} label="Saldo por pagar" value={money.format(summary.pending)} />
        <Metric icon={FiAlertTriangle} label="Vencido" value={money.format(summary.overdue)} tone={summary.overdue ? "text-red-200" : "text-white"} />
        <Metric icon={FiCalendar} label="Proximo a vencer" value={money.format(summary.dueSoon)} tone={summary.dueSoon ? "text-amber-200" : "text-white"} />
        <Metric icon={FiFileText} label="Cuentas abiertas" value={numberFormat.format(summary.open)} />
      </div>

      <div className="flex gap-2 border-b border-white/10">
        {[
          ["CUENTAS", "Por pagar", FiCreditCard],
          ["PROVEEDORES", "Proveedores", FiTruck],
        ].map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${
              view === value
                ? "border-teal-300 text-teal-200"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {showProviderForm && (
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Nuevo proveedor</h2>
            <button type="button" onClick={() => setShowProviderForm(false)} aria-label="Cerrar" className="rounded-lg p-2 text-neutral-400 hover:bg-white/10">
              <FiX className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Nombre del proveedor">
              <input value={providerForm.nombre} onChange={(event) => setProviderForm((current) => ({ ...current, nombre: event.target.value }))} placeholder="Ej. Distribuidora Central" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Documento">
              <input value={providerForm.documento} onChange={(event) => setProviderForm((current) => ({ ...current, documento: event.target.value }))} placeholder="RUC, NIT o identificacion" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Persona de contacto">
              <input value={providerForm.contacto} onChange={(event) => setProviderForm((current) => ({ ...current, contacto: event.target.value }))} placeholder="Nombre" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Telefono">
              <input value={providerForm.telefono} onChange={(event) => setProviderForm((current) => ({ ...current, telefono: event.target.value }))} inputMode="tel" placeholder="Telefono o WhatsApp" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Correo">
              <input type="email" value={providerForm.email} onChange={(event) => setProviderForm((current) => ({ ...current, email: event.target.value }))} placeholder="ventas@proveedor.com" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Nota interna">
              <input value={providerForm.notas} onChange={(event) => setProviderForm((current) => ({ ...current, notas: event.target.value }))} placeholder="Horario, condiciones o detalle" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setShowProviderForm(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm">Cancelar</button>
            <button type="button" onClick={saveProvider} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950">
              <FiSave className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar proveedor"}
            </button>
          </div>
        </div>
      )}

      {showAccountForm && (
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Nueva cuenta por pagar</h2>
              <p className="mt-1 text-sm text-neutral-400">Registra el compromiso cuando recibas la factura o mercaderia.</p>
            </div>
            <button type="button" onClick={() => setShowAccountForm(false)} aria-label="Cerrar" className="rounded-lg p-2 text-neutral-400 hover:bg-white/10">
              <FiX className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Proveedor">
              <select value={accountForm.proveedor_id} onChange={(event) => setAccountForm((current) => ({ ...current, proveedor_id: event.target.value }))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm">
                <option value="">Elegir proveedor</option>
                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.nombre}</option>)}
              </select>
            </Field>
            <Field label="Concepto">
              <input value={accountForm.concepto} onChange={(event) => setAccountForm((current) => ({ ...current, concepto: event.target.value }))} placeholder="Ej. Compra de bebidas" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Factura o referencia" hint="Opcional">
              <input value={accountForm.documento_ref} onChange={(event) => setAccountForm((current) => ({ ...current, documento_ref: event.target.value }))} placeholder="F001-254" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Total a pagar">
              <input type="number" min="0.01" step="0.01" inputMode="decimal" value={accountForm.total} onChange={(event) => setAccountForm((current) => ({ ...current, total: event.target.value }))} placeholder="0.00" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Fecha de compra">
              <input type="date" value={accountForm.fecha_emision} onChange={(event) => setAccountForm((current) => ({ ...current, fecha_emision: event.target.value }))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Fecha limite de pago">
              <input type="date" min={accountForm.fecha_emision} value={accountForm.fecha_vencimiento} onChange={(event) => setAccountForm((current) => ({ ...current, fecha_vencimiento: event.target.value }))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Avisarme antes">
              <select value={accountForm.recordatorio_dias} onChange={(event) => setAccountForm((current) => ({ ...current, recordatorio_dias: event.target.value }))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm">
                <option value="0">El mismo dia</option>
                <option value="1">1 dia antes</option>
                <option value="3">3 dias antes</option>
                <option value="7">7 dias antes</option>
                <option value="15">15 dias antes</option>
              </select>
            </Field>
            <Field label="Nota interna" hint="Opcional">
              <input value={accountForm.notas} onChange={(event) => setAccountForm((current) => ({ ...current, notas: event.target.value }))} placeholder="Condicion o acuerdo" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setShowAccountForm(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm">Cancelar</button>
            <button type="button" onClick={saveAccount} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950">
              <FiSave className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar cuenta"}
            </button>
          </div>
        </div>
      )}

      {selectedAccount && (
        <div className="rounded-lg border border-teal-400/25 bg-neutral-900 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-teal-300">Registrar abono</p>
              <h2 className="mt-1 text-lg font-semibold">{selectedAccount.proveedor?.nombre}</h2>
              <p className="mt-1 text-sm text-neutral-400">Saldo pendiente: {money.format(toNumber(selectedAccount.saldo))}</p>
            </div>
            <button type="button" onClick={() => setSelectedAccount(null)} aria-label="Cerrar" className="rounded-lg p-2 text-neutral-400 hover:bg-white/10">
              <FiX className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Monto pagado">
              <div className="flex gap-2">
                <input type="number" min="0.01" max={selectedAccount.saldo} step="0.01" inputMode="decimal" value={paymentForm.monto} onChange={(event) => setPaymentForm((current) => ({ ...current, monto: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
                <button type="button" onClick={() => setPaymentForm((current) => ({ ...current, monto: String(selectedAccount.saldo) }))} className="rounded-lg border border-white/10 px-3 text-xs hover:bg-white/5">Todo</button>
              </div>
            </Field>
            <Field label="Fecha del pago">
              <input type="date" value={paymentForm.fecha_pago} onChange={(event) => setPaymentForm((current) => ({ ...current, fecha_pago: event.target.value }))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <Field label="Medio">
              <select value={paymentForm.medio} onChange={(event) => setPaymentForm((current) => ({ ...current, medio: event.target.value }))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm">
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTRO">Otro</option>
              </select>
            </Field>
            <Field label="Referencia" hint="Operacion o comprobante">
              <input value={paymentForm.referencia} onChange={(event) => setPaymentForm((current) => ({ ...current, referencia: event.target.value }))} placeholder="Numero de operacion" className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm" />
            </Field>
            <div className="flex items-end">
              <button type="button" onClick={savePayment} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950">
                <FiDollarSign className="h-4 w-4" />
                {saving ? "Registrando..." : "Confirmar pago"}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "CUENTAS" ? (
        <div className="rounded-lg border border-white/10 bg-neutral-900">
          <div className="grid gap-3 border-b border-white/10 p-4 lg:grid-cols-[1fr_auto]">
            <label className="relative block">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar proveedor, concepto o factura" className="w-full rounded-lg border border-white/10 bg-neutral-950 py-2 pl-10 pr-3 text-sm" />
            </label>
            <div className="flex gap-2 overflow-x-auto">
              {filterOptions.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`min-w-max rounded-lg border px-3 py-2 text-sm ${filter === value ? "border-teal-300 bg-teal-400/15 text-teal-100" : "border-white/10 text-neutral-300 hover:bg-white/5"}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {visibleAccounts.map((account) => {
              const paid = toNumber(account.total) - toNumber(account.saldo);
              const paidPercent = Math.min(100, Math.max(0, (paid / toNumber(account.total)) * 100));
              return (
                <div key={account.id} className="grid gap-4 p-4 md:grid-cols-[minmax(180px,1.3fr)_minmax(150px,1fr)_130px_150px_auto] md:items-center">
                  <div>
                    <p className="font-semibold">{account.proveedor?.nombre || "Proveedor"}</p>
                    <p className="mt-1 text-sm text-neutral-400">{account.concepto}</p>
                    {account.documento_ref && <p className="mt-1 text-xs text-neutral-500">Ref. {account.documento_ref}</p>}
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-neutral-400">Saldo</span>
                      <strong>{money.format(toNumber(account.saldo))}</strong>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-teal-400" style={{ width: `${paidPercent}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">Pagado {money.format(paid)} de {money.format(toNumber(account.total))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Vencimiento</p>
                    <p className="mt-1 text-sm">{formatDateOnly(account.fecha_vencimiento)}</p>
                  </div>
                  <PayableBadge account={account} />
                  <div className="flex justify-end">
                    {!["PAGADO", "ANULADO"].includes(account.estado) ? (
                      <button type="button" onClick={() => openPayment(account)} disabled={!canManage} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400">
                        <FiDollarSign className="h-4 w-4" />
                        Registrar pago
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-sm text-emerald-200"><FiCheckCircle /> Completado</span>
                    )}
                  </div>
                  {account.pagos?.length > 0 && (
                    <details className="md:col-span-5 rounded-lg border border-white/10 bg-neutral-950/50 p-3">
                      <summary className="cursor-pointer text-sm text-neutral-300">Ver {account.pagos.length} pago{account.pagos.length === 1 ? "" : "s"}</summary>
                      <div className="mt-3 divide-y divide-white/10">
                        {[...account.pagos].sort((a, b) => String(b.fecha_pago).localeCompare(String(a.fecha_pago))).map((payment) => (
                          <div key={payment.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[140px_1fr_1fr]">
                            <strong>{money.format(toNumber(payment.monto))}</strong>
                            <span className="text-neutral-400">{formatDateOnly(payment.fecha_pago)} / {payment.medio}</span>
                            <span className="text-neutral-500">{payment.referencia || "Sin referencia"}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}

            {!loading && visibleAccounts.length === 0 && (
              <EmptyState
                icon={filter === "PAGADAS" ? FiCheckCircle : FiCreditCard}
                title={accounts.length === 0 ? "Aun no hay cuentas por pagar" : "No hay resultados con este filtro"}
                body={accounts.length === 0 ? "Registra una deuda cuando recibas mercaderia o una factura pendiente." : "Cambia el filtro o busca con otro texto."}
                actionLabel={
                  accounts.length === 0 && canManage
                    ? providers.length
                      ? "Nueva cuenta"
                      : "Agregar proveedor"
                    : undefined
                }
                actionIcon={FiPlus}
                onAction={
                  accounts.length === 0
                    ? providers.length
                      ? openAccountForm
                      : () => {
                          setView("PROVEEDORES");
                          openProviderForm();
                        }
                    : undefined
                }
              />
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-neutral-900">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Proveedores</h2>
              <p className="mt-1 text-sm text-neutral-400">Contactos usados en compras y pagos.</p>
            </div>
            <button type="button" onClick={openProviderForm} disabled={!canManage} className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950">
              <FiPlus className="h-4 w-4" /> Nuevo proveedor
            </button>
          </div>
          <div className="divide-y divide-white/10">
            {providers.map((provider) => {
              const providerBalance = accounts.filter((account) => account.proveedor_id === provider.id && !["PAGADO", "ANULADO"].includes(account.estado)).reduce((total, account) => total + toNumber(account.saldo), 0);
              return (
                <div key={provider.id} className="grid gap-3 p-4 md:grid-cols-[1.3fr_1fr_1fr_160px] md:items-center">
                  <div>
                    <p className="font-semibold">{provider.nombre}</p>
                    <p className="mt-1 text-xs text-neutral-500">{provider.documento || "Sin documento"}</p>
                  </div>
                  <div className="space-y-1 text-sm text-neutral-400">
                    {provider.contacto && <p>{provider.contacto}</p>}
                    {provider.telefono && <a href={`tel:${provider.telefono}`} className="flex items-center gap-2 hover:text-white"><FiPhone /> {provider.telefono}</a>}
                    {provider.email && <a href={`mailto:${provider.email}`} className="flex items-center gap-2 hover:text-white"><FiMail /> {provider.email}</a>}
                  </div>
                  <p className="text-sm text-neutral-400">{provider.notas || "Sin notas"}</p>
                  <div className="md:text-right">
                    <p className="text-xs text-neutral-500">Saldo pendiente</p>
                    <p className={`mt-1 font-semibold ${providerBalance ? "text-amber-200" : "text-emerald-200"}`}>{money.format(providerBalance)}</p>
                  </div>
                </div>
              );
            })}
            {!loading && providers.length === 0 && (
              <EmptyState icon={FiUsers} title="Agrega tu primer proveedor" body="Solo necesitas el nombre; el contacto y documento son opcionales." actionLabel={canManage ? "Nuevo proveedor" : undefined} actionIcon={FiPlus} onAction={canManage ? openProviderForm : undefined} />
            )}
          </div>
        </div>
      )}

      {!canManage && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-400">
          Puedes revisar pagos y vencimientos. Un ADMIN o SUPERVISOR debe registrar cuentas y abonos.
        </div>
      )}

      {accounts.length > 0 && (
        <p className="text-xs text-neutral-500">
          Ultima actualizacion: {formatDate(new Date())}.
        </p>
      )}
    </section>
  );
}
