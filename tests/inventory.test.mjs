import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCsv,
  generateProductCode,
  getCategoryOptions,
  normalizeCategoryName,
  parseCsv,
} from "../src/utils/inventory.js";
import {
  getPayableState,
  summarizePayables,
} from "../src/utils/payables.js";

test("generateProductCode uses category prefix and next available number", () => {
  const code = generateProductCode({
    categoria: "Bebidas",
    nombre: "Gaseosa",
    productos: [
      { codigo: "BEB-0001" },
      { codigo: "BEB-0002" },
    ],
  });

  assert.equal(code, "BEB-0003");
});

test("category helpers normalize duplicated spellings", () => {
  const categorias = getCategoryOptions([
    { categoria: " bebidas " },
    { categoria: "Bebidas" },
    { categoria: "abarrotes" },
  ]);

  assert.deepEqual(categorias, ["Abarrotes", "Bebidas"]);
  assert.equal(normalizeCategoryName("bebidas", categorias), "Bebidas");
});

test("CSV export and import preserve commas inside quoted cells", () => {
  const csv = buildCsv([
    {
      codigo: "PRO-0001",
      nombre: "Combo arroz, azucar",
      categoria: "Abarrotes",
    },
  ]);

  const rows = parseCsv(csv);

  assert.deepEqual(rows, [
    {
      codigo: "PRO-0001",
      nombre: "Combo arroz, azucar",
      categoria: "Abarrotes",
    },
  ]);
});

test("payables classify overdue, upcoming and paid accounts", () => {
  const today = new Date(2026, 5, 20);
  const overdue = getPayableState(
    { fecha_vencimiento: "2026-06-18", saldo: 100, estado: "PENDIENTE" },
    today
  );
  const upcoming = getPayableState(
    {
      fecha_vencimiento: "2026-06-23",
      saldo: 80,
      estado: "PARCIAL",
      recordatorio_dias: 3,
    },
    today
  );
  const paid = getPayableState(
    { fecha_vencimiento: "2026-06-18", saldo: 0, estado: "PAGADO" },
    today
  );

  assert.equal(overdue.key, "VENCIDO");
  assert.equal(upcoming.key, "PROXIMO");
  assert.equal(paid.key, "PAGADO");
});

test("payable summary adds only open balances", () => {
  const summary = summarizePayables(
    [
      { fecha_vencimiento: "2026-06-18", saldo: 100, estado: "PENDIENTE" },
      {
        fecha_vencimiento: "2026-06-23",
        saldo: 80,
        estado: "PARCIAL",
        recordatorio_dias: 3,
      },
      { fecha_vencimiento: "2026-06-10", saldo: 0, estado: "PAGADO" },
    ],
    new Date(2026, 5, 20)
  );

  assert.equal(summary.pending, 180);
  assert.equal(summary.overdue, 100);
  assert.equal(summary.dueSoon, 80);
  assert.equal(summary.open, 2);
});
