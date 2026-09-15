"""
作业提交系统 - 本地代理服务器
同时提供静态文件服务和 API 代理，解决浏览器跨域(CORS)限制。

用法: python server.py [端口号]
默认端口: 8080
"""
import http.server
import json
import os
import ssl
import sys
import urllib.request
import urllib.error

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
API_BASE = "https://homework.pkuai.cc"

# SSL 上下文（忽略证书验证，适配部分网络环境）
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

# 浏览器特征请求头，避免被 Cloudflare WAF 拦截
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    # ---- HTTP 方法路由 ----

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy("GET")
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._proxy("POST")
        else:
            self.send_error(405)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self._proxy("PUT")
        else:
            self.send_error(405)

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self._proxy("DELETE")
        else:
            self.send_error(405)

    def do_OPTIONS(self):
        """处理 CORS 预检请求"""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    # ---- 代理核心逻辑 ----

    def _proxy(self, method):
        # 去掉查询字符串，拼接到目标 URL
        path = self.path.split("?")[0]
        query = self.path.split("?")[1] if "?" in self.path else ""
        target_url = API_BASE + path
        if query:
            target_url += "?" + query

        headers = dict(BROWSER_HEADERS)

        # 转发客户端的关键请求头
        for h in ["Content-Type", "Authorization"]:
            val = self.headers.get(h)
            if val:
                headers[h] = val

        # 读取请求体（支持 JSON 和 multipart/form-data）
        body = None
        content_length = self.headers.get("Content-Length")
        if content_length:
            body = self.rfile.read(int(content_length))

        try:
            req = urllib.request.Request(
                target_url,
                data=body,
                headers=headers,
                method=method,
            )
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=60) as resp:
                resp_body = resp.read()
                status = resp.status
                self._send_back(status, resp, resp_body)

        except urllib.error.HTTPError as e:
            resp_body = e.read()
            self._send_back(e.code, e, resp_body)

        except urllib.error.URLError as e:
            self._send_json_error(502, "NETWORK_ERROR", f"无法连接目标服务器: {e.reason}")

        except Exception as e:
            self._send_json_error(500, "PROXY_ERROR", str(e))

    def _send_back(self, status, resp, body):
        """将远程响应原样返回给浏览器"""
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")

        # 转发 Content-Type
        ct = resp.getheader("Content-Type") if hasattr(resp, "getheader") else resp.headers.get("Content-Type")
        if ct:
            self.send_header("Content-Type", ct)

        # 转发 Content-Disposition（文件下载时需要）
        cd = resp.getheader("Content-Disposition") if hasattr(resp, "getheader") else resp.headers.get("Content-Disposition")
        if cd:
            self.send_header("Content-Disposition", cd)

        self.end_headers()
        self.wfile.write(body)

    def _send_json_error(self, code, error_code, message):
        """返回 JSON 格式的错误响应"""
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps({
            "error": {"code": error_code, "message": message, "details": None}
        }, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        """精简日志输出"""
        method = self.command
        path = self.path
        print(f"  [{method}] {path}")


if __name__ == "__main__":
    print("=" * 50)
    print("  作业提交系统 - 本地服务器")
    print("=" * 50)
    print(f"  访问地址: http://localhost:{PORT}")
    print(f"  静态目录: {STATIC_DIR}")
    print(f"  API 代理: {API_BASE}")
    print("=" * 50)
    print("  按 Ctrl+C 停止服务器")
    print("=" * 50)

    with http.server.HTTPServer(("", PORT), ProxyHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务器已停止")
