import assert from "node:assert/strict";

suite("parseJsonLenient", () => {
  test("parses direct findings array JSON", async () => {
    const { parseJsonLenient } = await import("../../src/analyze.js");
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

  test("parses fenced json block", async () => {
    const { parseJsonLenient } = await import("../../src/analyze.js");
    const parsed = parseJsonLenient(
      [
        "Analyzer output:",
        "```json",
        '{"findings":[{"message":"fenced","severity":"warning","line":1,"column":1}]}',
        "```"
      ].join("\n")
    );

    assert.equal(typeof parsed, "object");
    assert.ok(parsed !== null, "expected object result");
    assert.ok(Array.isArray((parsed as { findings?: unknown }).findings), "expected findings array");
  });

  test("parses embedded object json", async () => {
    const { parseJsonLenient } = await import("../../src/analyze.js");
    const parsed = parseJsonLenient(
      'prefix {"findings":[{"message":"embedded","severity":"warning","line":1,"column":1}]} suffix'
    );

    assert.equal(typeof parsed, "object");
    assert.ok(parsed !== null, "expected object result");
    const findings = (parsed as { findings?: unknown }).findings;
    assert.ok(Array.isArray(findings), "expected findings array");
    assert.equal(findings.length, 1);
  });

  test("returns warning finding when output is not JSON", async () => {
    const { parseJsonLenient } = await import("../../src/analyze.js");
    const parsed = parseJsonLenient("this is not json output");

    assert.equal(typeof parsed, "object");
    assert.ok(parsed !== null, "expected parser result object");

    const findings = (parsed as { findings?: unknown }).findings;
    assert.ok(Array.isArray(findings), "expected findings array");
    assert.equal(findings.length, 1);

    const [entry] = findings as Array<{ message?: unknown; severity?: unknown }>;
    assert.equal(typeof entry?.message, "string");
    assert.match(String(entry?.message), /analysis command returned non-JSON output/i);
    assert.equal(entry?.severity, "warning");
  });

  test("returns warning finding when output is empty", async () => {
    const { parseJsonLenient } = await import("../../src/analyze.js");
    const parsed = parseJsonLenient(" \n\t ");
    const findings = (parsed as { findings?: unknown }).findings;

    assert.ok(Array.isArray(findings), "expected findings array");
    assert.equal(findings.length, 1);
    const [entry] = findings as Array<{ message?: unknown }>;
    assert.match(String(entry?.message), /returned empty output/i);
  });
});
