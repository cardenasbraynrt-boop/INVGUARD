export const money = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

export const numberFormat = new Intl.NumberFormat("es-PE");

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function toTitleCase(value) {
  return cleanText(value)
    .toLocaleLowerCase("es-PE")
    .replace(/(^|\s)(\S)/g, (match) => match.toLocaleUpperCase("es-PE"));
}

export function getCategoryOptions(productos = []) {
  const map = new Map();

  productos.forEach((product) => {
    const category = toTitleCase(product.categoria);
    if (!category) return;
    map.set(category.toLocaleLowerCase("es-PE"), category);
  });

  return Array.from(map.values()).sort((a, b) =>
    a.localeCompare(b, "es-PE")
  );
}

export function normalizeCategoryName(value, existingCategories = []) {
  const category = toTitleCase(value);
  const match = existingCategories.find(
    (item) =>
      item.toLocaleLowerCase("es-PE") ===
      category.toLocaleLowerCase("es-PE")
  );

  return match || category;
}

function buildCodePrefix(value) {
  const clean = cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLocaleUpperCase("es-PE");

  return (clean || "PRO").slice(0, 3).padEnd(3, "X");
}

export function generateProductCode({ productos = [], categoria = "", nombre = "" }) {
  const prefix = buildCodePrefix(categoria || nombre);
  const usedCodes = new Set(
    productos
      .map((product) => String(product.codigo || "").toLocaleUpperCase("es-PE"))
      .filter(Boolean)
  );
  const numbers = productos
    .map((product) => {
      const match = String(product.codigo || "")
        .toLocaleUpperCase("es-PE")
        .match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? Number(match[1]) : 0;
    })
    .filter(Boolean);

  let next = Math.max(0, ...numbers) + 1;
  let code = `${prefix}-${String(next).padStart(4, "0")}`;

  while (usedCodes.has(code)) {
    next += 1;
    code = `${prefix}-${String(next).padStart(4, "0")}`;
  }

  return code;
}

export function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDateOnly(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
}

export function daysUntil(value) {
  if (!value) return null;

  const today = new Date();
  const target = new Date(`${value}T00:00:00`);
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}

export function getExpiryState(lote) {
  const remainingDays = daysUntil(lote?.fecha_vencimiento);

  if (remainingDays === null) {
    return {
      label: "Sin vencimiento",
      days: null,
      className: "bg-white/5 text-neutral-200 border-white/10",
    };
  }

  if (remainingDays < 0) {
    return {
      label: "Vencido",
      days: remainingDays,
      className: "bg-red-500/15 text-red-200 border-red-500/30",
    };
  }

  if (remainingDays <= 7) {
    return {
      label: `Vence en ${remainingDays} dias`,
      days: remainingDays,
      className: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    };
  }

  if (remainingDays <= 30) {
    return {
      label: `Vence en ${remainingDays} dias`,
      days: remainingDays,
      className: "bg-sky-500/15 text-sky-200 border-sky-500/30",
    };
  }

  return {
    label: "Vigente",
    days: remainingDays,
    className: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  };
}

export function getProductName(product) {
  return product?.nombre || "Producto eliminado";
}

export function getStockState(product) {
  const stock = toNumber(product?.stock);
  const minimum = toNumber(product?.stock_minimo);

  if (stock <= 0) {
    return {
      label: "Sin stock",
      className: "bg-red-500/15 text-red-200 border-red-500/30",
    };
  }

  if (stock <= minimum) {
    return {
      label: "Stock bajo",
      className: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    };
  }

  return {
    label: "Normal",
    className: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  };
}

export function calculateStats(productos = [], movimientos = []) {
  const stockTotal = productos.reduce(
    (total, product) => total + toNumber(product.stock),
    0
  );

  const valorInventario = productos.reduce(
    (total, product) =>
      total +
      toNumber(product.stock) * toNumber(product.precio_venta),
    0
  );

  const costoInventario = productos.reduce(
    (total, product) =>
      total +
      toNumber(product.stock) * toNumber(product.precio_compra),
    0
  );

  const stockBajo = productos.filter(
    (product) =>
      toNumber(product.stock) <= toNumber(product.stock_minimo)
  );

  const entradas = movimientos
    .filter((movement) => movement.tipo === "ENTRADA")
    .reduce((total, movement) => total + toNumber(movement.cantidad), 0);

  const salidas = movimientos
    .filter((movement) => movement.tipo === "SALIDA")
    .reduce((total, movement) => total + toNumber(movement.cantidad), 0);

  const perdidas = movimientos.filter((movement) =>
    String(movement.observacion || "")
      .toLowerCase()
      .includes("perdida")
  );

  return {
    productos: productos.length,
    stockTotal,
    valorInventario,
    costoInventario,
    stockBajo,
    entradas,
    salidas,
    perdidas,
  };
}

