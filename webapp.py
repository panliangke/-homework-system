"""
作业提交系统 - Web 应用
可直接部署到 Python 云平台（Render / PythonAnywhere / Railway 等）
也可本地运行：python webapp.py
"""
import json
import os
import ssl
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

# ===== 配置 =====
PORT = int(os.environ.get("PORT", 8080))
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
API_BASE = os.environ.get("API_BASE", "https://homework.pkuai.cc")

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

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
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def _proxy(self, method):
        path = self.path.split("?")[0]
        query = self.path.split("?")[1] if "?" in self.path else ""
        target_url = API_BASE + path + ("?" + query if query else "")

        headers = dict(BROWSER_HEADERS)
        for h in ["Content-Type", "Authorization"]:
            val = self.headers.get(h)
            if val:
                headers[h] = val

        body = None
        content_length = self.headers.get("Content-Length")
        if content_length:
            body = self.rfile.read(int(content_length))

        try:
            req = urllib.request.Request(target_url, data=body, headers=headers, method=method)
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=60) as resp:
                resp_body = resp.read()
                self._send_back(resp.status, resp, resp_body)
        except urllib.error.HTTPError as e:
            self._send_back(e.code, e, e.read())
        except urllib.error.URLError as e:
            self._send_json_error(502, "NETWORK_ERROR", f"无法连接目标服务器: {e.reason}")
        except Exception as e:
            self._send_json_error(500, "PROXY_ERROR", str(e))

    def _send_back(self, status, resp, body):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        ct = resp.getheader("Content-Type") if hasattr(resp, "getheader") else resp.headers.get("Content-Type")
        if ct:
            self.send_header("Content-Type", ct)
        cd = resp.getheader("Content-Disposition") if hasattr(resp, "getheader") else resp.headers.get("Content-Disposition")
        if cd:
            self.send_header("Content-Disposition", cd)
        self.end_headers()
        self.wfile.write(body)

    def _send_json_error(self, code, error_code, message):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps({
            "error": {"code": error_code, "message": message, "details": None}
        }, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        print(f"  [{self.command}] {self.path}")


if __name__ == "__main__":
    print("=" * 50)
    print("  作业提交系统")
    print("=" * 50)
    print(f"  访问地址: http://localhost:{PORT}")
    print(f"  API 代理: {API_BASE}")
    print("=" * 50)
    print("  按 Ctrl+C 停止")
    print("=" * 50)

    server = HTTPServer(("0.0.0.0", PORT), AppHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
