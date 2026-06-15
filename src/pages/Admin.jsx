import { useEffect, useMemo, useState } from "react";
import {
  FiBriefcase,
  FiCalendar,
  FiClock,
  FiPower,
  FiRefreshCw,
  FiSave,
  FiShield,
  FiTrash2,
  FiUserPlus,
  FiUsers,
} from "react-icons/fi";

import EmptyState from "../components/EmptyState";
import { useTenant } from "../context/TenantContext";
import { supabase } from "../services/supabase";
import { formatDate, getSupabaseMessage } from "../utils/inventory";

const roles = ["ADMIN", "SUPERVISOR", "EMPLEADO"];
const estados = ["BETA", "ACTIVO", "SUSPENDIDO"];

const roleLabels = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  EMPLEADO: "Empleado",
};

const statusLabels = {
  BETA: "Beta",
  ACTIVO: "Activo",
  SUSPENDIDO: "Suspendido",
};

function RoleBadge({ rol }) {
  const className =
    rol === "ADMIN"
      ? "border-teal-400/25 bg-teal-400/10 text-teal-100"
      : rol === "SUPERVISOR"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
        : "border-white/10 bg-white/5 text-neutral-200";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs ${className}`}>
      {roleLabels[rol] || rol}
    </span>
  );
}

function StatusBadge({ estado }) {
  const className =
    estado === "ACTIVO"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
      : estado === "SUSPENDIDO"
        ? "border-red-400/25 bg-red-400/10 text-red-100"
        : "border-sky-400/25 bg-sky-400/10 text-sky-100";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs ${className}`}>
      {statusLabels[estado] || "Beta"}
    </span>
  );
}

function daysLeft(value) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

