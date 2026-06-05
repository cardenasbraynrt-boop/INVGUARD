import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FiBriefcase,
  FiCheck,
  FiCopy,
  FiRefreshCw,
  FiSave,
  FiSend,
  FiShield,
  FiUserPlus,
  FiUsers,
} from "react-icons/fi";

import { useTenant } from "../context/TenantContext";
import { supabase } from "../services/supabase";
import {
  buildWhatsAppUrl,
  formatDate,
  getSupabaseMessage,
} from "../utils/inventory";

const roles = ["ADMIN", "SUPERVISOR", "EMPLEADO"];

function RoleBadge({ rol }) {
  const className =
    rol === "ADMIN"
      ? "border-teal-400/25 bg-teal-400/10 text-teal-100"
      : rol === "SUPERVISOR"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
        : "border-white/10 bg-white/5 text-neutral-200";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs ${className}`}>
      {rol}
    </span>
  );
}

export default function Admin() {
  const {
    empresa,
    empresaId,
    membership,
    user,
    reloadTenant,
  } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    rol: "EMPLEADO",
    phone: "",
  });
  const [businessForm, setBusinessForm] = useState({
    nombre: empresa?.nombre || "",
    rubro: empresa?.rubro || "",
    ciudad: empresa?.ciudad || "",
  });

  const isAdmin = membership?.rol === "ADMIN";

  useEffect(() => {
    setBusinessForm({
      nombre: empresa?.nombre || "",
      rubro: empresa?.rubro || "",
      ciudad: empresa?.ciudad || "",
    });
  }, [empresa]);

  async function cargarAdmin() {
    if (!empresaId) return;

    setLoading(true);
    setMessage("");

    const [membersResult, invitesResult] = await Promise.all([
      supabase
        .from("empresa_usuarios")
        .select("id,user_id,email,rol,created_at")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: true }),
      supabase
        .from("invitaciones_empresa")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false }),
    ]);

    if (membersResult.error) {
      setMessage(getSupabaseMessage(membersResult.error));
      setLoading(false);
      return;
    }

    setMembers(membersResult.data || []);

    if (invitesResult.error) {
      setInvites([]);
      setMessage(
        "Para usar invitaciones ejecuta supabase/multi_tenant.sql actualizado."
      );
    } else {
      setInvites(invitesResult.data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    cargarAdmin();
  }, [empresaId]);

  useEffect(() => {
    const token = searchParams.get("invite");

    if (!token) return;

    async function aceptarInvitacion() {
      const { error } = await supabase.rpc("aceptar_invitacion_empresa", {
        p_token: token,
      });

      if (error) {
        setMessage(getSupabaseMessage(error));
        return;
      }

      setMessage("Invitacion aceptada. Tu cuenta ya tiene acceso.");
      setSearchParams({});
      await reloadTenant();
      await cargarAdmin();
    }

    aceptarInvitacion();
  }, [searchParams, setSearchParams, reloadTenant]);

  async function guardarEmpresa() {
    if (!isAdmin) return;

    setSaving(true);

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
  }

  async function crearInvitacion() {
    if (!isAdmin) return;

    setSaving(true);
    setInviteResult(null);
    setMessage("");

    const { data, error } = await supabase.rpc("crear_invitacion_empresa", {
      p_empresa_id: empresaId,
      p_email: inviteForm.email.trim().toLowerCase(),
      p_rol: inviteForm.rol,
    });

    setSaving(false);

    if (error) {
      setMessage(getSupabaseMessage(error));
      return;
    }

    const invite = Array.isArray(data) ? data[0] : data;
    setInviteResult(invite);
    setInviteForm((current) => ({
      ...current,
      email: "",
    }));
    await cargarAdmin();
  }

  async function copiar(text) {
    await navigator.clipboard.writeText(text);
    setMessage("Copiado.");
  }

  const inviteLink = useMemo(() => {
    if (!inviteResult?.token) return "";
    return `${window.location.origin}/admin?invite=${inviteResult.token}`;
  }, [inviteResult]);

  const inviteMessage = useMemo(() => {
    if (!inviteLink) return "";
    return [
      `Te invito a InvGuard para gestionar inventario de ${empresa?.nombre}.`,
      `Rol: ${inviteResult?.rol}`,
      `Entra aqui: ${inviteLink}`,
    ].join("\n");
  }, [empresa?.nombre, inviteLink, inviteResult?.rol]);

  function abrirWhatsApp() {
    window.open(
      buildWhatsAppUrl(inviteForm.phone, inviteMessage),
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <section className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-300">
            Control del sistema
          </p>
          <h1 className="mt-1 text-3xl font-semibold">Admin</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Gestiona tu negocio, usuarios, roles e invitaciones.
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-400">Negocio</p>
            <FiBriefcase className="h-5 w-5 text-teal-300" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{empresa?.nombre}</p>
          <p className="mt-1 text-sm text-neutral-400">
            {empresa?.rubro || "Sin rubro"}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-400">Tu acceso</p>
            <FiShield className="h-5 w-5 text-amber-300" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <RoleBadge rol={membership?.rol || "SIN ROL"} />
            <span className="text-sm text-neutral-400">{user?.email}</span>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-400">Usuarios</p>
            <FiUsers className="h-5 w-5 text-emerald-300" />
          </div>
          <p className="mt-2 text-3xl font-semibold">{members.length}</p>
          <p className="mt-1 text-sm text-neutral-400">
            {isAdmin ? "Puedes administrar roles." : "Modo lectura."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <h2 className="text-lg font-semibold">Datos del negocio</h2>
          <div className="mt-5 grid gap-3">
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="Nombre"
              value={businessForm.nombre}
              disabled={!isAdmin}
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
              disabled={!isAdmin}
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
              disabled={!isAdmin}
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
              disabled={!isAdmin || saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
            >
              <FiSave className="h-4 w-4" />
              Guardar
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-900 p-5">
          <h2 className="text-lg font-semibold">Invitar usuario</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_160px]">
            <input
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="correo@negocio.com"
              type="email"
              value={inviteForm.email}
              disabled={!isAdmin}
              onChange={(event) =>
                setInviteForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
            <select
              className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
              value={inviteForm.rol}
              disabled={!isAdmin}
              onChange={(event) =>
                setInviteForm((current) => ({
                  ...current,
                  rol: event.target.value,
                }))
              }
            >
              {roles.map((rol) => (
                <option key={rol} value={rol}>
                  {rol}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={crearInvitacion}
              disabled={!isAdmin || saving || !inviteForm.email}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 md:col-span-2"
            >
              <FiUserPlus className="h-4 w-4" />
              Crear invitacion
            </button>
          </div>

          {inviteResult && (
            <div className="mt-5 rounded-lg border border-teal-400/25 bg-teal-400/10 p-4">
              <p className="text-sm font-semibold text-teal-100">
                Link de invitacion
              </p>
              <p className="mt-2 break-all rounded-lg bg-neutral-950/60 p-3 text-sm text-neutral-200">
                {inviteLink}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copiar(inviteLink)}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
                >
                  <FiCopy className="h-4 w-4" />
                  Copiar link
                </button>
                <input
                  className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-sm"
                  placeholder="WhatsApp opcional"
                  value={inviteForm.phone}
                  onChange={(event) =>
                    setInviteForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={abrirWhatsApp}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
                >
                  <FiSend className="h-4 w-4" />
                  Enviar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-neutral-900">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-lg font-semibold">Equipo</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-white/[0.03] text-left text-neutral-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Usuario</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-5 py-3">
                      {member.email || member.user_id}
                    </td>
                    <td className="px-5 py-3">
                      <RoleBadge rol={member.rol} />
                    </td>
                    <td className="px-5 py-3 text-neutral-400">
                      {formatDate(member.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-neutral-900">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-lg font-semibold">Invitaciones</h2>
          </div>
          <div className="divide-y divide-white/10">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-sm text-neutral-400">
                    {invite.estado} · vence {formatDate(invite.expires_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge rol={invite.rol} />
                  {invite.estado === "PENDIENTE" && (
                    <button
                      type="button"
                      onClick={() =>
                        copiar(
                          `${window.location.origin}/admin?invite=${invite.token}`
                        )
                      }
                      className="rounded-lg border border-white/10 p-2 hover:bg-white/5"
                      aria-label="Copiar invitacion"
                    >
                      <FiCopy className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {!loading && invites.length === 0 && (
              <p className="p-5 text-sm text-neutral-400">
                No hay invitaciones.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-50">
        <div className="flex items-center gap-2 font-semibold">
          <FiCheck className="h-4 w-4" />
          Como lo controlas
        </div>
        <p className="mt-2 text-emerald-100/90">
          Tu cuenta ADMIN controla el negocio, invita usuarios y define roles.
          Los datos quedan separados por empresa con RLS en Supabase.
        </p>
      </div>
    </section>
  );
}
