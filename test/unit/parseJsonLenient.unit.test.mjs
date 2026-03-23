import assert from "node:assert/strict";
import test from "node:test";
import { parseJsonLenient } from "../../src/analyzeCore.ts";

test("parseJsonLenient parses direct findings array JSON", () => {
  const parsed = parseJsonLenient(
    JSON.stringify([
      {
        message: "a",
        severity: "warning",
        line: 1,
        column: 1
      }
    ])
  );

  assert.ok(Array.isArray(parsed), "expected parsed result to be an array");
  assert.equal(parsed.length, 1);
});

test("parseJsonLenient parses fenced json block", () => {
  const parsed = parseJsonLenient(
    `Analyzer output:
\`\`\`json
{"findings":[{"message":"fenced","severity":"warning","line":1,"column":1}]}
\`\`\``
  );

  assert.equal(typeof parsed, "object");
  assert.ok(parsed !== null, "expected object result");
  assert.ok(Array.isArray(parsed.findings), "expected findings array");
});

test("parseJsonLenient parses embedded object json", () => {
  const parsed = parseJsonLenient(
    'prefix {"findings":[{"message":"embedded","severity":"warning","line":1,"column":1}]} suffix'
  );

  assert.equal(typeof parsed, "object");
  assert.ok(parsed !== null, "expected object result");
  assert.ok(Array.isArray(parsed.findings), "expected findings array");
  assert.equal(parsed.findings.length, 1);
});

test("parseJsonLenient returns warning finding when output is not JSON", () => {
  const parsed = parseJsonLenient("this is not json output");

  assert.equal(typeof parsed, "object");
  assert.ok(parsed !== null, "expected parser result object");
  assert.ok(Array.isArray(parsed.findings), "expected findings array");
  assert.equal(parsed.findings.length, 1);

  const [entry] = parsed.findings;
  assert.equal(typeof entry?.message, "string");
  assert.match(String(entry?.message), /analysis command returned non-JSON output/i);
  assert.equal(entry?.severity, "warning");
});

test("parseJsonLenient returns warning finding when output is empty", () => {
  const parsed = parseJsonLenient(" \n\t ");

  assert.equal(typeof parsed, "object");
  assert.ok(parsed !== null, "expected parser result object");
  assert.ok(Array.isArray(parsed.findings), "expected findings array");
  assert.equal(parsed.findings.length, 1);

  const [entry] = parsed.findings;
  assert.match(String(entry?.message), /returned empty output/i);
});
