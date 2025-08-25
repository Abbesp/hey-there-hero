import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const KUCOIN_BASE_URL = "https://api.kucoin.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200, // alltid 200!
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
  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error("Missing KuCoin API credentials");
  }
  const ts = Date.now().toString();
  return {
    "KC-API-KEY": apiKey,
    "KC-API-SIGN": await createSignature(ts, method, endpoint, body, apiSecret),
    "KC-API-TIMESTAMP": ts,
    "KC-API-PASSPHRASE": await createPassphrase(passphrase, apiSecret),
    "KC-API-KEY-VERSION": "2",
    "Content-Type": "application/json",
  };
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
          payload.funds = String(size);
        } else {
          payload.size = String(size);
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
      const out = await r.json();
      if (!r.ok) {
        console.error("KuCoin order error:", out);
        return json({ success: false, error: out?.msg || "KuCoin order error", details: out });
      }

      return json({ success: true, orderId: out?.data?.orderId ?? out?.orderId ?? null });
    }

    return json({ success: false, error: "Unknown action" });
  } catch (err: any) {
    console.error("Error in kucoin-trading:", err);
    return json({ success: false, error: String(err?.message || err) });
  }
});

