import { describe, expect, it } from "vitest";
import { HELLO_COMMAND_ID } from "../src/constants.js";

describe("extension constants", () => {
  it("uses the project command namespace", () => {
    expect(HELLO_COMMAND_ID).toBe("codexlint.hello");
  });
});
