import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createHmac } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // ← viktigt
};

// KuCoin API configuration
const KUCOIN_BASE_URL = "https://api.kucoin.com";

// Helper: base64(HMAC_SHA256(message, secret))
function hmacBase64(message: string, secret: string): string {
  const bytes = createHmac("sha256", new TextEncoder().encode(secret))
    .update(new TextEncoder().encode(message))
    .digest();
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

// Helper function to create KuCoin request signature
function createSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  secret: string
): string {
  // per KuCoin: sign on `${timestamp}${method}${requestPath}${body}`
  const strForSign = timestamp + method.toUpperCase() + requestPath + body;
  return hmacBase64(strForSign, secret);
}

// ✅ Correct passphrase hashing for KEY-VERSION 2
function createPassphrase(passphrase: string, secret: string): string {
  // per KuCoin v2: KC-API-PASSPHRASE = base64(hmac_sha256(passphrase, apiSecret))
  return hmacBase64(passphrase, secret);
}

// Helper to create KuCoin headers
function createKuCoinHeaders(method: string, endpoint: string, body: string) {
  const apiKey = Deno.env.get("KUCOIN_API_KEY");
  const apiSecret = Deno.env.get("KUCOIN_API_SECRET");
  const passphrase = Deno.env.get("KUCOIN_API_PASSPHRASE");

  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error("Missing KuCoin API credentials");
  }

  const timestamp = Date.now().toString();
  const signature = createSignature(timestamp, method, endpoint, body, apiSecret);

  return {
    "KC-API-KEY": apiKey,
    "KC-API-SIGN": signature,
    "KC-API-TIMESTAMP": timestamp,
    "KC-API-PASSPHRASE": createPassphrase(passphrase, apiSecret), // ✅ fix
    "KC-API-KEY-VERSION": "2",
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  // ✅ Robust OPTIONS-hantering för CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { action, orderData } = await req.json();

    // ✅ Ny: hämta marknadsdata (offentligt endpoint – ingen auth)
    if (action === "get_market_data") {
      // Hämtar alla tickers och filtrerar några vanliga par
      const response = await fetch(`${KUCOIN_BASE_URL}/api/v1/market/allTickers`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(`KuCoin market data error: ${result.msg || "Unknown error"}`);
      }

      // Exempel: plocka ut några symboler (frontend verkar förvänta "symbols" + "prices")
      const wanted = new Set(["BTC-USDT", "ETH-USDT", "ADA-USDT", "SOL-USDT", "MATIC-USDT"]);
      const prices: Record<string, number> = {};
      const symbols: string[] = [];

      for (const t of result.data?.ticker ?? []) {
        if (wanted.has(t.symbol)) {
          symbols.push(t.symbol);
          // t.last eller t.averagePrice kan förekomma; här använder vi last
          const p = Number(t.last);
          if (!Number.isNaN(p)) prices[t.symbol] = p;
        }
      }

      return new Response(JSON.stringify({ success: true, symbols, prices }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "place_order") {
      const { symbol, side, type, size, stopPrice } = orderData;

      // Prepare order payload for KuCoin
      const orderPayload: any = {
        clientOid: crypto.randomUUID(),
        symbol,
        side,         // "buy" | "sell"
        type,         // "market" | "limit" etc.
        size: String(size),
      };

      // Add stop price if provided (obs: KuCoin har särskilda fält/valideringar för stop orders)
      if (stopPrice && type === "market") {
        orderPayload.stop = side === "buy" ? "loss" : "entry";
        orderPayload.stopPrice = String(stopPrice);
      }

      const endpoint = "/api/v1/orders";
      const body = JSON.stringify(orderPayload);
      const headers = createKuCoinHeaders("POST", endpoint, body);

      console.log("Placing KuCoin order:", orderPayload);

      const response = await fetch(`${KUCOIN_BASE_URL}${endpoint}`, {
        method: "POST",
        headers,
        body,
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("KuCoin API error:", result);
        throw new Error(`KuCoin API error: ${result.msg || "Unknown error"}`);
      }

      console.log("KuCoin order placed successfully:", result);

      return new Response(JSON.stringify({
        success: true,
        orderId: result.data?.orderId,
        message: "Order placed successfully",
        kucoinResponse: result
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Handle other actions like getting account info, market data, etc.
    if (action === "get_account") {
      const endpoint = "/api/v1/accounts";
      const headers = createKuCoinHeaders("GET", endpoint, "");

      const response = await fetch(`${KUCOIN_BASE_URL}${endpoint}`, {
        method: "GET",
        headers,
      });

      const result = await response.json();

      return new Response(JSON.stringify({
        success: true,
        data: result.data
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: any) {
    console.error("Error in kucoin-trading function:", error);

    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      message: "Failed to process KuCoin request"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
