import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // id is the session_id (phone number)
  const { message } = await req.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  // Send via WhatsApp
  const waResult = await sendWhatsAppMessage(id, message);
  if (waResult.error) {
    return NextResponse.json({ error: waResult.error.message }, { status: 500 });
  }

  // Store in DB
  const { data: msg, error: msgErr } = await getSupabaseAdmin()
    .from("orange_messages")
    .insert({
      session_id: id,
      sender: "bot",
      content: message,
    })
    .select()
    .single();

  if (msgErr || !msg) {
    return NextResponse.json({ error: msgErr?.message || "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({
    id: msg.id,
    conversation_id: msg.session_id,
    role: "assistant",
    content: msg.content,
    created_at: msg.timestamp,
  });
}
