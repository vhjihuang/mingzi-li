/**
 * 共享 Express app —— 本地 dev (server.ts) 和 Vercel serverless (api/index.ts) 的单一源。
 * ponytail: 消除 server.ts 与 api/index.ts 的 280 行重复代码。
 */
import express from "express";
import crypto from "crypto";
import OpenAI from "openai";
import { mockBatch1, mockShortlists } from "./data/mockData.ts";

// ponytail: cnchar 懒加载——顶层 import 在 Vercel serverless 下崩溃，
// 延迟到首次调用 tip() 时加载。
let _cnchar: any = null;
async function ensureCnchar() {
  if (_cnchar !== null) return;
  try {
    const mod = await import("cnchar");
    _cnchar = mod.default;
    // @ts-ignore — cnchar 插件无类型声明
    await import("cnchar-poly");
  } catch (e) {
    console.error("[cnchar] lazy load failed:", e);
    _cnchar = false;
  }
}

// ── 配置 ──

const AI_MODEL = "glm-4.7";

// ponytail: 懒加载——ESM import 提升，dotenv 在 app.ts 加载后才跑，
// 模块级 const 会读到 undefined。延迟到首请求时创建。
let _ai: OpenAI | null | undefined;
function getAi(): OpenAI | null {
  if (_ai === undefined) {
    _ai = process.env.GLM_API_KEY
      ? new OpenAI({
          apiKey: process.env.GLM_API_KEY,
          baseURL: "https://open.bigmodel.cn/api/paas/v4",
          timeout: 30000,
          maxRetries: 2,
        })
      : null;
  }
  return _ai;
}

// ponytail: 内存 session，demo 够用。Vercel serverless 无状态会丢，但 mock fallback 兜底
const sessionStore = new Map<string, any>();

// ── 工具函数 ──

function sanitize(input: string): string {
  return input.replace(/[\r\n\t]/g, " ").replace(/[^\S ]/g, "").trim().slice(0, 200);
}

function parseAiJson(text: string): any[] {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const data = JSON.parse(s);
  if (!data?.candidates) throw new Error("missing candidates");
  return data.candidates;
}

function tip(name: string): string {
  if (!_cnchar) return "";
  try {
    const chars = name.split("");
    const py = _cnchar.spell(name, "array", "tone") as string[];
    const strokes = chars.map((c) => _cnchar.stroke(c) as number);
    const total = strokes.reduce((a, b) => a + b, 0);
    return `读音 ${py.join(" ")}｜笔画 ${chars.map((c, i) => `${c}${strokes[i]}`).join(" ")}（共${total}画）`;
  } catch {
    return "";
  }
}

function withIds<T>(arr: T[]): (T & { id: string })[] {
  return arr.map((c) => ({ ...c, id: crypto.randomUUID() }));
}

function ensureSurname<T extends { name: string }>(arr: T[], surname: string): T[] {
  return arr.map((c) => (c.name.startsWith(surname) ? c : { ...c, name: surname + c.name }));
}

function dedupe<T extends { name: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((c) => !seen.has(c.name) && seen.add(c.name));
}

/** ponytail: 合并 batch1 和 shortlist 的校验+归一化，用字段检查代替两个独立函数 */
function normalize(raw: any[], surname: string, isShortlist: boolean): any[] {
  const withId = dedupe(ensureSurname(withIds(raw), surname));
  const ok = withId.length > 0 && withId.every((c) =>
    c.name && c.meaning && c.origin &&
    (!isShortlist || (c.coreMeaning && c.fitReason && typeof c.tip === "string"))
  );
  return ok ? withId : [];
}

