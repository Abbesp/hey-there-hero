import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createHmac } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // ✅ lagt till
};

// KuCoin API configuration
const KUCOIN_BASE_URL = "https://api.kucoin.com";

// Helper function to create KuCoin signature
function createSignature(timestamp: string, method: string, requestPath: string, body: string, secret: string): string {
  const strForSign = timestamp + method + requestPath + body;
  const signatureBytes = createHmac("sha256", new TextEncoder().encode(secret))
    .update(new TextEncoder().encode(strForSign))
    .digest();
  return btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));
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
  
  // Create passphrase signature
  const passphraseSignature = createSignature(timestamp, "GET", "/api/v1/key", "", apiSecret);
  
  return {
    "KC-API-KEY": apiKey,
    "KC-API-SIGN": signature,
    "KC-API-TIMESTAMP": timestamp,
    "KC-API-PASSPHRASE": passphraseSignature,
    "KC-API-KEY-VERSION": "2",
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  // ✅ Ny korrekt OPTIONS-hantering
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { action, orderData } = await req.json();
    
    if (action === "place_order") {
      const { symbol, side, type, size, stopPrice } = orderData;
      
      // Prepare order payload for KuCoin
      const orderPayload: any = {
        clientOid: crypto.randomUUID(),
        symbol: symbol,
        side: side,
        type: type,
        size: size.toString(),
      };

      // Add stop price if provided
      if (stopPrice && type === "market") {
        orderPayload.stop = side === "buy" ? "loss" : "entry";
        orderPayload.stopPrice = stopPrice.toString();
      }

      const endpoint = "/api/v1/orders";
      const body = JSON.stringify(orderPayload);
      const headers = createKuCoinHeaders("POST", endpoint, body);

      console.log("Placing KuCoin order:", orderPayload);
      
      const response = await fetch(`${KUCOIN_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: headers,
        body: body,
      });

      const result = await response.json();
      
      if (!response.ok) {
        console.error("KuCoin API error:", result);
        throw new Error(`KuCoin API error: ${result.msg || 'Unknown error'}`);
      }

      console.log("KuCoin order placed successfully:", result);
      
      return new Response(JSON.stringify({
        success: true,
        orderId: result.data?.orderId,
        message: "Order placed successfully",
        kucoinResponse: result
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, // ✅ lagt till CORS
        status: 200,
      });
    }

    // Handle other actions like getting account info, market data, etc.
    if (action === "get_account") {
      const endpoint = "/api/v1/accounts";
      const headers = createKuCoinHeaders("GET", endpoint, "");
      
      const response = await fetch(`${KUCOIN_BASE_URL}${endpoint}`, {
        method: "GET",
        headers: headers,
      });

      const result = await response.json();
      
      return new Response(JSON.stringify({
        success: true,
        data: result.data
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, // ✅ lagt till CORS
        status: 200,
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    console.error("Error in kucoin-trading function:", error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      message: "Failed to process KuCoin request"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, // ✅ lagt till CORS
      status: 500,
    });
  }
});
