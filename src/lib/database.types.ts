export type Database = {
  public: {
    Tables: {
      orange_sessions: {
        Row: {
          session_id: string;
          created_at: string;
          status: "active" | "closed";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: any;
        };
        Insert: {
          session_id: string;
          created_at?: string;
          status?: "active" | "closed";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata?: any;
        };
        Update: {
          session_id?: string;
          created_at?: string;
          status?: "active" | "closed";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata?: any;
        };
        Relationships: [];
      };
      orange_messages: {
        Row: {
          id: string;
          session_id: string;
          sender: "user" | "bot";
          content: string;
          timestamp: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          sender: "user" | "bot";
          content: string;
          timestamp?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          sender?: "user" | "bot";
          content?: string;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orange_messages_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "orange_sessions";
            referencedColumns: ["session_id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
