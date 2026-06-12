import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const db = getSupabaseAdmin();

  // Fetch orange_sessions
  const { data: sessions, error: sessErr } = await db
    .from("orange_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  if (!sessions || sessions.length === 0) {
    return NextResponse.json([]);
  }

  const ids = sessions.map((s) => s.session_id);
  const { data: msgs } = await db
    .from("orange_messages")
    .select("session_id, content, sender, timestamp")
    .in("session_id", ids)
    .order("timestamp", { ascending: false });

  const lastMsgMap: Record<string, { content: string; role: "user" | "assistant" }> = {};
  for (const m of msgs ?? []) {
    if (!lastMsgMap[m.session_id]) {
      lastMsgMap[m.session_id] = { 
        content: m.content, 
        role: m.sender === "user" ? "user" : "assistant" 
      };
    }
  }

  const result = sessions.map((sess) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = (sess.metadata as any) || {};
    return {
      id: sess.session_id, // map session_id as id for frontend compatibility
      phone: sess.session_id,
      name: metadata.customerName || null,
      mode: metadata.mode || "agent",
      updated_at: sess.created_at, // fallback to created_at
      created_at: sess.created_at,
      last_message: lastMsgMap[sess.session_id] ?? null,
    };
  });

  return NextResponse.json(result);
}
