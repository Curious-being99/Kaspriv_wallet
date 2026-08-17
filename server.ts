import http from "http";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpProxyAgent } from "http-proxy-agent";
import fetch from "node-fetch";

const PORT = 3000;

async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  let vite: any;

  if (!isProd) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url || "";

    // Raw body parser helper for POST requests
    const getRawBody = (): Promise<string> => {
      return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          resolve(body);
        });
        req.on("error", (err) => {
          reject(err);
        });
      });
    };

    const pathname = url.split("?")[0];
    const isProxyRoute = pathname === "/api/proxy" || pathname === "/api/proxy/" || pathname.startsWith("/api/proxy/");

    // Handle CORS preflight for the proxy route
    if (isProxyRoute && req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Proxy-Routed, X-Proxy-Type, X-Proxy-Handshake-Test",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    // 1. API proxy route handler
    if (req.method === "POST" && isProxyRoute) {
      try {
        const rawBody = await getRawBody();
        const payload = JSON.parse(rawBody);
        const { targetUrl, method = "GET", headers = {}, body, proxyConfig } = payload;

        if (!targetUrl) {
          res.writeHead(400, { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ error: "Missing targetUrl parameter" }));
          return;
        }

        let agent: any = undefined;

        if (proxyConfig && proxyConfig.enabled) {
          const { type, host, port, username, password } = proxyConfig;
          const credentials = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";

          if (type === "tor" || type === "socks5") {
            const proxyUri = `socks5h://${credentials}${host}:${port}`;
            agent = new SocksProxyAgent(proxyUri);
            console.log(`[Tor/SOCKS5 Proxy Router] Tunneling raw node-fetch to ${targetUrl} via ${proxyUri}`);
          } else if (type === "http") {
            const proxyUri = `http://${credentials}${host}:${port}`;
            agent = new HttpProxyAgent(proxyUri);
            console.log(`[HTTP Proxy Router] Tunneling raw node-fetch to ${targetUrl} via ${proxyUri}`);
          }
        } else {
          console.log(`[Direct Proxy Router] Executing direct connection to ${targetUrl}`);
        }

        // Clean up client-provided headers to prevent Host or Content-Length mismatches
        const cleanHeaders: Record<string, string> = {};
        Object.keys(headers).forEach((key) => {
          const lowerKey = key.toLowerCase();
          if (
            lowerKey !== "host" &&
            lowerKey !== "connection" &&
            lowerKey !== "content-length" &&
            lowerKey !== "accept-encoding" &&
            lowerKey !== "user-agent"
          ) {
            cleanHeaders[key] = headers[key];
          }
        });

        const fetchOptions: any = {
          method,
          headers: {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            ...cleanHeaders,
          },
        };

        if (agent) {
          fetchOptions.agent = agent;
        }

        if (body && (method === "POST" || method === "PUT")) {
          fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
        }

        // Timeout mechanism & safe proxy offline fallback
        let response;
        const isHandshakeTest = Boolean(headers["X-Proxy-Handshake-Test"] || headers["x-proxy-handshake-test"]);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 45000); // Generous 45s timeout for slow Tor/node circuits
          fetchOptions.signal = controller.signal;
          response = await fetch(targetUrl, fetchOptions);
          clearTimeout(timeoutId);
        } catch (fetchErr: any) {
          const isProxyConnectionError = fetchErr.message.includes("ECONNREFUSED") || 
                                         fetchErr.message.includes("socks") ||
                                         fetchErr.message.includes("Socks") ||
                                         fetchErr.message.includes("Socket closed") ||
                                         fetchErr.message.includes("proxy");
          
          // If the proxy is offline and target is a public clearnet URL and NOT an explicit handshake test, fallback to direct fetch
          if (!isHandshakeTest && isProxyConnectionError && fetchOptions.agent && !targetUrl.includes(".onion")) {
            console.warn(`[Proxy Connection Offline] Proxy is offline. Falling back to direct connection for ${targetUrl}`);
            const directOptions = { ...fetchOptions };
            delete directOptions.agent;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            directOptions.signal = controller.signal;
            
            response = await fetch(targetUrl, directOptions);
            clearTimeout(timeoutId);
          } else {
            throw fetchErr;
          }
        }

        const contentType = response.headers.get("content-type") || "";
        let responseBody: any;

        if (contentType.includes("application/json")) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((val, key) => {
          responseHeaders[key] = val;
        });

        res.writeHead(response.status, { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Proxy-Routed, X-Proxy-Type, X-Proxy-Handshake-Test",
        });
        res.end(JSON.stringify({
          ok: response.ok,
          status: response.status,
          headers: responseHeaders,
          body: responseBody,
        }));
      } catch (err: any) {
        console.error(`[Proxy Tunnel Error] Connection to target failed:`, err.message);
        res.writeHead(502, { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({
          ok: false,
          error: `Proxy gateway connection failed: ${err.message}`,
        }));
      }
      return;
    }

    // 2. Vite static server / dev server handoff
    if (!isProd) {
      // Dev Mode: Let Vite middlewares handle the request
      vite.middlewares(req, res);
    } else {
      // Production Mode: Serve static files built in /dist
      const distPath = path.join(process.cwd(), "dist");
      let filePath = path.join(distPath, url === "/" ? "index.html" : url);

      // Prevent directory traversal attacks
      if (!filePath.startsWith(distPath)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          // Fallback to SPA index.html for non-asset routes
          filePath = path.join(distPath, "index.html");
        }

        const ext = path.extname(filePath);
        let contentType = "text/html";
        if (ext === ".js") contentType = "application/javascript";
        else if (ext === ".css") contentType = "text/css";
        else if (ext === ".json") contentType = "application/json";
        else if (ext === ".svg") contentType = "image/svg+xml";
        else if (ext === ".png") contentType = "image/png";
        else if (ext === ".jpg") contentType = "image/jpeg";
        else if (ext === ".wasm") contentType = "application/wasm";

        res.writeHead(200, { "Content-Type": contentType });
        fs.createReadStream(filePath).pipe(res);
      });
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`KasPriv Native Node.js server running on http://localhost:${PORT}`);
  });
}

startServer();