/** ponytail: 合并两个 90% 相同的 prompt builder。batch-1 用 isBatch1 控制 */
function buildPrompt(opts: {
  surname: string; expectations: string[]; feedbacks: any[];
  refinements: string[]; note: string; excludeNames?: string[]; isBatch1?: boolean;
}): string {
  const surname = sanitize(opts.surname);
  const exp = opts.expectations.map(sanitize).join("、");

  // ponytail: batch-1 是简单场景，不需要 feedbacks/exclude/shortlist 字段
  if (opts.isBatch1) {
    return `你是专业中文起名大师。请根据以下要求提供 6 个中文名字。
姓氏：${surname}
名字传达的感受：${exp}
补充说明：${opts.note ? sanitize(opts.note) : "无"}

返回 JSON: {"candidates":[{"name":"全名","meaning":"约20字寓意","origin":"出处，如诗词古籍或意象"}]}`;
  }

  const ref = opts.refinements.map(sanitize).join("、");
  const note = opts.note ? sanitize(opts.note) : "无";

  const fb = opts.feedbacks.map((f) => {
    const label = f.feedback === "like" ? "喜欢" : f.feedback === "dislike" ? "不喜欢" : "一般";
    return `- 名字"${sanitize(f.name || "")}"（寓意：${sanitize(f.meaning || "")}，出处：${sanitize(f.origin || "")}），用户感觉：${label}（补充：${f.reason ? sanitize(f.reason) : "无"}）`;
  }).join("\n");

  const liked = opts.feedbacks.filter((f) => f.feedback === "like");
  const likedNote = liked.length > 0
    ? `\n**特别注意**：用户喜欢 ${liked.map((n) => sanitize(n.name || "")).join("、")}，务必原样保留在结果中。对这些名字的 fitReason 必须结合出处典故和微调方向(${ref})深入分析，不要套话。`
    : "";

  const exclude = opts.excludeNames?.length
    ? `\n【去重】不要再推荐：${opts.excludeNames.map(sanitize).join("、")}（保留的喜欢名字除外）。`
    : "";

  const isRefresh = !!opts.excludeNames;
  const header = isRefresh
    ? "用户正在换一批深度筛选的名字。请给出另外 3 个完全不同的高品质候选（保留的喜欢名字除外）。"
    : "在第一轮初选后，用户给出了反馈。请给出 3 个最终版深度候选（避开不喜欢的风格，发扬喜欢的风格）。";

  return `你是专业中文起名大师。${header}
姓氏：${surname}
期待：${exp}
微调方向：${ref}
附加要求：${note}
用户反馈：
${fb || "无"}${likedNote}${exclude}

返回 JSON: {"candidates":[{"name":"全名","meaning":"一句话寓意","origin":"出处","coreMeaning":"4-8字核心标签","fitReason":"50-80字深入分析为何契合","tip":""}]}`;
}

// ── AI 调用 ──

async function callAi(prompt: string, temp: number, maxTokens: number): Promise<any[]> {
  const client = getAi();
  if (!client) return [];
  const res = await client.chat.completions.create({
    model: AI_MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" }, // ponytail: 关思考 4s vs 47s
    temperature: temp,
    max_tokens: maxTokens,
  } as any);
  return parseAiJson(res.choices[0]?.message?.content || "");
}

/** ponytail: 一个 retry helper 替代 3 处重复的 try/catch/retry */
async function callWithRetry(prompt: string, temp: number, maxTokens: number): Promise<any[]> {
  try {
    const raw = await callAi(prompt, temp, maxTokens);
    if (raw.length > 0) return raw;
    return await callAi(prompt, temp, maxTokens); // 空结果重试一次
  } catch (e) {
    console.error("[ai]", e);
    return [];
  }
}

// ── 后处理 ──

function applyTip(candidates: any[]) {
  return candidates.map((c) => ({ ...c, tip: tip(c.name) }));
}

function mergeLiked(candidates: any[], likedFb: any[], surname: string, ref: string[]) {
  if (likedFb.length === 0) return candidates;
  const likedNames = new Set(likedFb.map((f) => f.name || ""));
  const liked = likedFb.map((f) => {
    const name = f.name?.startsWith(surname) ? f.name : surname + (f.name || "");
    return {
      id: `liked-${f.candidateId}`, name, meaning: f.meaning || "", origin: f.origin || "",
      coreMeaning: "经典佳名",
      fitReason: `出自"${f.origin || "经典典故"}"，${f.meaning}。结合"${ref[0] || "整体气质"}"非常契合。`,
      tip: tip(name),
    };
  }).filter(Boolean);
  return [...liked, ...candidates.filter((c) => !likedNames.has(c.name))].slice(0, Math.max(3, liked.length));
}

