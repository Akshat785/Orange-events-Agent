import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // id is the session_id (phone number)

  const { data, error } = await getSupabaseAdmin()
    .from("orange_messages")
    .select("*")
    .eq("session_id", id)
    .order("timestamp", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Map to dashboard-compatible Message type:
  const result = (data ?? []).map((m) => ({
    id: m.id,
    conversation_id: m.session_id,
    role: m.sender === "user" ? "user" : "assistant",
    content: m.content,
    created_at: m.timestamp,
  }));

  return NextResponse.json(result ?? []);
}
