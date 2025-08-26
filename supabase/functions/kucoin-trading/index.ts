import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Type declarations for Deno environment
declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
  };
}

const KUCOIN_BASE_URL = "https://api.kucoin.com";

// Type interfaces for KuCoin API responses
interface KuCoinResponse<T = any> {
  code: string;
  data: T;
  msg?: string;
  message?: string;
  error?: string;
}

interface KuCoinOrderData {
  orderId: string;
  [key: string]: any;
}

interface KuCoinTicker {
  symbol: string;
  last: string;
  [key: string]: any;
}

interface KuCoinMarketData {
  ticker: KuCoinTicker[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
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
  const apiVersion = Deno.env.get("KUCOIN_API_VERSION") || "2"; // default v2

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
    // Encrypted passphrase
    headers["KC-API-PASSPHRASE"] = await createPassphrase(passphrase, apiSecret);
  } else {
    // Raw passphrase
    headers["KC-API-PASSPHRASE"] = passphrase;
  }

  // Log safe headers
  const safeHeaders = { ...headers };
  delete safeHeaders["KC-API-SIGN"];
  console.log("KuCoin headers (safe):", safeHeaders);

  return headers;
}

/* ============================================================
   >>> Dina två funktioner inlagda (portade till Deno HMAC) <<<
   - place_order(): använder env KUCOIN_API_VERSION (default "3")
   - debug_order(): kör en fast testorder (BTC-USDT, buy, 5 USDT)
   - Dessa kan användas fristående eller via actions nedan
   ============================================================ */

async function place_order(
  symbol: string,
  side: "buy" | "sell",
  size: string,
  type: "market" | "limit",
) {
  let stage = "init";
  try {
    stage = "env_setup";
    const apiKey = Deno.env.get("KUCOIN_API_KEY")!;
    const apiSecret = Deno.env.get("KUCOIN_API_SECRET")!;
    const passphrase = Deno.env.get("KUCOIN_API_PASSPHRASE")!;
    const apiVersion = Deno.env.get("KUCOIN_API_VERSION") || "3"; // default v3 (din kod)

    if (!apiKey || !apiSecret || !passphrase) {
      throw new Error("Missing API credentials");
    }

    stage = "build_payload";
    const endpoint = "/api/v1/orders";
    const url = KUCOIN_BASE_URL + endpoint;

    const payload: Record<string, string> = {
      clientOid: crypto.randomUUID(),
      side,
      symbol,
      type,
    };

    if (type === "market") {
      if (side === "buy") {
        payload.funds = size; // USDT amount
      } else {
        payload.size = size; // coin amount
      }
    } else {
      payload.price = "30000"; // demo price for limit
      payload.size = size;
    }

    stage = "signing";
    const timestamp = Date.now().toString();
    const signature = await createSignature(timestamp, "POST", endpoint, JSON.stringify(payload), apiSecret);

    const headers: Record<string, string> = {
      "KC-API-KEY": apiKey,
      "KC-API-SIGN": signature,
      "KC-API-TIMESTAMP": timestamp,
      "KC-API-KEY-VERSION": apiVersion,
      "Content-Type": "application/json",
    };

    if (apiVersion === "2") {
      headers["KC-API-PASSPHRASE"] = await createPassphrase(passphrase, apiSecret);
    } else {
      headers["KC-API-PASSPHRASE"] = passphrase; // plaintext for v3
    }

    stage = "sending_request";
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });

    const responseText = await r.text();
    let out: any;
    try {
      out = JSON.parse(responseText);
    } catch {
      out = { raw: responseText };
    }

    if (out?.code === "200000") {
      return { success: true, data: out.data };
    } else {
      return {
        success: false,
        stage: "KuCoin order API response",
        error: "KuCoin returned non-success code",
        code: out?.code,
        msg: out?.msg,
        request: {
          endpoint,
          payload,
          headers: { ...headers, "KC-API-SIGN": "[HIDDEN]" }, // mask sign
        },
        response: {
          status: r.status,
          raw: responseText,
          parsed: out,
        },
      };
    }
  } catch (err: any) {
    return {
      success: false,
      stage,
      error: err?.message || "Unexpected error",
    };
  }
}

// Din debug_order() som anropar place_order() ovan och returnerar Response via json()
async function debug_order() {
  try {
    const symbol = "BTC-USDT"; // demo symbol
    const side: "buy" = "buy";
    const size = "5"; // köp för 5 USDT
    const type: "market" = "market";

    // kör riktiga place_order men i debug-läge
    const result = await place_order(symbol, side, size, type);

    return json({
      success: result.success,
      debug: true,
      orderRequest: {
        symbol,
        side,
        size,
        type,
      },
      orderResult: result,
    });
  } catch (err: any) {
    return json({
      success: false,
      debug: true,
      stage: "debug_order",
      error: err?.message || "Unexpected error in debug_order",
    });
  }
}

