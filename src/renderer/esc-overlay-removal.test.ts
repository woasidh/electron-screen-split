import { expect, test } from "vitest";
import viteConfig from "../../vite.config";

test("does not bundle an ESC overlay page", () => {
  const rollupOptions = viteConfig.build?.rollupOptions as
    | { input?: Record<string, string> }
    | undefined;

  expect(rollupOptions?.input).not.toHaveProperty("overlay");
});
