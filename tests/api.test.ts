import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp, type AppOptions, type NamingMetric } from "../src/app.ts";

process.env.GLM_API_KEY = "";
process.env.NAMING_TELEMETRY_ENABLED = "false";

async function withServer(
  options: AppOptions,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createApp(options).listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function postJson(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertExactKeys(value: object, expectedKeys: string[]) {
  assert.deepEqual(Object.keys(value).sort(), [...expectedKeys].sort());
}

const validBatchRequest = {
  surname: "林",
  expectations: ["温和有分寸"],
  additionalNote: "避免生僻字",
};

function withAiCandidates(candidates: unknown[], prompts?: string[]): AppOptions {
  return {
    aiClient: {
      chat: {
        completions: {
          create: async (request: { messages?: Array<{ content?: unknown }> }) => {
            const content = request.messages?.[0]?.content;
            if (typeof content === "string") prompts?.push(content);
            return { choices: [{ message: { content: JSON.stringify({ candidates }) } }] };
          },
        },
      },
    } as never,
  };
}

test("合法首轮请求保持原有成功响应结构", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const body = await response.json() as {
      requestId?: string;
      source?: string;
      degraded?: boolean;
      degradationReason?: string;
      candidates?: Array<{ id?: string; name?: string; meaning?: string; origin?: string }>;
    };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(typeof body.requestId, "string");
    assert.equal(body.source, "fallback");
    assert.equal(body.degraded, true);
    assert.equal(body.degradationReason, "AI_NOT_CONFIGURED");
    assert.equal(body.candidates?.length, 6);
    assert.equal(typeof body.candidates[0].id, "string");
    assert.equal(typeof body.candidates[0].name, "string");
    assert.equal(typeof body.candidates[0].meaning, "string");
    assert.equal(typeof body.candidates[0].origin, "string");
  });
});

test("生成请求记录匿名化的结构化运行指标", async () => {
  const metrics: NamingMetric[] = [];
  await withServer({ rateLimitMax: 100, onMetric: (metric) => metrics.push(metric) }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    assert.equal(response.status, 200);
    await response.json();
  });

  assert.equal(metrics.length, 1);
  const metric = metrics[0];
  assert.equal(metric.event, "naming_request");
  assert.equal(metric.endpoint, "/api/naming/batch-1");
  assert.equal(metric.method, "POST");
  assert.equal(metric.status, 200);
  assert.equal(metric.source, "fallback");
  assert.equal(metric.degradationReason, "AI_NOT_CONFIGURED");
  assert.equal(metric.aiAttemptCount, 0);
  assert.equal(metric.acceptedAiCandidateCount, 0);
  assert.equal(metric.fallbackCandidateCount, 6);
  assert.ok(typeof metric.requestId === "string");
  assert.ok(metric.durationMs >= 0);
  assert.doesNotMatch(JSON.stringify(metric), /林|温和|避免生僻字/);
});

test("首轮与精细筛选响应符合公开字段和数量契约", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const batchResponse = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const batch = await batchResponse.json() as {
      requestId: string;
      candidates: Array<Record<string, unknown>>;
      source: string;
      degraded: boolean;
      degradationReason: string;
    };

    assert.equal(batchResponse.status, 200);
    assertExactKeys(batch, ["requestId", "candidates", "source", "degraded", "degradationReason"]);
    assert.equal(batch.candidates.length, 6);
    batch.candidates.forEach((candidate) => {
      assertExactKeys(candidate, ["id", "name", "meaning", "origin"]);
    });

    const shortlistResponse = await postJson(baseUrl, "/api/naming/shortlist", {
      surname: "林",
      expectations: ["温和有分寸"],
      candidateFeedbacks: [{
        candidateId: batch.candidates[0].id,
        feedback: "like",
        name: batch.candidates[0].name,
        meaning: batch.candidates[0].meaning,
        origin: batch.candidates[0].origin,
      }],
      refinements: ["更有书卷气"],
      excludeNames: batch.candidates.map((candidate) => candidate.name),
    });
    const shortlist = await shortlistResponse.json() as {
      shortlistRequestId: string;
      candidates: Array<Record<string, unknown>>;
      source: string;
      degraded: boolean;
      degradationReason: string;
    };

    assert.equal(shortlistResponse.status, 200);
    assertExactKeys(shortlist, ["shortlistRequestId", "candidates", "source", "degraded", "degradationReason"]);
    assert.equal(shortlist.candidates.length, 3);
    shortlist.candidates.forEach((candidate) => {
      assertExactKeys(candidate, ["id", "name", "meaning", "origin", "coreMeaning", "fitReason", "tip"]);
    });
  });
});

test("畸形字段返回 400，且不会使服务退出", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const invalidResponse = await postJson(baseUrl, "/api/naming/batch-1", {
      surname: {},
      expectations: [1],
    });
    const invalidBody = await invalidResponse.json() as { error?: string };

    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidBody.error, "INVALID_REQUEST");

    const recoveryResponse = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    assert.equal(recoveryResponse.status, 200);
  });
});

