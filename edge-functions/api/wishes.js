// EdgeOne Pages 边缘函数：婚礼祝福代理
// 路由：/edge-functions/api/wishes.js -> /api/wishes
// 前端通过同域 /api/wishes 调用，token 仅保存在 Pages 项目设置的环境变量中

const OWNER = "Mumu99";
const REPO = "wedding-wishes";
const LABEL = "wish";
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/issues`;

// 边缘节点内存缓存，降低对 GitHub 的调用频率
let _cache = { ts: 0, data: null };
const CACHE_TTL = 60 * 1000;

function getToken(env) {
  return (env && env.GITHUB_TOKEN) ? env.GITHUB_TOKEN : "";
}

function ghHeaders(env) {
  return {
    "Accept": "application/vnd.github.v3+json",
    "Authorization": `Bearer ${getToken(env)}`,
    "User-Agent": "wedding-wishes-edge",
    "Content-Type": "application/json",
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function getQuery(url, name) {
  return new URL(url).searchParams.get(name);
}

async function listWishes(env) {
  const now = Date.now();
  if (_cache.data && now - _cache.ts < CACHE_TTL) {
    return json(_cache.data, 200, { "Cache-Control": "public, s-maxage=60" });
  }
  const res = await fetch(
    `${API_BASE}?state=open&labels=${LABEL}&per_page=100&sort=created&direction=desc`,
    { headers: ghHeaders(env) },
  );
  if (!res.ok) {
    const text = await res.text();
    return json({ error: "GitHub 请求失败", detail: text, status: res.status }, res.status);
  }
  const data = await res.json();
  _cache = { ts: now, data };
  return json(data, 200, { "Cache-Control": "public, s-maxage=60" });
}

async function createWish(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ error: "请求体不是合法 JSON" }, 400);
  }
  const title = (payload.title || "").toString().trim();
  const body = (payload.body || "").toString();
  if (!title) return json({ error: "缺少祝福人姓名（title）" }, 400);
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: ghHeaders(env),
    body: JSON.stringify({ title, body, labels: [LABEL] }),
  });
  if (!res.ok) {
    const text = await res.text();
    return json({ error: "创建祝福失败", detail: text, status: res.status }, res.status);
  }
  _cache = { ts: 0, data: null };
  return json(await res.json(), 201);
}

async function closeWish(request, env) {
  const id = getQuery(request.url, "id");
  if (!id) return json({ error: "缺少 id 参数" }, 400);
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: ghHeaders(env),
    body: JSON.stringify({ state: "closed" }),
  });
  if (!res.ok) {
    const text = await res.text();
    return json({ error: "删除祝福失败", detail: text, status: res.status }, res.status);
  }
  _cache = { ts: 0, data: null };
  return json({ ok: true });
}

export default async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method === "GET") return listWishes(env);
  if (request.method === "POST") return createWish(request, env);
  if (request.method === "PATCH") return closeWish(request, env);

  return json({ error: "不支持的方法" }, 405);
}
