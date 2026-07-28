/**
 * 共享 Express app —— 本地 dev (server.ts) 和 Vercel serverless (api/index.ts) 的单一源。
 * ponytail: 消除 server.ts 与 api/index.ts 的 280 行重复代码。
 */
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import crypto from "crypto";
import OpenAI from "openai";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { mockBatch1, mockShortlists } from "./data/mockData.ts";

// ponytail: cnchar 懒加载——顶层 import 在 Vercel serverless 下崩溃，
// 延迟到首次调用 tip() 时加载。
interface CncharApi {
  spell(name: string, mode: "array", tone: "tone"): string[];
  stroke(character: string): number;
}

let _cnchar: CncharApi | false | null = null;
async function ensureCnchar() {
  if (_cnchar !== null) return;
  try {
    const mod = await import("cnchar");
    _cnchar = mod.default as CncharApi;
    // @ts-ignore — cnchar 插件无类型声明
    await import("cnchar-poly");
  } catch (e) {
    console.error("[cnchar] lazy load failed:", e);
    _cnchar = false;
  }
}

// ── 配置 ──

const AI_MODEL = "glm-4.7";
const AI_TIMEOUT_MS = 18_000;
const BATCH_SIZE = 6;
const SHORTLIST_SIZE = 3;
const DEFAULT_RATE_LIMIT_MAX = 30;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export interface AppOptions {
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  aiClient?: OpenAI | null;
  onMetric?: (metric: NamingMetric) => void;
  trustProxy?: boolean;
}

type AiFailureReason =
  | "AI_NOT_CONFIGURED"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_AUTH_ERROR"
  | "AI_INVALID_RESPONSE"
  | "AI_PROVIDER_ERROR"
  | "AI_RESULT_REJECTED";

interface AiCallResult {
  candidates: unknown[];
  failureReason?: AiFailureReason;
  attemptCount: number;
}

interface GenerationMeta {
  source: "ai" | "mixed" | "fallback";
  degraded: boolean;
  degradationReason?: AiFailureReason;
}

export interface NamingMetric {
  event: "naming_request";
  endpoint: string;
  method: string;
  status: number;
  durationMs: number;
  requestId?: string;
  source?: GenerationMeta["source"];
  degraded?: boolean;
  degradationReason?: AiFailureReason;
  aiAttemptCount?: number;
  acceptedAiCandidateCount?: number;
  fallbackCandidateCount?: number;
}

interface GenerationMetricFields {
  requestId: string;
  source: GenerationMeta["source"];
  degraded: boolean;
  degradationReason?: AiFailureReason;
  aiAttemptCount: number;
  acceptedAiCandidateCount: number;
  fallbackCandidateCount: number;
}

// ponytail: 懒加载——ESM import 提升，dotenv 在 app.ts 加载后才跑，
// 模块级 const 会读到 undefined。延迟到首请求时创建。
let _ai: OpenAI | null | undefined;
function getAi(): OpenAI | null {
  if (_ai === undefined) {
    _ai = process.env.GLM_API_KEY
      ? new OpenAI({
          apiKey: process.env.GLM_API_KEY,
          baseURL: "https://open.bigmodel.cn/api/paas/v4",
          timeout: AI_TIMEOUT_MS,
          maxRetries: 0,  // ponytail: 关 SDK 内置重试，由 callWithRetry 显式控制，避免叠加到 90s+
        })
      : null;
  }
  return _ai;
}

// ── 工具函数 ──

function sanitize(input: string): string {
  return input.replace(/[\r\n\t]/g, " ").replace(/[^\S ]/g, "").trim().slice(0, 200);
}

function parseAiJson(text: string): unknown[] {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const data = JSON.parse(s);
  if (!Array.isArray(data?.candidates)) throw new Error("missing candidates");
  return data.candidates;
}

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().default("");
const optionalNullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const requestIdSchema = z.string().trim().min(1).max(100).optional();
const surnameSchema = z.string()
  .trim()
  .min(1, "surname is required")
  .max(2, "surname must contain at most 2 characters")
  .regex(/^\p{Script=Han}+$/u, "surname must contain Chinese characters only");