test("非法 JSON 和过大请求体被拒绝", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const malformedResponse = await fetch(`${baseUrl}/api/naming/batch-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{\"surname\":",
    });
    assert.equal(malformedResponse.status, 400);

    const oversizedResponse = await postJson(baseUrl, "/api/naming/batch-1", {
      ...validBatchRequest,
      additionalNote: "长".repeat(20_000),
    });
    assert.equal(oversizedResponse.status, 413);
  });
});

test("超过请求额度时返回 429", async () => {
  await withServer({ rateLimitMax: 2, rateLimitWindowMs: 60_000 }, async (baseUrl) => {
    const first = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const second = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const third = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const body = await third.json() as { error?: string };

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.equal(body.error, "RATE_LIMITED");
  });
});

test("直连模式不信任伪造的 X-Forwarded-For，限流仍按真实连接生效", async () => {
  await withServer({ rateLimitMax: 1, rateLimitWindowMs: 60_000, trustProxy: false }, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/naming/batch-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.10" },
      body: JSON.stringify(validBatchRequest),
    });
    const second = await fetch(`${baseUrl}/api/naming/batch-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.20" },
      body: JSON.stringify(validBatchRequest),
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
  });
});

test("短名单在服务端过滤已展示名字", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/shortlist", {
      surname: "林",
      expectations: ["温和有分寸"],
      candidateFeedbacks: [{
        candidateId: "candidate-1",
        feedback: "like",
        name: "林清和",
        meaning: "温和有分寸。",
        origin: "清雅意象",
      }],
      refinements: ["更有书卷气"],
      excludeNames: ["林清和", "林修远"],
    });
    const body = await response.json() as {
      source?: string;
      degraded?: boolean;
      candidates?: Array<{ name: string; fitReason?: string }>;
    };

    assert.equal(response.status, 200);
    assert.equal(body.source, "fallback");
    assert.equal(body.degraded, true);
    assert.equal(body.candidates?.length, 3);
    assert.ok(body.candidates?.some((candidate) => candidate.name === "林清和"));
    assert.ok(body.candidates?.every((candidate) => candidate.name !== "林修远"));
    assert.ok(body.candidates?.every((candidate) => !candidate.fitReason?.includes("。。")));
  });
});

test("fallback 使用用户姓氏并固定返回 6 个首轮候选", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/batch-1", {
      surname: "王",
      expectations: ["沉稳可靠"],
    });
    const body = await response.json() as { candidates?: Array<{ name: string }> };

    assert.equal(response.status, 200);
    assert.equal(body.candidates?.length, 6);
    assert.ok(body.candidates?.every((candidate) => candidate.name.startsWith("王")));
  });
});

test("AI 返回错误姓氏或仅姓氏时拒绝结果并使用备用候选", async () => {
  await withServer({ rateLimitMax: 100, ...withAiCandidates([
    { name: "王明", meaning: "错误姓氏", origin: "测试" },
    { name: "林", meaning: "没有名字", origin: "测试" },
  ]) }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const body = await response.json() as {
      source?: string;
      degraded?: boolean;
      degradationReason?: string;
      candidates?: Array<{ name: string }>;
    };

    assert.equal(response.status, 200);
    assert.equal(body.source, "fallback");
    assert.equal(body.degraded, true);
    assert.equal(body.degradationReason, "AI_RESULT_REJECTED");
    assert.ok(body.candidates?.every((candidate) => candidate.name.startsWith("林") && candidate.name.length > 1));
  });
});

test("AI 返回不透明、出处断言或绝对化表述时使用备用候选", async () => {
  await withServer({ rateLimitMax: 100, ...withAiCandidates([
    { name: "林清和", meaning: "气质清润平和", origin: "古典风格" },
    { name: "林知远", meaning: "保证拥有开阔志向", origin: "取意于远行的意象。" },
    { name: "林景行", meaning: "气质端正明朗", origin: "出自《诗经》的古典表达。" },
  ]) }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    const body = await response.json() as {
      source?: string;
      degradationReason?: string;
      candidates?: Array<{ name: string }>;
    };

    assert.equal(response.status, 200);
    assert.equal(body.source, "fallback");
    assert.equal(body.degradationReason, "AI_RESULT_REJECTED");
    assert.equal(body.candidates?.length, 6);
  });
});

test("AI 提示词要求只使用取意说明", async () => {
  const prompts: string[] = [];
  await withServer({ rateLimitMax: 100, ...withAiCandidates([
    { name: "林清和", meaning: "气质清润平和", origin: "取意于清雅与和顺的意象。" },
  ], prompts) }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/batch-1", validBatchRequest);
    assert.equal(response.status, 200);
  });

  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /统一写作“取意于……意象”/);
  assert.match(prompts[0], /不得使用“出自”“源自”“见于”/);
  assert.match(prompts[0], /不得使用“完美契合”“唯一最佳”“保证”/);
});

test("短名单拒绝超过三个喜欢候选的请求", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/shortlist", {
      surname: "林",
      expectations: ["温和有分寸"],
      candidateFeedbacks: ["林清和", "林知远", "林若谷", "林溪晏"].map((name, index) => ({
        candidateId: `candidate-${index}`,
        feedback: "like",
        name,
      })),
      refinements: [],
    });
    const body = await response.json() as { error?: string; message?: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "INVALID_REQUEST");
    assert.match(body.message || "", /at most 3/);
  });
});

test("refresh 会在第一组耗尽后使用下一组 fallback", async () => {
  await withServer({ rateLimitMax: 100 }, async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/naming/shortlist/refresh", {
      surname: "林",
      expectations: ["温和有分寸"],
      candidateFeedbacks: [{
        candidateId: "candidate-1",
        feedback: "neutral",
        name: "林清和",
      }],
      refinements: [],
      excludeCandidateNames: ["林修远", "林以忱", "林景行"],
    });
    const body = await response.json() as { candidates?: Array<{ name: string }> };
    const names = body.candidates?.map((candidate) => candidate.name).sort();

    assert.equal(response.status, 200);
    assert.deepEqual(names, ["林初霁", "林归远", "林砚秋"].sort());
  });
});
