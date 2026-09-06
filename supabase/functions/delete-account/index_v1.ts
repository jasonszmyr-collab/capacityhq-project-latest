import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed." },
      {
        status: 405,
        headers: corsHeaders,
      }
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { error: "Authentication required." },
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Required Supabase environment variables are missing.");

      return Response.json(
        { error: "Server configuration error." },
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    // Validate the caller's access token.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error("Unable to authenticate delete request:", userError);

      return Response.json(
        { error: "Invalid or expired authentication session." },
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    // Administrative client exists only inside this Edge Function.
    // The service-role key is never exposed to the HonorPole app.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // IMPORTANT:
    // We delete only the authenticated caller.
    // No user ID is accepted from the request body.
    const { error: deleteError } =
      await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("Account deletion failed:", deleteError);

      return Response.json(
        { error: "Unable to delete account." },
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    return Response.json(
      {
        success: true,
        message: "Account deleted.",
      },
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error("Unexpected account deletion error:", error);

    return Response.json(
      { error: "Unexpected server error." },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});