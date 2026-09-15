/**
 * Vercel Serverless Function - API 代理
 * 将所有 /api/v1/* 请求转发到远程教学管理服务器
 *
 * 注意：Vercel 免费版函数请求体上限约 4.5MB，
 * 如需上传大文件（最大 100MB），请使用 Render 部署（webapp.py）。
 */

const API_BASE = (process.env.API_BASE || 'https://homework.pkuai.cc').replace(/\/$/, '');

// 浏览器特征请求头，避免被 Cloudflare WAF 拦截
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

module.exports = async function handler(req, res) {
  // CORS 预检（同源访问时不会触发，保留以兼容直接跨域调用）
  if (req.method === 'OPTIONS') {
    res.status(204);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.end();
    return;
  }

  // req.url 在 rewrite 后仍为浏览器请求的原始路径，如 /api/v1/auth/login
  const url = new URL(req.url, 'http://incoming');
  const targetUrl = API_BASE + url.pathname + url.search;

  // 构建转发请求头
  const headers = { ...BROWSER_HEADERS };
  if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

  try {
    const body = await readRawBody(req);

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
    });

    const responseBody = Buffer.from(await response.arrayBuffer());

    res.status(response.status);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const ct = response.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);

    const cd = response.headers.get('content-disposition');
    if (cd) res.setHeader('Content-Disposition', cd);

    res.send(responseBody);
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(502).json({
      error: {
        code: 'PROXY_ERROR',
        message: `代理请求失败: ${error.message}`,
        details: null,
      },
    });
  }
};

/**
 * 读取原始请求体为 Buffer（支持 JSON 和 multipart/form-data）
 */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
