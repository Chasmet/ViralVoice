const http = require('http');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT || 10000);
const APK_URL = 'https://github.com/Chasmet/ViralVoice/releases/download/v3.6.5/ViralVoice-debug.apk';
const APK_NAME = 'ViralVoice-3.6.5.apk';

const page = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Télécharger ViralVoice</title>
  <meta name="description" content="Téléchargement officiel de ViralVoice pour Android.">
  <style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(145deg,#07111f,#111827);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;padding:24px}.card{width:min(520px,100%);padding:34px;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(15,23,42,.92);box-shadow:0 24px 70px rgba(0,0,0,.45);text-align:center}.logo{width:72px;height:72px;margin:0 auto 18px;display:grid;place-items:center;border-radius:20px;background:#7c3aed;font-weight:900;font-size:25px}h1{margin:0 0 10px;font-size:31px}p{margin:0 0 24px;color:#cbd5e1;line-height:1.55}.btn{display:block;width:100%;padding:16px 20px;border-radius:14px;background:#8b5cf6;color:white;text-decoration:none;font-weight:800;font-size:17px}.small{margin-top:17px;font-size:13px;color:#94a3b8}</style>
</head>
<body>
  <main class="card">
    <div class="logo">VV</div>
    <h1>ViralVoice pour Android</h1>
    <p>Traduis et double tes vidéos directement depuis ton téléphone.</p>
    <a class="btn" href="/ViralVoice.apk">Télécharger l’application</a>
    <div class="small">Version 3.6.5 • Fichier APK Android</div>
  </main>
</body>
</html>`;

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body) res.end(body); else res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    return send(res, 200, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({ ok: true }));
  }

  if (url.pathname === '/' || url.pathname === '/download') {
    return send(res, 200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300'
    }, page);
  }

  if (url.pathname === '/ViralVoice.apk' || url.pathname === '/viralvoice.apk') {
    try {
      const upstream = await fetch(APK_URL, {
        headers: { 'user-agent': 'ViralVoice-Download-Proxy/1.0' },
        redirect: 'follow'
      });

      if (!upstream.ok || !upstream.body) {
        throw new Error(`Téléchargement indisponible (${upstream.status})`);
      }

      const headers = {
        'content-type': upstream.headers.get('content-type') || 'application/vnd.android.package-archive',
        'content-disposition': `attachment; filename="${APK_NAME}"`,
        'cache-control': 'public, max-age=3600',
        'x-content-type-options': 'nosniff'
      };
      const length = upstream.headers.get('content-length');
      if (length) headers['content-length'] = length;

      res.writeHead(200, headers);
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (error) {
      console.error(error);
      send(res, 502, { 'content-type': 'text/plain; charset=utf-8' }, 'Le téléchargement est temporairement indisponible. Réessaie dans quelques instants.');
    }
    return;
  }

  send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'Page introuvable');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ViralVoice download server listening on port ${PORT}`);
});
