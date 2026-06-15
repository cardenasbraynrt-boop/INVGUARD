import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCsv,
  generateProductCode,
  getCategoryOptions,
  normalizeCategoryName,
  parseCsv,
} from "../src/utils/inventory.js";

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