const expectationsSchema = z.array(nonEmptyText(30)).min(1).max(3);
const refinementsSchema = z.array(nonEmptyText(30)).max(10);
const candidateFeedbackSchema = z.object({
  candidateId: nonEmptyText(100),
  feedback: z.enum(["like", "neutral", "dislike"]),
  reason: optionalNullableText(100),
  name: z.string().trim().max(10).optional(),
  meaning: z.string().trim().max(200).optional(),
  origin: z.string().trim().max(200).optional(),
}).strict();
const candidateFeedbacksSchema = z.array(candidateFeedbackSchema).min(1).max(20);
const excludeNamesSchema = z.array(nonEmptyText(10)).max(200).optional().default([]);

const batch1RequestSchema = z.object({
  surname: surnameSchema,
  expectations: expectationsSchema,
  additionalNote: optionalText(200),
}).strict();

const shortlistRequestSchema = z.object({
  requestId: requestIdSchema,
  surname: surnameSchema,
  expectations: expectationsSchema,
  additionalNote: optionalText(200),
  candidateFeedbacks: candidateFeedbacksSchema,
  refinements: refinementsSchema,
  refinementNote: optionalText(200),
  excludeNames: excludeNamesSchema,
}).strict();

const shortlistRefreshRequestSchema = z.object({
  requestId: requestIdSchema,
  shortlistRequestId: requestIdSchema,
  surname: surnameSchema,
  expectations: expectationsSchema,
  additionalNote: optionalText(200),
  candidateFeedbacks: candidateFeedbacksSchema,
  refinements: refinementsSchema,
  refinementNote: optionalText(200),
  excludeCandidateNames: excludeNamesSchema,
}).strict();

const candidateOutputSchema = z.object({
  name: nonEmptyText(10),
  meaning: nonEmptyText(300),
  origin: nonEmptyText(300),
});

const refinedCandidateOutputSchema = candidateOutputSchema.extend({
  coreMeaning: nonEmptyText(50),
  fitReason: nonEmptyText(500),
  tip: z.string().max(300),
});

type CandidateOutput = z.output<typeof candidateOutputSchema>;
type RefinedCandidateOutput = z.output<typeof refinedCandidateOutputSchema>;
type CandidateWithId = CandidateOutput & { id: string };
type RefinedCandidateWithId = RefinedCandidateOutput & { id: string };
type CandidateFeedback = z.output<typeof candidateFeedbackSchema>;
type PreservedFeedback = CandidateFeedback & { name: string };