function MetricCard({ icon: Icon, label, value, tone = "text-white" }) {
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

export default function Admin() {
  const {
    empresa,
    empresaId,
    isSuperAdmin,
    membership,
    reloadTenant,
    user,
  } = useTenant();
  const [members, setMembers] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [memberForm, setMemberForm] = useState({
    email: "",
    rol: "EMPLEADO",
  });
  const [businessForm, setBusinessForm] = useState({
    nombre: empresa?.nombre || "",
    rubro: empresa?.rubro || "",
    ciudad: empresa?.ciudad || "",
  });
  const [newBusinessForm, setNewBusinessForm] = useState({
    nombre: "",
    rubro: "",
    ciudad: "",
    ownerEmail: "",
  });

  const isAdmin = membership?.rol === "ADMIN";
  const canManageCurrentBusiness = Boolean(empresaId && (isAdmin || isSuperAdmin));

  useEffect(() => {
    setBusinessForm({
      nombre: empresa?.nombre || "",
      rubro: empresa?.rubro || "",
      ciudad: empresa?.ciudad || "",
    });
  }, [empresa]);

  async function cargarAdmin() {
    setLoading(true);
    setMessage("");

    const membersPromise = empresaId
      ? supabase
          .from("empresa_usuarios")
          .select("id,user_id,email,rol,created_at")
          .eq("empresa_id", empresaId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null });

    const businessesPromise = isSuperAdmin
      ? supabase.rpc("listar_empresas_admin")
      : Promise.resolve({ data: [], error: null });

    const auditPromise = empresaId || isSuperAdmin
      ? supabase
          .from("audit_logs")
          .select("id,empresa_id,actor_email,accion,tabla,registro_id,created_at")
          .order("created_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [], error: null });

    const [membersResult, businessesResult, auditResult] = await Promise.all([
      membersPromise,
      businessesPromise,
      auditPromise,
    ]);

    if (membersResult.error) {
      setMessage(getSupabaseMessage(membersResult.error));
      setLoading(false);
      return;
    }

    if (businessesResult.error) {
      setMessage(getSupabaseMessage(businessesResult.error));
      setLoading(false);
      return;
    }

    setMembers(membersResult.data || []);
    setBusinesses(businessesResult.data || []);
    setAuditLogs(auditResult.error ? [] : auditResult.data || []);
    setLoading(false);
  }

  useEffect(() => {
    cargarAdmin();
  }, [empresaId, isSuperAdmin]);

  async function guardarEmpresa() {
    if (!canManageCurrentBusiness) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("empresas")
      .update({
        nombre: businessForm.nombre.trim(),
        rubro: businessForm.rubro.trim(),
        ciudad: businessForm.ciudad.trim(),
      })
      .eq("id", empresaId);

    setSaving(false);

    if (error) {
      setMessage(getSupabaseMessage(error));
      return;
    }

    setMessage("Datos del negocio actualizados.");
    await reloadTenant();
    await cargarAdmin();
  }

  async function crearNegocio() {
    if (!isSuperAdmin) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("crear_empresa_admin", {
      p_nombre: newBusinessForm.nombre.trim(),
      p_rubro: newBusinessForm.rubro.trim(),
      p_ciudad: newBusinessForm.ciudad.trim(),
      p_owner_email: newBusinessForm.ownerEmail.trim().toLowerCase(),
    });

    setSaving(false);

    if (error) {
      setMessage(getSupabaseMessage(error));
      return;
    }

    setNewBusinessForm({
      nombre: "",
      rubro: "",
      ciudad: "",
      ownerEmail: "",
    });
    setMessage("Negocio creado con beta de 30 dias.");
    await cargarAdmin();
  }

  async function agregarUsuario() {
    if (!canManageCurrentBusiness) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("agregar_usuario_empresa", {
      p_empresa_id: empresaId,
      p_email: memberForm.email.trim().toLowerCase(),
      p_rol: memberForm.rol,
    });

    setSaving(false);

    if (error) {
      setMessage(getSupabaseMessage(error));
      return;
    }

    setMemberForm({ email: "", rol: "EMPLEADO" });
    setMessage("Usuario agregado al negocio.");
    await cargarAdmin();
  }

  async function cambiarRol(member, nextRol) {
    if (!canManageCurrentBusiness || member.rol === nextRol) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("cambiar_rol_usuario_empresa", {
      p_empresa_id: empresaId,
      p_email: member.email,
      p_rol: nextRol,
    });

    setSaving(false);

    if (error) {
      setMessage(getSupabaseMessage(error));
      return;
    }

    setMessage("Rol actualizado.");
    await cargarAdmin();
  }

  async function quitarUsuario(member) {
    if (!canManageCurrentBusiness) return;

    const confirmed = window.confirm(
      `Quitar acceso a ${member.email || "este usuario"}?`
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("quitar_usuario_empresa", {
      p_empresa_id: empresaId,
      p_email: member.email,
    });

    setSaving(false);

    if (error) {
      setMessage(getSupabaseMessage(error));
      return;
    }

    setMessage("Usuario retirado del negocio.");
    await cargarAdmin();
  }

  async function cambiarEstadoEmpresa(businessId, nextEstado) {
    if (!isSuperAdmin) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("actualizar_estado_empresa", {
      p_empresa_id: businessId,
      p_estado: nextEstado,
    });

    setSaving(false);

    if (error) {
      setMessage(getSupabaseMessage(error));
      return;
    }

    setMessage("Estado comercial actualizado.");
    await cargarAdmin();
    await reloadTenant();
  }

  const businessSummary = useMemo(() => {
    const beta = businesses.filter((item) => item.estado === "BETA");
    const suspended = businesses.filter(
      (item) => item.estado === "SUSPENDIDO"
    );
    const expiring = beta.filter((item) => {
      const left = daysLeft(item.trial_ends_at);
      return left !== null && left <= 7;
    });

    return {
      beta: beta.length,
      suspended: suspended.length,
      expiring: expiring.length,
      total: businesses.length,
    };
  }, [businesses]);

  const currentDaysLeft = daysLeft(empresa?.trial_ends_at);

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-300">
            Control de acceso
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            {isSuperAdmin ? "Clientes y accesos" : "Mi negocio"}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            {isSuperAdmin
              ? "Crea negocios, asigna usuarios y decide quien sigue en beta, activo o suspendido."
              : "Actualiza los datos del negocio y revisa quienes tienen acceso."}
          </p>
        </div>

        <button
          type="button"
          onClick={cargarAdmin}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
        >
          <FiRefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-neutral-100">
          {message}
        </div>
      )}

      {isSuperAdmin && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={FiBriefcase}
              label="Negocios"
              value={businessSummary.total}
            />
            <MetricCard
              icon={FiCalendar}
              label="En beta"
              value={businessSummary.beta}
              tone="text-sky-200"
            />
            <MetricCard
              icon={FiPower}
              label="Suspendidos"
              value={businessSummary.suspended}
              tone={
                businessSummary.suspended ? "text-red-200" : "text-white"
              }
            />
            <MetricCard
              icon={FiShield}
              label="Beta por vencer"
              value={businessSummary.expiring}
              tone={businessSummary.expiring ? "text-amber-200" : "text-white"}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
              <h2 className="text-lg font-semibold">Crear cliente en beta</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Primero crea el usuario en Supabase Auth con correo y
                contrasena. Luego escribe aqui ese mismo correo para asignarlo
                como dueno del negocio.
              </p>
              <div className="mt-5 grid gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm text-neutral-300">
                    Nombre del negocio
                  </span>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                    placeholder="Ej. Bodega San Jose"
                    value={newBusinessForm.nombre}
                    onChange={(event) =>
                      setNewBusinessForm((current) => ({
                        ...current,
                        nombre: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-neutral-300">
                    Rubro
                  </span>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                    placeholder="Ej. Abarrotes, farmacia, ferreteria"
                    value={newBusinessForm.rubro}
                    onChange={(event) =>
                      setNewBusinessForm((current) => ({
                        ...current,
                        rubro: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-neutral-300">
                    Ciudad
                  </span>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                    placeholder="Ej. Lima"
                    value={newBusinessForm.ciudad}
                    onChange={(event) =>
                      setNewBusinessForm((current) => ({
                        ...current,
                        ciudad: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-neutral-300">
                    Correo del dueno
                  </span>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                    placeholder="dueno@negocio.com"
                    type="email"
                    value={newBusinessForm.ownerEmail}
                    onChange={(event) =>
                      setNewBusinessForm((current) => ({
                        ...current,
                        ownerEmail: event.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={crearNegocio}
                  disabled={
                    saving ||
                    !newBusinessForm.nombre ||
                    !newBusinessForm.ownerEmail
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiBriefcase className="h-4 w-4" />
                  Crear beta 30 dias
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-neutral-900">
              <div className="border-b border-white/10 p-5">
                <h2 className="text-lg font-semibold">Negocios registrados</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-white/[0.03] text-left text-neutral-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Negocio</th>
                      <th className="px-5 py-3 font-medium">Dueno</th>
                      <th className="px-5 py-3 font-medium">Estado</th>
                      <th className="px-5 py-3 font-medium">Beta hasta</th>
                      <th className="px-5 py-3 font-medium">Usuarios</th>
                      <th className="px-5 py-3 font-medium">Cambiar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {businesses.map((business) => {
                      const left = daysLeft(business.trial_ends_at);

                      return (
                        <tr key={business.id}>
                          <td className="px-5 py-3">
                            <div>
                              <p className="font-medium">{business.nombre}</p>
                              <p className="text-xs text-neutral-500">
                                {business.rubro || "Sin rubro"} /{" "}
                                {business.ciudad || "Sin ciudad"}
                              </p>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-neutral-300">
                            {business.owner_email || "-"}
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge estado={business.estado} />
                          </td>
                          <td className="px-5 py-3 text-neutral-400">
                            <div>{formatDate(business.trial_ends_at)}</div>
                            {business.estado === "BETA" && left !== null && (
                              <span
                                className={
                                  left <= 7
                                    ? "text-amber-200"
                                    : "text-neutral-500"
                                }
                              >
                                {left < 0 ? "Vencida" : `${left} dias`}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {business.usuarios || 0}
                          </td>
                          <td className="px-5 py-3">
                            <select
                              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                              value={business.estado || "BETA"}
                              disabled={saving}
                              onChange={(event) =>
                                cambiarEstadoEmpresa(
                                  business.id,
                                  event.target.value
                                )
                              }
                            >
                              {estados.map((estado) => (
                                <option key={estado} value={estado}>
                                  {statusLabels[estado]}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}

                    {!loading && businesses.length === 0 && (
                      <tr>
                        <td
                          colSpan="6"
                          className="px-0 py-0"
                        >
                          <EmptyState
                            icon={FiBriefcase}
                            title="Aun no hay clientes creados"
                            body="Crea el primer negocio en beta para empezar a controlar usuarios y accesos."
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {empresa ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={FiBriefcase}
              label="Negocio actual"
              value={empresa.nombre}
            />
            <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-neutral-400">Estado</p>
                <FiPower className="h-5 w-5 text-teal-300" />
              </div>
              <div className="mt-3">
                <StatusBadge estado={empresa.estado} />
              </div>
              <p className="mt-3 text-sm text-neutral-400">
                {empresa.estado === "BETA" && currentDaysLeft !== null
                  ? currentDaysLeft < 0
                    ? "Beta vencida"
                    : `${currentDaysLeft} dias de beta`
                  : empresa.plan || "Plan activo"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-neutral-400">Tu acceso</p>
                <FiShield className="h-5 w-5 text-amber-300" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <RoleBadge rol={membership?.rol || "SIN ROL"} />
                <span className="max-w-[220px] truncate text-sm text-neutral-400">
                  {user?.email}
                </span>
              </div>
            </div>
            <MetricCard
              icon={FiUsers}
              label="Usuarios"
              value={members.length}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
              <h2 className="text-lg font-semibold">Datos del negocio</h2>
              <div className="mt-5 grid gap-3">
                <input
                  className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder="Nombre"
                  value={businessForm.nombre}
                  disabled={!canManageCurrentBusiness}
                  onChange={(event) =>
                    setBusinessForm((current) => ({
                      ...current,
                      nombre: event.target.value,
                    }))
                  }
                />
                <input
                  className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder="Rubro"
                  value={businessForm.rubro}
                  disabled={!canManageCurrentBusiness}
                  onChange={(event) =>
                    setBusinessForm((current) => ({
                      ...current,
                      rubro: event.target.value,
                    }))
                  }
                />
                <input
                  className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder="Ciudad"
                  value={businessForm.ciudad}
                  disabled={!canManageCurrentBusiness}
                  onChange={(event) =>
                    setBusinessForm((current) => ({
                      ...current,
                      ciudad: event.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={guardarEmpresa}
                  disabled={!canManageCurrentBusiness || saving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiSave className="h-4 w-4" />
                  Guardar
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
              <h2 className="text-lg font-semibold">Agregar usuario</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_160px]">
                <input
                  className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder="correo@negocio.com"
                  type="email"
                  value={memberForm.email}
                  disabled={!canManageCurrentBusiness}
                  onChange={(event) =>
                    setMemberForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
                <select
                  className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                  value={memberForm.rol}
                  disabled={!canManageCurrentBusiness}
                  onChange={(event) =>
                    setMemberForm((current) => ({
                      ...current,
                      rol: event.target.value,
                    }))
                  }
                >
                  {roles.map((rol) => (
                    <option key={rol} value={rol}>
                      {roleLabels[rol]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={agregarUsuario}
                  disabled={
                    !canManageCurrentBusiness || saving || !memberForm.email
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
                >
                  <FiUserPlus className="h-4 w-4" />
                  Agregar
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-neutral-900">
            <div className="border-b border-white/10 p-5">
              <h2 className="text-lg font-semibold">Equipo</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-white/[0.03] text-left text-neutral-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Usuario</th>
                    <th className="px-5 py-3 font-medium">Rol</th>
                    <th className="px-5 py-3 font-medium">Alta</th>
                    <th className="px-5 py-3 font-medium">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td className="px-5 py-3">
                        {member.email || member.user_id}
                      </td>
                      <td className="px-5 py-3">
                        {canManageCurrentBusiness ? (
                          <select
                            className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                            value={member.rol}
                            disabled={saving}
                            onChange={(event) =>
                              cambiarRol(member, event.target.value)
                            }
                          >
                            {roles.map((rol) => (
                              <option key={rol} value={rol}>
                                {roleLabels[rol]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <RoleBadge rol={member.rol} />
                        )}
                      </td>
                      <td className="px-5 py-3 text-neutral-400">
                        {formatDate(member.created_at)}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => quitarUsuario(member)}
                          disabled={!canManageCurrentBusiness || saving}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FiTrash2 className="h-4 w-4" />
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}

                  {!loading && members.length === 0 && (
                    <tr>
                      <td
                        colSpan="4"
                        className="px-0 py-0"
                      >
                        <EmptyState
                          icon={FiUsers}
                          title="Aun no hay usuarios asignados"
                          body="Agrega un correo para que esa persona pueda entrar al negocio."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-neutral-900">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 p-5">
              <h2 className="text-lg font-semibold">Ultimas acciones</h2>
              <FiClock className="h-5 w-5 text-teal-300" />
            </div>
            <div className="divide-y divide-white/10">
              {auditLogs.map((log) => (
                <div key={log.id} className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_120px_160px] md:items-center">
                  <div>
                    <p className="font-medium">
                      {log.tabla} / {log.accion}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {log.actor_email || "Usuario"} - registro {log.registro_id || "-"}
                    </p>
                  </div>
                  <span className="text-neutral-400">{log.empresa_id ? `Negocio ${log.empresa_id}` : "-"}</span>
                  <span className="text-neutral-400">{formatDate(log.created_at)}</span>
                </div>
              ))}

              {!loading && auditLogs.length === 0 && (
                <EmptyState
                  icon={FiClock}
                  title="Aun no hay acciones registradas"
                  body="Despues de ejecutar supabase/hardening.sql, aqui veras cambios de productos, movimientos, lotes y usuarios."
                />
              )}
            </div>
          </div>
        </>
      ) : (
        isSuperAdmin && (
          <div className="rounded-lg border border-teal-400/20 bg-teal-400/10 p-4 text-sm text-teal-50">
            Tu cuenta Super Admin esta lista para crear y controlar negocios.
          </div>
        )
      )}
    </section>
  );
}
