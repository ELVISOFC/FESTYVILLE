const http = require("http");
const net = require("net");

const BACKEND_PORT = 8000;
const FRONTEND_PORT = 5001;
const PROXY_PORT = 5000;

const server = http.createServer((req, res) => {
  const targetPort = req.url.startsWith("/api") ? BACKEND_PORT : FRONTEND_PORT;

  const options = {
    hostname: "127.0.0.1",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (e) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
    }
    res.end(`Proxy error: ${e.message}`);
  });

  req.pipe(proxyReq, { end: true });
});

server.on("upgrade", (req, socket, head) => {
  const targetPort = req.url.startsWith("/api") ? BACKEND_PORT : FRONTEND_PORT;

  const targetSocket = net.connect(targetPort, "127.0.0.1", () => {
    const headerLines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [k, v] of Object.entries(req.headers)) {
      headerLines.push(`${k}: ${v}`);
    }
    headerLines.push("", "");
    targetSocket.write(headerLines.join("\r\n"));
    if (head && head.length) targetSocket.write(head);
    socket.pipe(targetSocket);
    targetSocket.pipe(socket);
  });

  targetSocket.on("error", () => socket.destroy());
  socket.on("error", () => targetSocket.destroy());
});

server.listen(PROXY_PORT, () => {
  console.log(`[proxy] Listening on :${PROXY_PORT}`);
  console.log(`[proxy] /api/* -> :${BACKEND_PORT}`);
  console.log(`[proxy] /*    -> :${FRONTEND_PORT}`);
});
