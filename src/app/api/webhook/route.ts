import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getOpenRouter, AI_MODEL } from "@/lib/openrouter";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { estimateQuotation, createCrmLead, updateLeadEstimate } from "@/lib/api";

const processedMsgIds = new Set<string>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "register_lead_and_get_quote",
      description: "Register the event enquiry as a CRM lead and calculate the quotation estimate range.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string", description: "Customer's full name" },
          mobile: { type: "string", description: "10-digit Indian mobile number" },
          email: { type: "string", description: "Customer's email address" },
          event_type: { type: "string", description: "Type of event (e.g. Wedding, Corporate Event, Birthday)" },
          event_date: { type: "string", description: "Event date in YYYY-MM-DD format" },
          location: { type: "string", description: "City or specific venue location" },
          guest_count: { type: "integer", description: "Positive number of expected guests" },
          requirements: {
            type: "array",
            items: { type: "string" },
            description: "Services requested (e.g., Decoration, Catering, Photography, Sound System)"
          },
          customer_budget: { type: "number", description: "Customer's budget for the event in INR" }
        },
        required: ["customer_name", "mobile", "email", "event_type", "event_date", "location", "guest_count", "requirements", "customer_budget"]
      }
    }
  }
];

// GET: Webhook verification by Meta
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// POST: Receive incoming WhatsApp messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ status: "ok" });
    }

    const msg = messages[0];
    if (msg.type !== "text") {
      return NextResponse.json({ status: "ok" });
    }

    const phone = msg.from;
    const text = msg.text.body as string;
    const whatsappMsgId = msg.id as string;
    const contactName = value?.contacts?.[0]?.profile?.name ?? null;

    // In-memory deduplication check (synchronous to prevent race conditions)
    if (processedMsgIds.has(whatsappMsgId)) {
      console.log(`Duplicate WhatsApp message ID skipped: ${whatsappMsgId}`);
      return NextResponse.json({ status: "ok" });
    }
    processedMsgIds.add(whatsappMsgId);

    // Keep cache bounded
    if (processedMsgIds.size > 1000) {
      const firstVal = processedMsgIds.values().next().value;
      if (firstVal) processedMsgIds.delete(firstVal);
    }

    // Run processing asynchronously in the background so we return 200 OK instantly to Meta
    processAsync(phone, text, whatsappMsgId, contactName).catch((err) => {
      console.error("Async webhook error:", err);
    });

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("Webhook route error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

async function processAsync(
  phone: string,
  text: string,
  whatsappMsgId: string,
  contactName: string | null
) {
  try {
    const supabase = getSupabaseAdmin();

    // 1. Get or create session
    let { data: session, error: sessErr } = await supabase
      .from("orange_sessions")
      .select("*")
      .eq("session_id", phone)
      .maybeSingle();

    if (sessErr) {
      console.error("Error fetching session:", sessErr);
      return;
    }

    if (!session) {
      const { data: newSess, error: createErr } = await supabase
        .from("orange_sessions")
        .insert({
          session_id: phone,
          status: "active",
          metadata: { customerName: contactName || "", processed_msg_ids: [] }
        })
        .select()
        .single();
      
      if (createErr || !newSess) {
        console.error("Error creating session:", createErr);
        return;
      }
      session = newSess;
    }

    // 2. Deduplication check using metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = (session.metadata as any) || {};
    const processedMsgIds = metadata.processed_msg_ids || [];
    if (processedMsgIds.includes(whatsappMsgId)) {
      console.log(`Duplicate WhatsApp message ID: ${whatsappMsgId}, skipping.`);
      return;
    }

    // 3. Store user message in DB
    const { error: msgErr } = await supabase
      .from("orange_messages")
      .insert({
        session_id: phone,
        sender: "user",
        content: text
      });

    if (msgErr) {
      console.error("Error inserting user message:", msgErr);
      return;
    }

    // 4. Update session metadata to include the new whatsappMsgId
    const updatedMsgIds = [...processedMsgIds, whatsappMsgId];
    await supabase
      .from("orange_sessions")
      .update({
        metadata: {
          ...metadata,
          processed_msg_ids: updatedMsgIds
        }
      })
      .eq("session_id", phone);

    // 5. Fetch last 20 messages for context (most recent first)
    const { data: history, error: historyErr } = await supabase
      .from("orange_messages")
      .select("sender, content")
      .eq("session_id", phone)
      .order("timestamp", { ascending: false })
      .limit(20);

    if (historyErr) {
      console.error("Error fetching history:", historyErr);
      return;
    }

    // Reverse history to restore chronological order (ascending)
    const chronologicalHistory = (history ?? []).reverse();

    const chatMessages = chronologicalHistory.map((m) => ({
      role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

    // 6. Call OpenAI with tools
    const openai = getOpenRouter();
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...chatMessages
      ],
      tools: TOOLS,
      tool_choice: "auto"
    });

    const choice = completion.choices[0];
    let aiText = "";

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolCall = choice.message.tool_calls[0] as any;
      const args = JSON.parse(toolCall.function.arguments);

      if (toolCall.function.name === "register_lead_and_get_quote") {
        try {
          // 1. Calculate price estimates via C# backend
          const quote = await estimateQuotation({
            customer_name: args.customer_name,
            mobile: args.mobile,
            email: args.email,
            event_type: args.event_type,
            event_date: args.event_date,
            location: args.location,
            guest_count: Number(args.guest_count),
            requirements: args.requirements
          });

           // 2. Create CRM lead
          const lead = await createCrmLead({
            customer_name: args.customer_name,
            mobile: args.mobile,
            email: args.email,
            event_type: args.event_type,
            event_date: args.event_date,
            location: args.location,
            guest_count: Number(args.guest_count),
            requirements: args.requirements,
            customer_budget: Number(args.customer_budget)
          });

          // 3. Update lead estimate in CRM
          await updateLeadEstimate({
            leadId: lead.leadId,
            estimatedQuoteRange: quote.estimatedRange
          });

          // 4. Save gathered details in session metadata
          const updatedSessionMetadata = {
            ...metadata,
            customerName: args.customer_name,
            mobile: args.mobile,
            email: args.email,
            eventType: args.event_type,
            eventDate: args.event_date,
            location: args.location,
            guestCount: Number(args.guest_count),
            requirements: args.requirements,
            customerBudget: Number(args.customer_budget),
            leadId: lead.leadId,
            estimatedRange: quote.estimatedRange,
            processed_msg_ids: updatedMsgIds
          };

          await supabase
            .from("orange_sessions")
            .update({ metadata: updatedSessionMetadata })
            .eq("session_id", phone);

          // 5. Construct AI reply
          aiText = `🎉 *Quotation Details for Orange Events* 🎉\n\n` +
                   `👤 *Client:* ${args.customer_name}\n` +
                   `📅 *Event Date:* ${args.event_date}\n` +
                   `📍 *Location:* ${args.location}\n` +
                   `👥 *Guests:* ${args.guest_count}\n` +
                   `💰 *Estimated Quote:* ${quote.estimatedRange}\n` +
                   `📋 *Lead ID:* ${lead.leadId}\n\n` +
                   `Our event executive will reach out to you shortly on ${args.mobile} or ${args.email} to discuss detailed planning. Thank you!`;

        } catch (err: any) {
          console.error("Error executing register_lead_and_get_quote:", err);
          aiText = `⚠️ We encountered an error while registering your quotation request. Please try again or contact support.`;
        }
      }
    } else {
      aiText = choice.message.content ?? "";
    }

    if (!aiText) return;

    // 7. Send message to WhatsApp
    await sendWhatsAppMessage(phone, aiText);

    // 8. Store bot response in DB
    await supabase
      .from("orange_messages")
      .insert({
        session_id: phone,
        sender: "bot",
        content: aiText
      });

  } catch (err) {
    console.error("processAsync error:", err);
  }
}
