import type { IncomingMessage } from "node:http";
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import { runAgent } from "./api/_agent-core";

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function localAgentApi(environment: Record<string, string>): Plugin {
  return {
    name: "workgraph-local-agent-api",
    configureServer(server) {
      server.middlewares.use("/api/agent", async (request, response) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");

        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end(JSON.stringify({ error: "仅支持 POST" }));
          return;
        }

        try {
          const result = await runAgent(await readJsonBody(request), {
            apiKey: environment.WORKGRAPH_AI_API_KEY,
            baseUrl: environment.WORKGRAPH_AI_BASE_URL,
            model: environment.WORKGRAPH_AI_MODEL,
          });
          response.statusCode = 200;
          response.end(JSON.stringify(result));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Agent 请求失败";
          response.statusCode =
            error instanceof Error && error.name === "ConfigurationError" ? 503 : 400;
          response.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  return {
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    localAgentApi(environment),
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }), 
    tsconfigPaths()
  ],
  };
})