export function buildCsv(rows) {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  };

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCell(row[header])).join(",")
    ),
  ].join("\n");
}

export function downloadCsv(filename, rows) {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export function getSupabaseMessage(error) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Correo o contrasena incorrectos. Revisa los datos que te dio el administrador.";
  }

  if (message.includes("failed to fetch") || message.includes("network")) {
    return "No se pudo conectar con la base de datos. Revisa internet y vuelve a intentar.";
  }

  if (message.includes("invalid path specified")) {
    return "La conexion con Supabase no esta usando una ruta valida. Revisa las variables de entorno.";
  }

  if (message.includes("jwt")) {
    return "Tu sesion vencio. Cierra sesion y vuelve a entrar.";
  }

  return (
    error?.message ||
    "No se pudo completar la accion. Revisa la conexion o permisos."
  );
}

export function getTrialText(empresa) {
  if (!empresa?.trial_ends_at || empresa?.estado !== "BETA") {
    return empresa?.estado === "ACTIVO"
      ? "Plan activo"
      : empresa?.estado || "Acceso activo";
  }

  const left = daysUntil(empresa.trial_ends_at);

  if (left === null) return "Beta activa";
  if (left < 0) return "Beta vencida";
  if (left === 0) return "Beta vence hoy";
  return `Beta: ${left} dias`;
}

export function groupByCategory(productos = [], movimientos = []) {
  const productsById = new Map(
    productos.map((product) => [product.id, product])
  );

  return movimientos.reduce((map, movement) => {
    const product = movement.productos || productsById.get(movement.producto_id);
    const category = product?.categoria || "Sin categoria";
    const current = map.get(category) || {
      categoria: category,
      entradas: 0,
      salidas: 0,
      perdidas: 0,
      costoPerdida: 0,
    };

    const amount = toNumber(movement.cantidad);

    if (movement.tipo === "ENTRADA") current.entradas += amount;
    if (movement.tipo === "SALIDA") current.salidas += amount;

    if (
      String(movement.observacion || "")
        .toLowerCase()
        .includes("perdida")
    ) {
      current.perdidas += amount;
      current.costoPerdida +=
        amount * toNumber(product?.precio_compra || product?.precio_venta);
    }

    map.set(category, current);
    return map;
  }, new Map());
}

export function getReorderList(productos = []) {
  return productos
    .filter(
      (product) =>
        toNumber(product.stock) <= toNumber(product.stock_minimo)
    )
    .map((product) => {
      const target = Math.max(toNumber(product.stock_minimo) * 2, 1);
      const cantidad = Math.max(target - toNumber(product.stock), 1);

      return {
        ...product,
        cantidad_sugerida: cantidad,
        inversion_estimada:
          cantidad * toNumber(product.precio_compra || product.precio_venta),
      };
    })
    .sort((a, b) => b.inversion_estimada - a.inversion_estimada);
}

export function parseCsv(text) {
  const rows = [];
  let current = [];
  let cell = "";
  let inQuotes = false;

  String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("").forEach((char, index, chars) => {
    const next = chars[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      return;
    }

    if (char === '"' && chars[index - 1] === '"' && inQuotes) {
      return;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      return;
    }

    if (char === "," && !inQuotes) {
      current.push(cell.trim());
      cell = "";
      return;
    }

    if (char === "\n" && !inQuotes) {
      current.push(cell.trim());
      if (current.some(Boolean)) rows.push(current);
      current = [];
      cell = "";
      return;
    }

    cell += char;
  });

  current.push(cell.trim());
  if (current.some(Boolean)) rows.push(current);

  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().toLowerCase());

  return rows.slice(1).map((row) => {
    return headers.reduce((record, header, index) => {
      record[header] = row[index] || "";
      return record;
    }, {});
  });
}

export function buildWhatsAppUrl(phone, message) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  const encodedMessage = encodeURIComponent(message);

  if (!cleanPhone) {
    return `https://wa.me/?text=${encodedMessage}`;
  }

  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}