function parseRequest<T extends z.ZodType>(
  schema: T,
  req: Request,
  res: Response,
): z.output<T> | null {
  const result = schema.safeParse(req.body);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  res.status(400).json({
    error: "INVALID_REQUEST",
    message: `${field}${issue?.message || "invalid request payload"}`,
  });
  return null;
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function shouldTrustProxy(options: AppOptions): boolean {
  if (typeof options.trustProxy === "boolean") return options.trustProxy;
  if (process.env.TRUST_PROXY === "true") return true;
  if (process.env.TRUST_PROXY === "false") return false;
  return process.env.VERCEL === "1";
}

function tip(name: string): string {
  const cnchar = _cnchar;
  if (!cnchar) return "";
  try {
    const chars = name.split("");
    const py = cnchar.spell(name, "array", "tone");
    const strokes = chars.map((c) => cnchar.stroke(c));
    const total = strokes.reduce((a, b) => a + b, 0);
    return `读音 ${py.join(" ")}｜笔画 ${chars.map((c, i) => `${c}${strokes[i]}`).join(" ")}（共${total}画）`;
  } catch {
    return "";
  }
}

function withIds<T>(arr: T[]): (T & { id: string })[] {
  return arr.map((c) => ({ ...c, id: crypto.randomUUID() }));
}

function isValidFullName(name: string, surname: string): boolean {
  return name.startsWith(surname)
    && name.length > surname.length
    && name.length <= 6
    && /^\p{Script=Han}+$/u.test(name);
}

const prohibitedContentPattern = /完美契合|完美满足|唯一最佳|保证/;

function isTransparentOrigin(origin: string): boolean {
  if (/(出自|源自|见于)/u.test(origin)) return false;
  return /(取意|意象|字义|字意|化用)/u.test(origin);
}

function hasProhibitedContent(candidate: {
  meaning: string;
  origin: string;
  coreMeaning?: string;
  fitReason?: string;
}): boolean {
  return [candidate.meaning, candidate.origin, candidate.coreMeaning, candidate.fitReason]
    .filter((value): value is string => typeof value === "string")
    .some((value) => prohibitedContentPattern.test(value));
}

function dedupe<T extends { name: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((c) => !seen.has(c.name) && seen.add(c.name));
}

/** 校验并归一化模型输出；不可信的模型响应会进入 fallback。 */
function normalize<T extends CandidateOutput>(
  raw: unknown,
  surname: string,
  candidateSchema: z.ZodType<T>,
): (T & { id: string })[] {
  const parsed = z.array(candidateSchema).min(1).max(20).safeParse(raw);
  if (!parsed.success) return [];
  return dedupe(withIds(parsed.data.filter((candidate) => (
    isValidFullName(candidate.name, surname)
    && isTransparentOrigin(candidate.origin)
    && !hasProhibitedContent(candidate)
  ))));
}

/** ponytail: 合并两个 90% 相同的 prompt builder。batch-1 用 isBatch1 控制 */
function buildPrompt(opts: {
  surname: string; expectations: string[]; feedbacks: CandidateFeedback[];
  refinements: string[]; note: string; excludeNames?: string[]; isBatch1?: boolean; isRefresh?: boolean;
}): string {
  const surname = sanitize(opts.surname);
  const exp = opts.expectations.map(sanitize).join("、");

  // ponytail: batch-1 是简单场景，不需要 feedbacks/exclude/shortlist 字段
  if (opts.isBatch1) {
    return `你是专业中文起名大师。请根据以下要求提供 6 个中文名字。
姓氏：${surname}
名字传达的感受：${exp}
补充说明：${opts.note ? sanitize(opts.note) : "无"}

来源说明规则：统一写作“取意于……意象”“取……字义”或“化用……意象”；不得使用“出自”“源自”“见于”或编造出处。不得使用“完美契合”“唯一最佳”“保证”等绝对化表述。

返回 JSON: {"candidates":[{"name":"全名","meaning":"约20字寓意","origin":"取意说明"}]}`;
  }

  const ref = opts.refinements.map(sanitize).join("、");
  const note = opts.note ? sanitize(opts.note) : "无";

  const fb = opts.feedbacks.map((f) => {
    const label = f.feedback === "like" ? "喜欢" : f.feedback === "dislike" ? "不喜欢" : "一般";
    return `- 名字"${sanitize(f.name || "")}"（寓意：${sanitize(f.meaning || "")}，取意说明：${sanitize(f.origin || "")}），用户感觉：${label}（补充：${f.reason ? sanitize(f.reason) : "无"}）`;
  }).join("\n");

  const liked = opts.feedbacks.filter((f) => f.feedback === "like");
  const likedNote = liked.length > 0
    ? `\n**特别注意**：用户喜欢 ${liked.map((n) => sanitize(n.name || "")).join("、")}，务必原样保留在结果中。对这些名字的 fitReason 必须结合取意说明和微调方向(${ref})深入分析，不要套话。`
    : "";

  const exclude = opts.excludeNames?.length
    ? `\n【去重】不要再推荐：${opts.excludeNames.map(sanitize).join("、")}（保留的喜欢名字除外）。`
    : "";

  const isRefresh = opts.isRefresh ?? false; // ponytail: 解耦 isRefresh 和 excludeNames，shortlist 也可传 excludeNames
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

来源说明规则：统一写作“取意于……意象”“取……字义”或“化用……意象”；不得使用“出自”“源自”“见于”或编造出处。不得使用“完美契合”“唯一最佳”“保证”等绝对化表述。

返回 JSON: {"candidates":[{"name":"全名","meaning":"一句话寓意","origin":"取意说明","coreMeaning":"4-8字核心标签","fitReason":"50-80字深入分析为何契合","tip":""}]}`;
}

// ── AI 调用 ──

async function callAi(client: OpenAI, prompt: string, temp: number, maxTokens: number): Promise<unknown[]> {
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

function classifyAiError(error: unknown): { reason: AiFailureReason; retryable: boolean; status?: number } {
  const value = error as { name?: string; message?: string; status?: number };
  const status = value?.status;
  const name = value?.name || "";
  const message = value?.message || "";

  if (status === 401 || status === 403) {
    return { reason: "AI_AUTH_ERROR", retryable: false, status };
  }
  if (status === 429) {
    return { reason: "AI_RATE_LIMITED", retryable: false, status };
  }
  if (
    name.includes("Timeout")
    || name === "AbortError"
    || message.toLowerCase().includes("timeout")
  ) {
    return { reason: "AI_TIMEOUT", retryable: true, status };
  }
  if (error instanceof SyntaxError || message === "missing candidates") {
    return { reason: "AI_INVALID_RESPONSE", retryable: true, status };
  }
  return {
    reason: "AI_PROVIDER_ERROR",
    retryable: status === undefined || status >= 500,
    status,
  };
}

/** 只对可能恢复的错误重试一次，最大模型等待时间约 36 秒。 */
async function callWithRetry(
  prompt: string,
  temp: number,
  maxTokens: number,
  clientOverride?: OpenAI | null,
): Promise<AiCallResult> {
  const client = clientOverride === undefined ? getAi() : clientOverride;
  if (!client) {
    return { candidates: [], failureReason: "AI_NOT_CONFIGURED", attemptCount: 0 };
  }

  let failureReason: AiFailureReason = "AI_INVALID_RESPONSE";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const candidates = await callAi(client, prompt, temp, maxTokens);
      if (candidates.length > 0) return { candidates, attemptCount: attempt };
      failureReason = "AI_INVALID_RESPONSE";
    } catch (error) {
      const failure = classifyAiError(error);
      failureReason = failure.reason;
      console.error("[ai]", {
        attempt,
        reason: failure.reason,
        status: failure.status,
      });
      if (!failure.retryable) break;
    }
  }
  return { candidates: [], failureReason, attemptCount: 2 };
}

// ── 后处理 ──

function applyTip(candidates: RefinedCandidateWithId[]): RefinedCandidateWithId[] {
  return candidates.map((c) => ({ ...c, tip: tip(c.name) }));
}

function mergeLiked(
  candidates: RefinedCandidateWithId[],
  likedFb: PreservedFeedback[],
  surname: string,
  ref: string[],
): RefinedCandidateWithId[] {
  if (likedFb.length === 0) return candidates;
  const likedNames = new Set(likedFb.map((f) => f.name || ""));
  const liked: RefinedCandidateWithId[] = likedFb.map((f) => {
    const name = f.name?.startsWith(surname) ? f.name : surname + (f.name || "");
    const meaning = (f.meaning || "").replace(/[。！？!?]+$/u, "");
    return {
      id: `liked-${f.candidateId}`, name, meaning: f.meaning || "", origin: f.origin || "",
      coreMeaning: "经典佳名",
      fitReason: `取意说明：“${f.origin || "待补充"}”。${meaning}与“${ref[0] || "整体气质"}”的方向相呼应。`,
      tip: tip(name),
    };
  }).filter(Boolean);
  return [...liked, ...candidates.filter((c) => !likedNames.has(c.name))].slice(0, SHORTLIST_SIZE);
}

function adaptMockSurname<T extends { name: string }>(candidate: T, surname: string): T {
  return { ...candidate, name: surname + candidate.name.slice(1) };
}

function fallbackBatch1(surname: string): CandidateWithId[] {
  return mockBatch1
    .map((candidate) => ({
      ...adaptMockSurname(candidate, surname),
      id: crypto.randomUUID(),
    }))
    .slice(0, BATCH_SIZE);
}

function fallbackShortlist(surname: string, exclude: Set<string>): RefinedCandidateWithId[] {
  return mockShortlists
    .flat()
    .map((candidate) => ({
      ...adaptMockSurname(candidate, surname),
      id: crypto.randomUUID(),
    }))
    .filter((candidate) => !exclude.has(candidate.name));
}

function fillCandidates<T extends { name: string }>(primary: T[], fallback: T[], target: number): T[] {
  return dedupe([...primary, ...fallback]).slice(0, target);
}

function generationMeta(
  acceptedAiCount: number,
  usedFallback: boolean,
  failureReason?: AiFailureReason,
): GenerationMeta {
  if (!usedFallback) return { source: "ai", degraded: false };
  return {
    source: acceptedAiCount > 0 ? "mixed" : "fallback",
    degraded: true,
    degradationReason: failureReason || "AI_RESULT_REJECTED",
  };
}

function setGenerationMetric(res: Response, fields: GenerationMetricFields) {
  res.locals.namingGenerationMetric = fields;
}

function emitMetric(options: AppOptions, metric: NamingMetric) {
  try {
    if (options.onMetric) {
      options.onMetric(metric);
      return;
    }
    if (process.env.NAMING_TELEMETRY_ENABLED !== "false") {
      console.info(JSON.stringify(metric));
    }
  } catch {
    console.error("[telemetry] metric sink failed");
  }
}

// ── Express app ──

export function createApp(options: AppOptions = {}) {
  const app = express();
  const trustProxy = shouldTrustProxy(options);
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy ? 1 : false);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use(express.json({ limit: "16kb", strict: true }));

  app.use("/api/naming", (req, res, next) => {
    const startedAt = Date.now();
    const endpoint = `${req.baseUrl}${req.path}`;
    res.once("finish", () => {
      const generation = res.locals.namingGenerationMetric as GenerationMetricFields | undefined;
      emitMetric(options, {
        event: "naming_request",
        endpoint,
        method: req.method,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        ...generation,
      });
    });
    next();
  });

  const namingLimiter = rateLimit({
    windowMs: options.rateLimitWindowMs
      ?? positiveInt(process.env.NAMING_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
    limit: options.rateLimitMax
      ?? positiveInt(process.env.NAMING_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    validate: { xForwardedForHeader: trustProxy },
    handler: (_req, res) => {
      res.status(429).json({
        error: "RATE_LIMITED",
        message: "too many naming requests, please try again later",
      });
    },
  });
  app.use("/api/naming", namingLimiter);

  app.post("/api/naming/batch-1", asyncRoute(async (req, res) => {
    const input = parseRequest(batch1RequestSchema, req, res);
    if (!input) return;
    const { surname, expectations, additionalNote } = input;

    const requestId = crypto.randomUUID();

    const aiResult = await callWithRetry(
      buildPrompt({ surname, expectations, feedbacks: [], refinements: [], note: additionalNote || "", isBatch1: true }),
      0.8, 800, options.aiClient,
    );
    const aiCandidates = normalize(aiResult.candidates, surname, candidateOutputSchema).slice(0, BATCH_SIZE);
    const usedFallback = aiCandidates.length < BATCH_SIZE;
    const candidates = fillCandidates(aiCandidates, fallbackBatch1(surname), BATCH_SIZE);
    const meta = generationMeta(aiCandidates.length, usedFallback, aiResult.failureReason);

    setGenerationMetric(res, {
      requestId,
      ...meta,
      aiAttemptCount: aiResult.attemptCount,
      acceptedAiCandidateCount: aiCandidates.length,
      fallbackCandidateCount: Math.max(0, candidates.length - aiCandidates.length),
    });

    console.log(`[batch-1] rid=${requestId.slice(0, 8)} count=${candidates.length}`);
    res.json({ requestId, candidates, ...meta });
  }));

  app.post("/api/naming/shortlist", asyncRoute(async (req, res) => {
    const input = parseRequest(shortlistRequestSchema, req, res);
    if (!input) return;
    const {
      surname, expectations, candidateFeedbacks, refinements,
      refinementNote, additionalNote, excludeNames,
    } = input;

    const shortlistId = crypto.randomUUID();
    const likedFb = candidateFeedbacks.filter((feedback) => feedback.feedback === "like");
    if (likedFb.length > SHORTLIST_SIZE) {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: `at most ${SHORTLIST_SIZE} liked candidates can be preserved`,
      });
      return;
    }
    const preservedLiked = likedFb.filter(
      (feedback): feedback is PreservedFeedback => !!feedback.name && isValidFullName(feedback.name, surname),
    );
    const exclude = new Set(excludeNames);
    preservedLiked.forEach((f) => exclude.delete(f.name));

    // additionalNote（第一步补充）和 refinementNote（第三步微调）合并传入 prompt
    const combinedNote = [additionalNote, refinementNote].filter(Boolean).join("；");
    const aiResult = await callWithRetry(
      buildPrompt({ surname, expectations, feedbacks: candidateFeedbacks, refinements, note: combinedNote, excludeNames }),
      0.7, 1000, options.aiClient,
    );
    const aiCandidates = normalize(aiResult.candidates, surname, refinedCandidateOutputSchema)
      .filter((candidate) => !exclude.has(candidate.name))
      .slice(0, SHORTLIST_SIZE);
    const usedFallback = aiCandidates.length < SHORTLIST_SIZE;
    let candidates = fillCandidates(
      aiCandidates,
      fallbackShortlist(surname, exclude),
      SHORTLIST_SIZE,
    );
    const meta = generationMeta(aiCandidates.length, usedFallback, aiResult.failureReason);
    const fallbackCandidateCount = Math.max(0, candidates.length - aiCandidates.length);

    await ensureCnchar();
    candidates = applyTip(candidates);
    candidates = mergeLiked(candidates, preservedLiked, surname, refinements);
    setGenerationMetric(res, {
      requestId: shortlistId,
      ...meta,
      aiAttemptCount: aiResult.attemptCount,
      acceptedAiCandidateCount: aiCandidates.length,
      fallbackCandidateCount,
    });
    if (candidates.length === 0) {
      res.status(400).json({ error: "NO_MORE_CANDIDATES", message: "no candidates available under current constraints" });
      return;
    }
    console.log(`[shortlist] rid=${shortlistId.slice(0, 8)} count=${candidates.length}`);
    res.json({ shortlistRequestId: shortlistId, candidates, ...meta });
  }));

  app.post("/api/naming/shortlist/refresh", asyncRoute(async (req, res) => {
    const input = parseRequest(shortlistRefreshRequestSchema, req, res);
    if (!input) return;
    const {
      surname, expectations, candidateFeedbacks, refinements,
      refinementNote, additionalNote, excludeCandidateNames,
    } = input;
    const refreshRequestId = crypto.randomUUID();

    // ponytail: 去重完全由前端 shownNames 驱动，不依赖 sessionStore（serverless 无状态）
    const likedFb = candidateFeedbacks.filter((feedback) => feedback.feedback === "like");
    if (likedFb.length > SHORTLIST_SIZE) {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: `at most ${SHORTLIST_SIZE} liked candidates can be preserved`,
      });
      return;
    }
    const preservedLiked = likedFb.filter(
      (feedback): feedback is PreservedFeedback => !!feedback.name && isValidFullName(feedback.name, surname),
    );
    const exclude = new Set<string>(excludeCandidateNames);
    preservedLiked.forEach((feedback) => exclude.delete(feedback.name));

    // additionalNote（第一步补充）和 refinementNote（第三步微调）合并传入 prompt
    const combinedNote = [additionalNote, refinementNote].filter(Boolean).join("；");
    const aiResult = await callWithRetry(
      buildPrompt({ surname, expectations, feedbacks: candidateFeedbacks, refinements, note: combinedNote, excludeNames: [...exclude], isRefresh: true }),
      0.7, 1000, options.aiClient,
    );
    const aiCandidates = normalize(aiResult.candidates, surname, refinedCandidateOutputSchema)
      .filter((candidate) => !exclude.has(candidate.name))
      .slice(0, SHORTLIST_SIZE);
    const usedFallback = aiCandidates.length < SHORTLIST_SIZE;
    let candidates = fillCandidates(
      aiCandidates,
      fallbackShortlist(surname, exclude),
      SHORTLIST_SIZE,
    );
    const meta = generationMeta(aiCandidates.length, usedFallback, aiResult.failureReason);
    const fallbackCandidateCount = Math.max(0, candidates.length - aiCandidates.length);

    setGenerationMetric(res, {
      requestId: refreshRequestId,
      ...meta,
      aiAttemptCount: aiResult.attemptCount,
      acceptedAiCandidateCount: aiCandidates.length,
      fallbackCandidateCount,
    });

    if (candidates.length === 0) {
      res.status(400).json({ error: "NO_MORE_CANDIDATES", message: "no more candidates available under current constraints" });
      return;
    }

    await ensureCnchar();
    candidates = applyTip(candidates);
    candidates = mergeLiked(candidates, preservedLiked, surname, refinements);
    console.log(`[refresh] rid=${refreshRequestId.slice(0, 8)} count=${candidates.length}`);
    res.json({ shortlistRequestId: refreshRequestId, candidates, ...meta });
  }));

  const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const bodyError = error as { type?: string; status?: number; message?: string };
    if (bodyError.type === "entity.too.large") {
      res.status(413).json({ error: "INVALID_REQUEST", message: "request body is too large" });
      return;
    }
    if (bodyError.type === "entity.parse.failed" || bodyError.status === 400) {
      res.status(400).json({ error: "INVALID_REQUEST", message: "invalid JSON body" });
      return;
    }

    console.error("[server]", {
      method: req.method,
      path: req.path,
      message: bodyError.message || "unknown error",
    });
    res.status(500).json({ error: "INTERNAL_ERROR", message: "internal server error" });
  };
  app.use(errorHandler);

  return app;
}
