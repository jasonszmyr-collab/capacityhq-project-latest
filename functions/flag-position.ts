/**
 * ============================================================================
 * BASE44 — PATENT-SAFE BACKEND (MODEL A: REQUEST + VISIBILITY ONLY)
 * ----------------------------------------------------------------------------
 * What this code DOES:
 *   - Stores user/operator REQUESTS (requested_position, testmode_request)
 *   - Exposes an HTTP endpoint to submit requests
 *   - Optionally "acks" denied requests (no retries, no enforcement)
 *
 * What this code DOES NOT DO (by design, per patent):
 *   - Does NOT compute final/enforced position
 *   - Does NOT apply half-staff rules
 *   - Does NOT manage directive expiration
 *   - Does NOT run centralized control logic / cron updates
 *
 * The DEVICE (Arduino) is the compliance authority and publishes:
 *   - enforced_position
 *   - arduino_status (e.g., ENFORCED, DENIED_REQUEST)
 *   - explain (human-readable rationale)
 * ============================================================================
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";

type RequestBody = {
  request?: "full" | "half" | "down" | "auto";
  testmode?: boolean;
  // Optional: client-side correlation id to track a single request end-to-end
  request_id?: string;
};

function normalizeRequestedPosition(req?: string) {
  if (!req) return null;
  const v = req.toLowerCase();
  if (v === "full") return "full";
  if (v === "half") return "half";
  if (v === "down") return "down";
  if (v === "auto") return "auto";
  return null;
}

async function getLatestFlagPosition(base44: any) {
  const list = await base44.asServiceRole.entities.FlagPosition.list(
    "-updated_date",
    1
  );
  if (!list || list.length === 0) return null;
  return list[0];
}

/**
 * Store a request in Base44.
 * This is intentionally "dumb":
 *   - It does not infer enforcement
 *   - It does not retry
 *   - It does not mutate enforced_position / position fields
 */
async function storeRequest(
  base44: any,
  flagData: any,
  body: RequestBody
) {
  const requested = normalizeRequestedPosition(body.request);

  const patch: Record<string, unknown> = {};
  const nowIso = new Date().toISOString();

  // Store request fields ONLY (do not touch enforced fields)
  if (requested) {
    patch.requested_position = requested; // "full|half|down|auto"
    patch.requested_at = nowIso;
  }

  if (typeof body.testmode === "boolean") {
    patch.testmode_request = body.testmode;
    patch.testmode_requested_at = nowIso;
  }

  if (body.request_id) {
    patch.last_request_id = body.request_id;
  }

  // If nothing valid provided, do nothing
  if (Object.keys(patch).length === 0) {
    return { updated: false, note: "No valid request provided." };
  }

  await base44.asServiceRole.entities.FlagPosition.update(flagData.id, patch);

  return { updated: true, patch };
}

/**
 * Optional helper:
 * If the device reported DENIED_REQUEST, we can record that the UI/backend saw it.
 * This is NOT enforcement and does not change any requested/enforced state.
 */
async function acknowledgeDenialIfPresent(base44: any, flagData: any) {
  const status = (flagData.arduino_status || "").toString();
  if (status !== "DENIED_REQUEST") return { acked: false };

  // Record an acknowledgement timestamp (optional)
  await base44.asServiceRole.entities.FlagPosition.update(flagData.id, {
    denial_ack_at: new Date().toISOString(),
  });

  return { acked: true };
}

// ---------------------------------------------------------------------------
// HTTP endpoint:
//   POST /   with JSON body:
//     { "request": "full|half|down|auto", "testmode": true|false, "request_id": "..." }
//
//   GET /    returns current record (including enforced_position + explain)
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Always operate on the most recent FlagPosition record
    const flagData = await getLatestFlagPosition(base44);
    if (!flagData) {
      return Response.json(
        { success: false, error: "No FlagPosition record found." },
        { status: 404 }
      );
    }

    // GET: visibility only
    if (req.method === "GET") {
      // Optionally acknowledge any denial for UI analytics
      const denialAck = await acknowledgeDenialIfPresent(base44, flagData);

      return Response.json({
        success: true,
        mode: "PATENT_SAFE_REQUEST_VISIBILITY_ONLY",
        record: {
          id: flagData.id,

          // Requests (set by UI/backend)
          requested_position: flagData.requested_position ?? null,
          requested_at: flagData.requested_at ?? null,
          testmode_request: flagData.testmode_request ?? null,
          testmode_requested_at: flagData.testmode_requested_at ?? null,
          last_request_id: flagData.last_request_id ?? null,

          // Enforced (set by device firmware only)
          enforced_position: flagData.enforced_position ?? null,
          half_staff_active: flagData.half_staff_active ?? null,
          arduino_status: flagData.arduino_status ?? null,
          explain: flagData.explain ?? null,
          last_arduino_poll: flagData.last_arduino_poll ?? null,

          // Optional analytics
          denial_ack_at: flagData.denial_ack_at ?? null,
        },
        denialAck,
      });
    }

    // POST: store requests only
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return Response.json(
          {
            success: false,
            error: "Expected application/json",
          },
          { status: 415 }
        );
      }

      const body = (await req.json()) as RequestBody;

      const result = await storeRequest(base44, flagData, body);

      // Re-fetch record after update for response
      const refreshed = await getLatestFlagPosition(base44);

      return Response.json({
        success: true,
        mode: "PATENT_SAFE_REQUEST_VISIBILITY_ONLY",
        result,
        record: refreshed
          ? {
              id: refreshed.id,
              requested_position: refreshed.requested_position ?? null,
              requested_at: refreshed.requested_at ?? null,
              testmode_request: refreshed.testmode_request ?? null,
              testmode_requested_at: refreshed.testmode_requested_at ?? null,
              last_request_id: refreshed.last_request_id ?? null,

              enforced_position: refreshed.enforced_position ?? null,
              half_staff_active: refreshed.half_staff_active ?? null,
              arduino_status: refreshed.arduino_status ?? null,
              explain: refreshed.explain ?? null,
              last_arduino_poll: refreshed.last_arduino_poll ?? null,
            }
          : null,
        note:
          "Request stored. Device firmware will enforce compliance and report enforced state.",
      });
    }

    // Method not allowed
    return Response.json(
      { success: false, error: "Method not allowed." },
      { status: 405 }
    );
  } catch (error: any) {
    return Response.json(
      { success: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
});
