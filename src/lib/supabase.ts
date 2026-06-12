import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let _admin: ReturnType<typeof createClient<Database>> | null = null;
let _anon: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAdmin() {
  if (!_admin) {
    _admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
        },
      }
    );
  }
  return _admin;
}

export function getSupabase() {
  if (!_anon) {
    _anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
        },
      }
    );
  }
  return _anon;
}

export type OrangeSession = {
  session_id: string;
  created_at: string;
  status: "active" | "closed";
  metadata: {
    customerName?: string;
    mobile?: string;
    email?: string;
    eventType?: string;
    eventDate?: string;
    location?: string;
    guestCount?: number;
    requirements?: string[];
    estimatedRange?: string;
    [key: string]: any;
  };
};

export type OrangeMessage = {
  id: string;
  session_id: string;
  sender: "user" | "bot";
  content: string;
  timestamp: string;
};
