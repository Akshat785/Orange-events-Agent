"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";

type Conversation = {
  id: string;
  phone: string;
  name: string | null;
  mode: "agent" | "human";
  updated_at: string;
  created_at: string;
};

type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type ConversationWithLast = Conversation & {
  last_message: { content: string; role: string } | null;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const [conversations, setConversations] = useState<ConversationWithLast[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data);
    }
  }, []);

  const fetchMessages = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedId) return;
    fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fallback Polling: Fetch data every 5 seconds to guarantee dashboard updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      if (selectedId) {
        fetchMessages(selectedId);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedId, fetchConversations, fetchMessages]);

  // Realtime: new messages (table: orange_messages)
  useEffect(() => {
    const channel = getSupabase()
      .channel("orange-messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orange_messages" },
        (payload) => {
          const newMsgRaw = payload.new as {
            id: string;
            session_id: string;
            sender: "user" | "bot";
            content: string;
            timestamp: string;
          };

          // Map to Message type compatible with Dashboard state
          const newMsg: Message = {
            id: newMsgRaw.id,
            conversation_id: newMsgRaw.session_id,
            role: newMsgRaw.sender === "user" ? "user" : "assistant",
            content: newMsgRaw.content,
            created_at: newMsgRaw.timestamp,
          };

          if (newMsg.conversation_id === selectedId) {
            setMessages((prev) => {
              // Avoid duplicates if polling fetched it already
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          // Refresh sidebar conversation list
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [selectedId, fetchConversations]);

  // Realtime: conversation mode changes (table: orange_sessions)
  useEffect(() => {
    const channel = getSupabase()
      .channel("orange-sessions-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orange_sessions" },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      getSupabase().removeChannel(channel);
    };
  }, [fetchConversations]);

  async function toggleMode() {
    if (!selectedConv) return;
    const newMode = selectedConv.mode === "agent" ? "human" : "agent";
    await fetch(`/api/conversations/${selectedConv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedConv.id ? { ...c, mode: newMode } : c))
    );
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    
    // Optimistic message update to feel lightning fast
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedId,
      role: "assistant",
      content: text,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    await fetch(`/api/conversations/${selectedId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    setSending(false);
    fetchMessages(selectedId);
  }

  return (
    <div className="flex h-screen bg-[#090D1A] text-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 bg-[#12192C] border-r border-slate-800/80 flex flex-col shadow-2xl">
        <div className="px-5 py-5 border-b border-slate-800/80 bg-[#12192C]">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
            <h1 className="text-lg font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
              Orange Events Portal
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">Live WhatsApp Event Bookings</p>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/30">
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500">
              <span className="text-sm">No chats found yet</span>
            </div>
          )}
          {conversations.map((conv) => {
            const isSelected = selectedId === conv.id;
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`w-full text-left px-5 py-4 transition-all duration-200 border-l-4 ${
                  isSelected
                    ? "bg-slate-800/30 border-l-orange-500 shadow-inner"
                    : "border-l-transparent hover:bg-slate-800/10"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold text-sm truncate ${isSelected ? "text-orange-400" : "text-slate-200"}`}>
                    {conv.name ?? conv.phone}
                  </span>
                  <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                    {formatTime(conv.updated_at)}
                  </span>
                </div>
                {conv.name && (
                  <p className="text-xs text-slate-400 font-mono tracking-tight">{conv.phone}</p>
                )}
                {conv.last_message && (
                  <p className="text-xs text-slate-400 mt-1.5 truncate max-w-[240px]">
                    <span className="text-slate-500">
                      {conv.last_message.role === "assistant" ? "You: " : ""}
                    </span>
                    {conv.last_message.content}
                  </p>
                )}
                <div className="flex items-center justify-between mt-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      conv.mode === "agent"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${conv.mode === "agent" ? "bg-emerald-400" : "bg-amber-400"}`} />
                    {conv.mode === "agent" ? "AI Agent" : "Human mode"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Chat panel */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#090D1A]">
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-3">
            <svg className="w-12 h-12 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm font-medium">Select a conversation to view messages</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-[#12192C] border-b border-slate-800/80 px-6 py-4 flex items-center justify-between shadow-md">
              <div>
                <h2 className="font-bold text-slate-100 text-base">
                  {selectedConv.name ?? selectedConv.phone}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{selectedConv.phone}</p>
              </div>
              <button
                onClick={toggleMode}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-sm border ${
                  selectedConv.mode === "agent"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${selectedConv.mode === "agent" ? "bg-emerald-400" : "bg-amber-400"}`} />
                {selectedConv.mode === "agent" ? "AI Agent Running" : "Human Answering"} — Switch
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-[#090D1A]">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                  <p className="text-sm">No messages in this chat yet</p>
                </div>
              )}
              {messages.map((msg) => {
                const isAssistant = msg.role === "assistant";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isAssistant ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm shadow-md transition-all duration-150 ${
                        isAssistant
                          ? "bg-gradient-to-r from-orange-600 to-amber-600 text-slate-50 rounded-br-sm"
                          : "bg-[#12192C] text-slate-100 border border-slate-800/80 rounded-bl-sm"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                      <div
                        className={`text-[10px] mt-1.5 font-medium flex items-center justify-end gap-1 ${
                          isAssistant ? "text-orange-200" : "text-slate-500"
                        }`}
                      >
                        <span>{isAssistant ? "Agent" : "User"}</span>
                        <span>•</span>
                        <span>{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={sendMessage}
              className="bg-[#12192C] border-t border-slate-800/80 px-6 py-4 flex gap-3 items-end shadow-2xl"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e as unknown as React.FormEvent);
                  }
                }}
                placeholder={
                  selectedConv.mode === "human"
                    ? "Type a message to reply on WhatsApp..."
                    : "Type a message to override / assist..."
                }
                rows={1}
                className="flex-1 resize-none rounded-xl bg-[#090D1A] border border-slate-800 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-slate-500 transition-all duration-200"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 disabled:from-slate-800 disabled:to-slate-800 text-white disabled:text-slate-500 px-5 py-3 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 shadow-lg"
              >
                {sending ? "..." : "Send"}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
