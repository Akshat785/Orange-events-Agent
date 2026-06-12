import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // id is the session_id (phone number)
  const body = await req.json();
  const { mode } = body;

  if (mode !== "agent" && mode !== "human") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  // Get session first
  const db = getSupabaseAdmin();
  const { data: session, error: getErr } = await db
    .from("orange_sessions")
    .select("*")
    .eq("session_id", id)
    .maybeSingle();

  if (getErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadata = (session.metadata as any) || {};
  const updatedMetadata = {
    ...metadata,
    mode
  };

  const { data, error } = await db
    .from("orange_sessions")
    .update({ metadata: updatedMetadata })
    .eq("session_id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: data.session_id,
    phone: data.session_id,
    mode: updatedMetadata.mode,
    metadata: updatedMetadata
  });
}
