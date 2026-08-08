const sharp = require("sharp");
const fetch = require("node-fetch");

const CANVAS_W = 600;
const CANVAS_H = 900;
const POSTER_H = 620;
const TRANSITION_H = 200;

// Logo BRASIL embutido como SVG (nao depende de arquivo externo)
const BRASIL_SVG = `
<svg width="600" height="320" viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg">
  <polygon points="300,20 560,160 300,300 40,160"
    fill="none" stroke="white" stroke-width="6"/>
  <text x="300" y="185" font-family="Georgia, serif" font-size="72"
    font-weight="bold" fill="white" text-anchor="middle"
    letter-spacing="4">BRASIL</text>
</svg>`;

async function fetchMdblistItems(username, listname, apikey, limit = 200) {
  const url = `https://api.mdblist.com/lists/${username}/${listname}/items?apikey=${apikey}&limit=${limit}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`MDBList error ${r.status}`);
  const data = await r.json();
  return [...(data.movies || []), ...(data.shows || [])];
}

async function fetchTmdbBackdropUrl(tmdbId, apiKey, mediatype) {
  const kind = mediatype === "show" ? "tv" : "movie";
  const url = `https://api.themoviedb.org/3/${kind}/${tmdbId}?api_key=${apiKey}&language=pt-BR`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TMDb error ${r.status}`);
  const d = await r.json();
  const path = d.backdrop_path || d.poster_path;
  if (!path) return null;
  return `https://image.tmdb.org/t/p/w1280${path}`;
}

// escolhe o item do dia sem precisar de estado salvo (serverless-friendly)
function pickIndexForToday(total) {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  );
  return dayOfYear % total;
}

async function buildCover(posterBuffer) {
  const poster = await sharp(posterBuffer)
    .resize(CANVAS_W, POSTER_H, { fit: "cover", position: "centre" })
    .toBuffer();

  const stats = await sharp(poster).stats();
  const [r, g, b] = stats.channels.map((c) => Math.round(c.mean * 0.12));

  // fundo solido com a cor dominante escurecida
  const canvasBg = await sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 3,
      background: { r, g, b },
    },
  })
    .jpeg()
    .toBuffer();

  // versao borrada + escurecida do poster (usada na transicao)
  const blurredDark = await sharp(poster)
    .blur(20)
    .modulate({ brightness: 0.45 })
    .toBuffer();

  // mascara gradiente vertical: 0 no topo do poster -> 255 na base
  const gradStart = POSTER_H - TRANSITION_H;
  const maskRow = Buffer.alloc(POSTER_H);
  for (let y = 0; y < POSTER_H; y++) {
    maskRow[y] = y < gradStart ? 0 : Math.round((255 * (y - gradStart)) / TRANSITION_H);
  }
  const maskColumn = await sharp(maskRow, {
    raw: { width: 1, height: POSTER_H, channels: 1 },
  })
    .resize(CANVAS_W, POSTER_H, { kernel: "nearest" })
    .raw()
    .toBuffer();

  const blurredDarkMasked = await sharp(blurredDark)
    .ensureAlpha()
    .joinChannel(maskColumn, { raw: { width: CANVAS_W, height: POSTER_H, channels: 1 } })
    .png()
    .toBuffer();

  const posterFinal = await sharp(poster)
    .composite([{ input: blurredDarkMasked, top: 0, left: 0 }])
    .toBuffer();

  const logoBuffer = await sharp(Buffer.from(BRASIL_SVG))
    .resize({ width: Math.round(CANVAS_W * 0.42) })
    .toBuffer();
  const logoMeta = await sharp(logoBuffer).metadata();

  const bottomZoneTop = POSTER_H + Math.round((CANVAS_H - POSTER_H) * 0.15);
  const bottomZoneH = CANVAS_H - bottomZoneTop;
  const logoLeft = Math.round((CANVAS_W - logoMeta.width) / 2);
  const logoTop = bottomZoneTop + Math.round((bottomZoneH - logoMeta.height) / 2);

  const final = await sharp(canvasBg)
    .composite([
      { input: posterFinal, top: 0, left: 0 },
      { input: logoBuffer, top: logoTop, left: logoLeft },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  return final;
}

const handler = async (req, res) => {
  try {
    const username = req.query.username || process.env.MDBLIST_USERNAME;
    const listname = req.query.list || process.env.MDBLIST_LISTNAME;
    const mdblistKey = process.env.MDBLIST_APIKEY;
    const tmdbKey = process.env.TMDB_APIKEY;

    if (!username || !listname || !mdblistKey || !tmdbKey) {
      res.status(400).send("Faltam parametros (username/list) ou variaveis de ambiente (MDBLIST_APIKEY/TMDB_APIKEY)");
      return;
    }

    const items = await fetchMdblistItems(username, listname, mdblistKey);
    if (!items.length) throw new Error("Lista vazia");

    const idx = pickIndexForToday(items.length);
    const item = items[idx];
    const imgUrl = await fetchTmdbBackdropUrl(item.id, tmdbKey, item.mediatype);
    if (!imgUrl) throw new Error("Item sem imagem disponivel");

    const posterResp = await fetch(imgUrl);
    const posterBuffer = Buffer.from(await posterResp.arrayBuffer());

    const finalImage = await buildCover(posterBuffer);

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=21600"); // 6h
    res.status(200).send(finalImage);
  } catch (err) {
    res.status(500).send(`Erro ao gerar capa: ${err.message}`);
  }
};

module.exports = handler;
module.exports.buildCover = buildCover;
