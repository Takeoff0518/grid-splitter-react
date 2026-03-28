import { defineConfig, loadConfigFromFile } from "vite";
import path from "path";
import type { ConfigEnv } from "vite";

export default defineConfig(async ({ command, mode }) => {
  const env: ConfigEnv = { command, mode };
  const configFile = path.resolve(__dirname, "vite.config.ts");
  
  const result = await loadConfigFromFile(env, configFile);
  const userConfig = result?.config || {};

  return {
    ...userConfig,
    server: {
      open: true,
      host: true,
    },
    cacheDir: path.resolve(__dirname, "node_modules/.vite"),
  };
});