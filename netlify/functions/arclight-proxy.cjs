// Netlify Serverless Function - Arclight (Jesus Film Project) proxy
// Resolves a film + language to its streaming URL. api.arclight.org sends no
// CORS headers, so the browser can't ask it directly; this also keeps the API
// key (ARCLIGHT_API_KEY, optional for now — the API answers without one) on
// the server.

const API = "https://api.arclight.org/v2";
const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const jsonResponse = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { ...CORS_HEADERS, ...headers },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const params = event.queryStringParameters || {};
  const { media_component_id: id, language_id: lang } = params;
  if (!id || !/^[0-9A-Za-z_-]+$/.test(id) || !lang || !/^\d+$/.test(lang)) {
    return jsonResponse(400, {
      error: "Expected media_component_id (e.g. 2_GOJ-0-0) and a numeric language_id",
    });
  }

  const url = new URL(`${API}/media-components/${id}/languages/${lang}`);
  if (process.env.ARCLIGHT_API_KEY) url.searchParams.set("apiKey", process.env.ARCLIGHT_API_KEY);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return jsonResponse(response.status, { error: `Arclight returned ${response.status}` });
    }
    const data = await response.json();
    const m3u8 = data.streamingUrls?.m3u8?.[0]?.url ?? null;
    const mp4 = data.downloadUrls?.high?.url ?? data.downloadUrls?.low?.url ?? null;
    if (!m3u8 && !mp4) {
      return jsonResponse(404, { error: "No stream for this film and language" });
    }
    return jsonResponse(
      200,
      { m3u8, mp4, lengthInMilliseconds: data.lengthInMilliseconds ?? null },
      { "Cache-Control": "public, max-age=86400" },
    );
  } catch (error) {
    return jsonResponse(502, { error: "Arclight request failed", message: error.message });
  }
};
