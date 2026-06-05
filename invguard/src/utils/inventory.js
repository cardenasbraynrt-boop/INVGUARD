export const money = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

export const numberFormat = new Intl.NumberFormat("es-PE");

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
  return (
    error?.message ||
    "No se pudo completar la operacion. Revise la conexion o permisos."
  );
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
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length < 2) return [];

  const headers = rows[0]
    .split(",")
    .map((header) => header.trim().toLowerCase());

  return rows.slice(1).map((row) => {
    const cells = row.split(",").map((cell) => cell.trim());
    return headers.reduce((record, header, index) => {
      record[header] = cells[index] || "";
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
