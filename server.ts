/**
 * 本地开发服务器 —— import 共享 app + 加 Vite dev middleware。
 * ponytail: 从 846 行缩减到 ~30 行，业务逻辑全部在 src/app.ts。
 */
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createApp } from "./src/app";

dotenv.config({ path: ".env.local" });

const PORT = parseInt(process.env.PORT || "3002", 10);

async function start() {
  const app = createApp();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), "dist");
    app.use((await import("express")).default.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    const hasKey = !!process.env.GLM_API_KEY;
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`AI client: ${hasKey ? "enabled (GLM-4.7)" : "disabled (no GLM_API_KEY)"}`);
  });
}

start();