/* ================== SLUT på dina två funktioner ================== */

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
      const out: KuCoinResponse<KuCoinMarketData> = await r.json();
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

    if (action === "test_kucoin_connection") {
      try {
        // Test basic connectivity
        const r = await fetch(`${KUCOIN_BASE_URL}/api/v1/status`);
        const status: KuCoinResponse = await r.json();

        // Test authenticated endpoint
        const headers = await kucoinHeaders("GET", "/api/v1/accounts", "");
        const accountsR = await fetch(`${KUCOIN_BASE_URL}/api/v1/accounts`, { headers });
        const accounts: KuCoinResponse = await accountsR.json();

        return json({
          success: true,
          status: status,
          accounts: accounts,
          apiVersion: Deno.env.get("KUCOIN_API_VERSION") || "2"
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("KuCoin connection test error:", err);
        return json({
          success: false,
          error: errorMessage,
          details: err
        });
      }
    }

    // >>> Din exakta debug-order som fast endpoint
    if (action === "debug_order_fixed") {
      return await debug_order();
    }

    // >>> Din place_order som endpoint (tar params från body)
    if (action === "place_order_user") {
      try {
        const symbol = String(body?.symbol ?? "");
        const side = String(body?.side ?? "").toLowerCase() as "buy" | "sell";
        const size = String(body?.size ?? "");
        const type = String(body?.type ?? "market").toLowerCase() as "market" | "limit";

        if (!symbol || !side || !size) {
          return json({
            success: false,
            error: "Missing order params",
            required: ["symbol", "side", "size"],
            received: { symbol, side, size, type }
          });
        }

        const res = await place_order(symbol, side, size, type);
        return json({ success: res.success, result: res, request: { symbol, side, size, type } });
      } catch (err: any) {
        return json({
          success: false,
          error: err?.message || "Unexpected error in place_order_user"
        });
      }
    }

    // Befintlig debug_order (behållen)
    if (action === "debug_order") {
      const { symbol, side, size, type = "market", price } = body ?? {};
      if (!symbol || !side || !size) return json({ success: false, error: "Missing order params" });

      try {
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

        console.log("=== DEBUG ORDER PLACEMENT ===");
        console.log("Symbol:", symbol);
        console.log("Side:", side);
        console.log("Size:", size);
        console.log("Type:", type);
        console.log("Price:", price);
        console.log("Full payload:", payload);
        console.log("Request body:", bodyStr);
        console.log("API endpoint:", `${KUCOIN_BASE_URL}${endpoint}`);
        console.log("Headers (safe):", { ...headers, "KC-API-SIGN": "[HIDDEN]" });

        const r = await fetch(`${KUCOIN_BASE_URL}${endpoint}`, { method: "POST", headers, body: bodyStr });

        console.log("Response status:", r.status);
        console.log("Response headers:", Object.fromEntries(r.headers.entries()));

        const responseText = await r.text();
        console.log("Raw response:", responseText);

        let parsedResponse;
        try {
          parsedResponse = JSON.parse(responseText);
          console.log("Parsed response:", parsedResponse);
        } catch (e) {
          console.log("Failed to parse response as JSON:", e);
          parsedResponse = null;
        }

        return json({
          success: true,
          debug: {
            request: { symbol, side, size, type, price, payload, bodyStr, endpoint },
            response: { status: r.status, headers: Object.fromEntries(r.headers.entries()), text: responseText, parsed: parsedResponse }
          }
        });

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("Debug order error:", err);
        return json({
          success: false,
          error: errorMessage,
          details: err
        });
      }
    }

    if (action === "test_btc_order") {
      try {
        // Test the exact BTC-USDT order that's failing
        const endpoint = "/api/v1/orders";
        const payload = {
          clientOid: crypto.randomUUID(),
          symbol: "BTC-USDT",
          side: "buy",
          type: "market",
          funds: "10" // 10 USDT
        };

        const bodyStr = JSON.stringify(payload);
        const headers = await kucoinHeaders("POST", endpoint, bodyStr);

        console.log("=== TESTING BTC-USDT ORDER ===");
        console.log("Payload:", payload);
        console.log("Request body:", bodyStr);

        const r = await fetch(`${KUCOIN_BASE_URL}${endpoint}`, { method: "POST", headers, body: bodyStr });

        console.log("Response status:", r.status);
        console.log("Response headers:", Object.fromEntries(r.headers.entries()));

        const responseText = await r.text();
        console.log("Raw response:", responseText);

        let parsedResponse;
        try {
          parsedResponse = JSON.parse(responseText);
          console.log("Parsed response:", parsedResponse);

          // Analyze the response structure
          const analysis = {
            hasCode: !!parsedResponse?.code,
            code: parsedResponse?.code,
            hasData: !!parsedResponse?.data,
            hasMsg: !!parsedResponse?.msg,
            hasMessage: !!parsedResponse?.message,
            responseKeys: Object.keys(parsedResponse || {}),
            dataKeys: parsedResponse?.data ? Object.keys(parsedResponse.data) : [],
            isSuccess: parsedResponse?.code === "200000",
            errorMessage: parsedResponse?.msg || parsedResponse?.message || "No error message found"
          };

          console.log("Response analysis:", analysis);

          return json({
            success: true,
            test: {
              request: payload,
              response: { status: r.status, text: responseText, parsed: parsedResponse },
              analysis: analysis
            }
          });

        } catch (e) {
          console.log("Failed to parse response as JSON:", e);
          return json({
            success: true,
            test: {
              request: payload,
              response: { status: r.status, text: responseText, parseError: String(e) }
            }
          });
        }

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("Test BTC order error:", err);
        return json({
          success: false,
          error: errorMessage,
          details: err
        });
      }
    }

    if (action === "test_eth_order") {
      try {
        // Test the exact ETH-USDT order that's failing in your bot
        const endpoint = "/api/v1/orders";
        const payload = {
          clientOid: crypto.randomUUID(),
          symbol: "ETH-USDT",
          side: "sell", // Based on your bot showing SELL for ETH-USDT
          type: "market",
          size: "0.01" // Small amount for testing
        };

        const bodyStr = JSON.stringify(payload);
        const headers = await kucoinHeaders("POST", endpoint, bodyStr);

        console.log("=== TESTING ETH-USDT ORDER ===");
        console.log("Payload:", payload);
        console.log("Request body:", bodyStr);

        const r = await fetch(`${KUCOIN_BASE_URL}${endpoint}`, { method: "POST", headers, body: bodyStr });

        console.log("Response status:", r.status);
        console.log("Response headers:", Object.fromEntries(r.headers.entries()));

        const responseText = await r.text();
        console.log("Raw response:", responseText);

        let parsedResponse;
        try {
          parsedResponse = JSON.parse(responseText);
          console.log("Parsed response:", parsedResponse);

          // Analyze the response structure
          const analysis = {
            hasCode: !!parsedResponse?.code,
            code: parsedResponse?.code,
            hasData: !!parsedResponse?.data,
            hasMsg: !!parsedResponse?.msg,
            hasMessage: !!parsedResponse?.message,
            responseKeys: Object.keys(parsedResponse || {}),
            dataKeys: parsedResponse?.data ? Object.keys(parsedResponse.data) : [],
            isSuccess: parsedResponse?.code === "200000",
            errorMessage: parsedResponse?.msg || parsedResponse?.message || "No error message found"
          };

          console.log("Response analysis:", analysis);

          return json({
            success: true,
            test: {
              request: payload,
              response: { status: r.status, text: responseText, parsed: parsedResponse },
              analysis: analysis
            }
          });

        } catch (e) {
          console.log("Failed to parse response as JSON:", e);
          return json({
            success: true,
            test: {
              request: payload,
              response: { status: r.status, text: responseText, parseError: String(e) }
            }
          });
        }

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("Test ETH order error:", err);
        return json({
          success: false,
          error: errorMessage,
          details: err
        });
      }
    }

    if (action === "place_order") {
      const { symbol, side, size, type = "market", price } = body ?? {};

      // Enhanced validation
      if (!symbol || !side || !size) {
        return json({
          success: false,
          error: "Missing order params",
          required: ["symbol", "side", "size"],
          received: { symbol, side, size, type, price }
        });
      }

      // Validate symbol format
      if (typeof symbol !== "string" || !symbol.includes("-")) {
        return json({
          success: false,
          error: "Invalid symbol format. Expected format: BASE-QUOTE (e.g., BTC-USDT)"
        });
      }

      // Validate side
      if (!["buy", "sell"].includes(String(side).toLowerCase())) {
        return json({
          success: false,
          error: "Invalid side. Must be 'buy' or 'sell'"
        });
      }

      // Validate size
      if (isNaN(Number(size)) || Number(size) <= 0) {
        return json({
          success: false,
          error: "Invalid size. Must be a positive number"
        });
      }

      // Validate type
      if (!["market", "limit"].includes(type)) {
        return json({
          success: false,
          error: "Invalid order type. Must be 'market' or 'limit'"
        });
      }

      // Validate price for limit orders
      if (type === "limit" && (!price || isNaN(Number(price)) || Number(price) <= 0)) {
        return json({
          success: false,
          error: "Invalid price for limit order. Must be a positive number"
        });
      }

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

      console.log(`Placing ${type} order:`, { symbol, side, size, price, payload });
      console.log("Request payload:", bodyStr);
      console.log("Request headers (safe):", { ...headers, "KC-API-SIGN": "[HIDDEN]" });

      const r = await fetch(`${KUCOIN_BASE_URL}${endpoint}`, { method: "POST", headers, body: bodyStr });

      console.log("Response status:", r.status);
      console.log("Response headers:", Object.fromEntries(r.headers.entries()));

      let out: KuCoinResponse<KuCoinOrderData>;
      let responseText = "";

      try {
        responseText = await r.text();
        console.log("Raw response text:", responseText);

        if (!responseText.trim()) {
          console.error("Empty response from KuCoin");
          return json({
            success: false,
            error: "Empty response from KuCoin",
            status: r.status
          });
        }

        out = JSON.parse(responseText);
      } catch (e) {
        console.error("KuCoin order non-JSON response:", responseText);
        return json({
          success: false,
          error: "KuCoin order non-JSON response",
          responseText,
          status: r.status,
          parseError: String(e)
        });
      }

      console.log("Parsed response:", out);
      console.log("Response type:", typeof out);
      console.log("Response has code:", !!out?.code);
      console.log("Response code:", out?.code);
      console.log("Response has data:", !!out?.data);
      console.log("Response data:", out?.data);

      // Check for HTTP success first
      if (!r.ok) {
        console.error("KuCoin order HTTP error:", { status: r.status, out, payload });
        return json({
          success: false,
          error: `KuCoin HTTP error: ${r.status}`,
          details: out,
          request: payload,
          status: r.status,
        });
      }

      // Handle case where response might not have the expected structure
      if (!out) {
        console.error("KuCoin order response is null/undefined");
        return json({
          success: false,
          error: "KuCoin order response is null/undefined",
          responseText,
          request: payload,
        });
      }

      // Log the complete response for debugging
      console.log("Complete KuCoin response:", JSON.stringify(out, null, 2));

      // Check if response has the expected structure
      if (!out.code) {
        console.error("KuCoin order response missing code field:", { out, payload });

        // Try to extract any error information from the response
        let errorMessage = "KuCoin order response missing code field - unexpected response format";
        if (out.msg) errorMessage = out.msg;
        else if (out.message) errorMessage = out.message;
        else if (out.error) errorMessage = out.error;
        else if ((out as any).data && (out as any).data.error) errorMessage = (out as any).data.error;

        return json({
          success: false,
          error: errorMessage,
          response: out,
          responseText,
          request: payload,
          responseStructure: {
            hasCode: !!out?.code,
            hasData: !!out?.data,
            hasMsg: !!out?.msg,
            hasMessage: !!out?.message,
            hasError: !!(out as any)?.error,
            responseKeys: Object.keys(out || {}),
            dataKeys: (out as any)?.data ? Object.keys((out as any).data) : []
          }
        });
      }

      // Check if this is a successful response from KuCoin
      // KuCoin returns code "200000" for success
      if (out.code === "200000") {
        // Success! Check if we have order data
        if (!out.data || !out.data.orderId) {
          console.error("KuCoin order missing data:", { out, payload });
          return json({
            success: false,
            error: "KuCoin order response missing order data",
            details: out,
            request: payload,
          });
        }

        console.log("Order placed successfully:", { orderId: out.data.orderId, symbol, side, size });
        return json({
          success: true,
          orderId: out.data.orderId,
          raw: out,
        });
      }

      // If we get here, it's an error response
      console.error("KuCoin order API error:", { out, payload, headers });

      // Extract error message with fallbacks
      let errorMessage = "KuCoin order failed";
      if (out.msg) errorMessage = out.msg;
      else if (out.message) errorMessage = out.message;
      else if (out.error) errorMessage = out.error;
      else if ((out as any).data && (out as any).data.error) errorMessage = (out as any).data.error;
      else if (out.code) errorMessage = `KuCoin error: ${out.code}`;

      return json({
        success: false,
        error: errorMessage,
        code: out.code,
        details: out,
        request: payload,
      });
    }

    if (action === "get_order_status") {
      const { orderId } = body ?? {};
      if (!orderId) return json({ success: false, error: "Missing orderId" });

      const endpoint = `/api/v1/orders/${orderId}`;
      const headers = await kucoinHeaders("GET", endpoint, "");

      const r = await fetch(`${KUCOIN_BASE_URL}${endpoint}`, { headers });
      const out: KuCoinResponse<KuCoinOrderData> = await r.json();

      if (!r.ok || !out || out.code !== "200000") {
        console.error("KuCoin get order error:", { status: r.status, out, orderId });
        return json({
          success: false,
          error: out?.msg || "KuCoin get order error",
          details: out,
          orderId,
        });
      }

      return json({
        success: true,
        order: out.data,
        raw: out,
      });
    }

    return json({ success: false, error: "Unknown action" });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Error in kucoin-trading:", err);
    return json({ success: false, error: errorMessage });
  }
});
