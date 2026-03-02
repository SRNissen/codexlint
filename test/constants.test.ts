import { describe, expect, it } from "vitest";
import { DEBUG_ENV_COMMAND_ID } from "../src/constants.js";

describe("extension constants", () => {
  it("uses the project command namespace", () => {
    expect(DEBUG_ENV_COMMAND_ID).toBe("codexlint.debugEnvironment");
  });
});