function fallbackBatch1(): any[] {
  return mockBatch1.map((c) => ({ ...c, id: crypto.randomUUID() }));
}

function fallbackShortlist(): any[] {
  return mockShortlists[0].map((c) => ({ ...c, id: crypto.randomUUID() }));
}

// ── Express app ──

export function createApp() {
  const app = express();
  app.use(express.json());

  app.post("/api/naming/batch-1", async (req, res) => {
    const { surname, expectations, additionalNote } = req.body;
    if (!surname || !Array.isArray(expectations) || !expectations.length) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }

    const requestId = crypto.randomUUID();
    const session = { surname, expectations, batch1Shown: [] as string[], shortlistShown: [] as string[] };
    sessionStore.set(requestId, session);

    let candidates = normalize(
      await callWithRetry(
        buildPrompt({ surname, expectations, feedbacks: [], refinements: [], note: additionalNote || "", isBatch1: true }),
        0.8, 800
      ), surname, false
    );
    if (candidates.length === 0) candidates = fallbackBatch1();

    candidates.forEach((c) => session.batch1Shown.push(c.name));
    console.log(`[batch-1] rid=${requestId.slice(0, 8)} count=${candidates.length}`);
    res.json({ requestId, candidates });
  });

  app.post("/api/naming/shortlist", async (req, res) => {
    const { requestId, surname, expectations, candidateFeedbacks, refinements, refinementNote } = req.body;
    if (!surname || !Array.isArray(expectations) || !Array.isArray(candidateFeedbacks) || !Array.isArray(refinements)) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }

    const shortlistId = crypto.randomUUID();
    const session = sessionStore.get(requestId) || { surname, expectations, batch1Shown: [], shortlistShown: [] };
    const likedFb = candidateFeedbacks.filter((f: any) => f.feedback === "like");

    let candidates = normalize(
      await callWithRetry(
        buildPrompt({ surname, expectations, feedbacks: candidateFeedbacks, refinements, note: refinementNote || "" }),
        0.7, 1000
      ), surname, true
    );
    if (candidates.length === 0) candidates = fallbackShortlist();

    await ensureCnchar();
    candidates = applyTip(candidates);
    candidates = mergeLiked(candidates, likedFb, surname, refinements);
    sessionStore.set(shortlistId, session);
    candidates.forEach((c) => session.shortlistShown.push(c.name));
    console.log(`[shortlist] rid=${shortlistId.slice(0, 8)} count=${candidates.length}`);
    res.json({ shortlistRequestId: shortlistId, candidates });
  });

  app.post("/api/naming/shortlist/refresh", async (req, res) => {
    const { shortlistRequestId: prevId, surname, expectations, candidateFeedbacks, refinements, refinementNote, excludeCandidateNames } = req.body;
    const session = sessionStore.get(prevId) || { surname, expectations, batch1Shown: [], shortlistShown: [] };
    const exclude = new Set<string>([
      ...(Array.isArray(excludeCandidateNames) ? excludeCandidateNames : []),
      ...(session.shortlistShown || []),
    ]);
    const likedFb = candidateFeedbacks.filter((f: any) => f.feedback === "like");
    likedFb.forEach((f: any) => exclude.delete(f.name || ""));

    let candidates = normalize(
      await callWithRetry(
        buildPrompt({ surname, expectations, feedbacks: candidateFeedbacks, refinements, note: refinementNote || "", excludeNames: [...exclude] }),
        0.7, 1000
      ), surname, true
    ).filter((c) => !exclude.has(c.name));

    if (candidates.length === 0) {
      res.status(400).json({ error: "NO_MORE_CANDIDATES" });
      return;
    }

    await ensureCnchar();
    candidates = applyTip(candidates);
    candidates = mergeLiked(candidates, likedFb, surname, refinements);
    const shortlistId = crypto.randomUUID();
    sessionStore.set(shortlistId, session);
    console.log(`[refresh] rid=${shortlistId.slice(0, 8)} count=${candidates.length}`);
    res.json({ shortlistRequestId: shortlistId, candidates });
  });

  return app;
}
