import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  clearObsoleteDevCookies,
  createRouteSupabaseClient,
  getRouteSupabaseConfig,
} from "../../../../lib/supabase-route";
import { resilientServerFetch } from "../../../../lib/server-fetch";
import {
  deriveShopkeeperSyntheticEmails,
  isNetworkOrUpstreamError,
  normalizeIndianPhone,
  validateShopkeeperPassword,
} from "../../../../lib/shop-auth-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const ownerFullName =
      typeof body.ownerFullName === "string" ? body.ownerFullName.trim() : "";
    const rawPhone = typeof body.phone === "string" ? body.phone : "";
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    const shopName =
      typeof body.shopName === "string" ? body.shopName.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const addressLine =
      typeof body.addressLine === "string" ? body.addressLine.trim() : "";
    const locality =
      typeof body.locality === "string" && body.locality.trim()
        ? body.locality.trim()
        : "Renukoot";
    const pincode =
      typeof body.pincode === "string" && body.pincode.trim()
        ? body.pincode.trim()
        : "231217";

    if (ownerFullName.length < 2) {
      return NextResponse.json(
        { success: false, error: "Please enter the shop owner's full name." },
        { status: 400 }
      );
    }

    const normalized = normalizeIndianPhone(rawPhone);
    if (!normalized.valid) {
      return NextResponse.json(
        { success: false, error: normalized.error },
        { status: 400 }
      );
    }

    const passwordCheck = validateShopkeeperPassword(password);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { success: false, error: passwordCheck.error },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "Passwords do not match. Please re-enter." },
        { status: 400 }
      );
    }

    if (shopName.length < 2) {
      return NextResponse.json(
        { success: false, error: "Please enter your shop name." },
        { status: 400 }
      );
    }

    if (addressLine.length < 3) {
      return NextResponse.json(
        { success: false, error: "Please enter your complete shop address." },
        { status: 400 }
      );
    }

    const { supabase, applyCookies } = createRouteSupabaseClient(request, {
      rememberMe: true,
    });

    const { primary: syntheticEmail } = deriveShopkeeperSyntheticEmails(
      normalized.clean10
    );

    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const { supabaseUrl } = getRouteSupabaseConfig();

    let createdUserId: string | null = null;
    let hasSession = false;
    let adminClient: ReturnType<typeof createClient> | null = null;

    if (serviceRoleKey) {
      // Server-only admin user provisioning so synthetic @zuno.in accounts are immediately
      // confirmed without requiring an email inbox or disabling Confirm email project-wide.
      adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          fetch: resilientServerFetch,
        },
      });

      // Check existing shop row by phone (using service role to detect PENDING/REJECTED duplicates too)
      const { data: anyExistingShop, error: anyShopErr } = await adminClient
        .from("shops")
        .select("id")
        .or(`phone.eq.${normalized.e164},phone.eq.${normalized.clean10}`)
        .limit(1)
        .maybeSingle();

      if (anyShopErr && isNetworkOrUpstreamError(anyShopErr)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unable to reach database service. Please check your internet connection and try again.",
            code: "network_error",
          },
          { status: 503 }
        );
      }

      if (anyExistingShop) {
        return NextResponse.json(
          {
            success: false,
            error:
              "A shop application already exists for this mobile number. Please sign in or contact ZUNO Support.",
          },
          { status: 409 }
        );
      }

      const { data: adminData, error: adminErr } =
        await adminClient.auth.admin.createUser({
          email: syntheticEmail,
          phone: normalized.e164,
          password,
          email_confirm: true,
          phone_confirm: true,
          user_metadata: {
            full_name: ownerFullName,
            phone: normalized.e164,
            role: "SHOPKEEPER",
          },
        });

      if (adminErr) {
        if (isNetworkOrUpstreamError(adminErr)) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Unable to reach authentication service. Please check your internet connection and try again.",
              code: "network_error",
            },
            { status: 503 }
          );
        }
        const msgLower = (adminErr.message || "").toLowerCase();
        const code = ((adminErr as any).code || "").toLowerCase();
        if (
          code === "email_exists" ||
          code === "phone_exists" ||
          code === "user_already_exists" ||
          msgLower.includes("already registered") ||
          msgLower.includes("already exists")
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                "An account or shop application already exists for this mobile number. Please sign in or contact ZUNO Support.",
            },
            { status: 409 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error:
              adminErr.message ||
              "Unable to create shopkeeper account. Please verify your details.",
          },
          { status: 400 }
        );
      }

      createdUserId = adminData.user?.id || null;
      if (!createdUserId) {
        return NextResponse.json(
          {
            success: false,
            error: "Unable to create shopkeeper account. Please try again.",
          },
          { status: 500 }
        );
      }
    } else {
      // Fallback when service-role key is not configured: standard signUp
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: syntheticEmail,
        password,
        options: {
          data: {
            full_name: ownerFullName,
            phone: normalized.e164,
            role: "SHOPKEEPER",
          },
        },
      });

      if (signUpError) {
        if (isNetworkOrUpstreamError(signUpError)) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Unable to reach authentication service. Please check your internet connection and try again.",
              code: "network_error",
            },
            { status: 503 }
          );
        }
        const msgLower = (signUpError.message || "").toLowerCase();
        const code = ((signUpError as any).code || "").toLowerCase();
        if (
          code === "user_already_exists" ||
          msgLower.includes("already registered") ||
          msgLower.includes("already exists")
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                "An account or shop application already exists for this mobile number. Please sign in or contact ZUNO Support.",
            },
            { status: 409 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error:
              signUpError.message ||
              "Unable to create shopkeeper account. Please verify your details.",
          },
          { status: 400 }
        );
      }

      if (
        !signUpData.user ||
        (Array.isArray(signUpData.user.identities) &&
          signUpData.user.identities.length === 0)
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "An account or shop application already exists for this mobile number. Please sign in or contact ZUNO Support.",
          },
          { status: 409 }
        );
      }

      createdUserId = signUpData.user.id;
      hasSession = Boolean(signUpData.session);

      if (!hasSession) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Server registration service is not configured for instant onboarding. Please contact ZUNO Support.",
          },
          { status: 503 }
        );
      }
    }

    // Create shop application in PENDING state via secured atomic RPC
    // Uses server adminClient (service_role) or authenticated user session — never anon.
    const rpcClient = adminClient || supabase;
    const { data: rpcRes, error: rpcErr } = await (rpcClient as any).rpc(
      "register_shop_application",
      {
        p_owner_name: ownerFullName,
        p_phone: normalized.e164,
        p_shop_name: shopName,
        p_description: description || "Fresh local grocery & daily essentials",
        p_address_line: addressLine,
        p_locality: locality,
        p_pincode: pincode,
      }
    );

    if (rpcErr || !rpcRes?.success) {
      // Roll back newly provisioned Auth user only if we created it via adminClient in this request
      if (adminClient && createdUserId) {
        await adminClient.auth.admin.deleteUser(createdUserId).catch(() => {});
      }
      if (rpcErr && isNetworkOrUpstreamError(rpcErr)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unable to reach database service. Please check your internet connection and try again.",
            code: "network_error",
          },
          { status: 503 }
        );
      }
      const rpcMsgLower = (rpcErr?.message || "").toLowerCase();
      if (rpcErr?.code === "23505" || rpcMsgLower.includes("already exists")) {
        return NextResponse.json(
          {
            success: false,
            error:
              "A shop application already exists for this mobile number. Please sign in or contact ZUNO Support.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error:
            "Unable to complete shop application. Please verify your details or contact ZUNO Support.",
        },
        { status: 400 }
      );
    }

    // Establish an authenticated session for the newly registered user so /status
    // can inspect application state without unauthenticated phone enumeration.
    if (adminClient && !hasSession) {
      const { data: signInData, error: signInErr } =
        await supabase.auth.signInWithPassword({
          email: syntheticEmail,
          password,
        });
      if (!signInErr && signInData?.session) {
        hasSession = true;
      }
    }

    const requiresConfirmation = !serviceRoleKey && !hasSession;
    const response = NextResponse.json({
      success: true,
      shopId: rpcRes.shop_id,
      shopName,
      approvalStatus: "PENDING",
      isApproved: false,
      requiresConfirmation,
      redirect: "/status?registered=true",
    });

    if (hasSession) {
      applyCookies(response);
      clearObsoleteDevCookies(response);
    }

    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Unable to submit shop registration right now. Please try again.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed. Use POST to register." },
    { status: 405, headers: { Allow: "POST" } }
  );
}
