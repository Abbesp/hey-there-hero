import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const KUCOIN_BASE_URL = "https://api.kucoin.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200, // alltid 200
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

async function hmacBase64(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64(new Uint8Array(sig));
}

async function createSignature(ts: string, method: string, path: string, body: string, secret: string) {
  const toSign = ts + method.toUpperCase() + path + body;
  return await hmacBase64(toSign, secret);
}

async function createPassphrase(passphrase: string, secret: string) {
  return await hmacBase64(passphrase, secret);
}

async function kucoinHeaders(method: string, endpoint: string, body: string) {
  const apiKey = Deno.env.get("KUCOIN_API_KEY");
  const apiSecret = Deno.env.get("KUCOIN_API_SECRET");
  const passphrase = Deno.env.get("KUCOIN_API_PASSPHRASE");
  const apiVersion = Deno.env.get("KUCOIN_API_VERSION") || "2"; // default 2

  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error("Missing KuCoin API credentials");
  }

  const ts = Date.now().toString();
  const headers: Record<string, string> = {
    "KC-API-KEY": apiKey,
    "KC-API-SIGN": await createSignature(ts, method, endpoint, body, apiSecret),
    "KC-API-TIMESTAMP": ts,
    "KC-API-KEY-VERSION": apiVersion,
    "Content-Type": "application/json",
  };

  if (apiVersion === "2") {
    headers["KC-API-PASSPHRASE"] = await createPassphrase(passphrase, apiSecret);
  } else {
    headers["KC-API-PASSPHRASE"] = passphrase; // v1: raw passphrase
  }

  // log safe headers
  const safeHeaders = { ...headers };
  delete safeHeaders["KC-API-SIGN"];
  console.log("KuCoin headers (safe):", safeHeaders);

  return headers;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "ping");

    if (action === "ping") {
      return json({ success: true, message: "pong" });
    }

    if (action === "get_market_data") {
      const r = await fetch(`${KUCOIN_BASE_URL}/api/v1/market/allTickers`);
      const out = await r.json();
      if (!r.ok) {
        console.error("KuCoin market error:", out);
        return json({ success: false, error: out?.msg || "KuCoin market data error", details: out });
      }

      const wanted = new Set(["BTC-USDT", "ETH-USDT", "ADA-USDT", "SOL-USDT", "MATIC-USDT"]);
      const prices: Record<string, number> = {};
      const symbols: string[] = [];
      for (const t of out?.data?.ticker ?? []) {
        if (wanted.has(t.symbol)) {
          symbols.push(t.symbol);
          const p = Number(t.last);
          if (!Number.isNaN(p)) prices[t.symbol] = p;
        }
      }
      return json({ success: true, symbols, prices });
    }

    if (action === "place_order") {
      const { symbol, side, size, type = "market", price } = body ?? {};
      if (!symbol || !side || !size) return json({ success: false, error: "Missing order params" });

      const endpoint = "/api/v1/orders";
      const payload: Record<string, unknown> = {
        clientOid: crypto.randomUUID(),
        symbol,
        side: String(side).toLowerCase(),
        type,
      };

      if (type === "market") {
        if (payload.side === "buy") {
          payload.funds = String(size); // USDT-belopp att spendera
        } else {
          payload.size = String(size); // antal coins att sälja
        }
      }

      if (type === "limit") {
        payload.price = String(price);
        payload.size = String(size);
        payload.timeInForce = "GTC";
      }

      const bodyStr = JSON.stringify(payload);
      const headers = await kucoinHeaders("POST", endpoint, bodyStr);
      const r = await fetch(`${KUCOIN_BASE_URL}${endpoint}`, { method: "POST", headers, body: bodyStr });

      let out: any;
      try {
        out = await r.json();
      } catch (e) {
        console.error("KuCoin order non-JSON response:", await r.text());
        return json({ success: false, error: "KuCoin order non-JSON response" });
      }

      // kontrollera både HTTP och KuCoin-code
      if (!r.ok || !out || out.code !== "200000") {
        console.error("KuCoin order error:", { status: r.status, out, payload });
        return json({
          success: false,
          error: out?.msg || "KuCoin order error",
          details: out,
          request: payload,
          status: r.status,
        });
      }

      return json({
        success: true,
        orderId: out.data?.orderId ?? null,
        raw: out,
      });
    }

    return json({ success: false, error: "Unknown action" });
  } catch (err: any) {
    console.error("Error in kucoin-trading:", err);
    return json({ success: false, error: String(err?.message || err) });
  }
});
