export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      content_embeddings: {
        Row: {
          chunk_index: number;
          chunk_text: string;
          chunk_title: string | null;
          content_type: string;
          created_at: string;
          embedding: string | null;
          id: string;
          metadata: Json | null;
          source_id: string;
          updated_at: string;
        };
        Insert: {
          chunk_index?: number;
          chunk_text: string;
          chunk_title?: string | null;
          content_type: string;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          metadata?: Json | null;
          source_id: string;
          updated_at?: string;
        };
        Update: {
          chunk_index?: number;
          chunk_text?: string;
          chunk_title?: string | null;
          content_type?: string;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          metadata?: Json | null;
          source_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      newsletter_sends: {
        Row: {
          created_at: string;
          error_message: string | null;
          id: string;
          newsletter_id: string;
          recipient_email: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          newsletter_id: string;
          recipient_email: string;
          status: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          newsletter_id?: string;
          recipient_email?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "newsletter_sends_newsletter_id_fkey";
            columns: ["newsletter_id"];
            isOneToOne: false;
            referencedRelation: "newsletters";
            referencedColumns: ["id"];
          },
        ];
      };
      newsletters: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          excerpt: string | null;
          failed_count: number;
          id: string;
          post_url: string | null;
          scheduled_at: string | null;
          sent_at: string | null;
          sent_count: number;
          status: Database["public"]["Enums"]["newsletter_status"];
          subject: string;
          suppressed_count: number;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string | null;
          failed_count?: number;
          id?: string;
          post_url?: string | null;
          scheduled_at?: string | null;
          sent_at?: string | null;
          sent_count?: number;
          status?: Database["public"]["Enums"]["newsletter_status"];
          subject: string;
          suppressed_count?: number;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string | null;
          failed_count?: number;
          id?: string;
          post_url?: string | null;
          scheduled_at?: string | null;
          sent_at?: string | null;
          sent_count?: number;
          status?: Database["public"]["Enums"]["newsletter_status"];
          subject?: string;
          suppressed_count?: number;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      post_attachments: {
        Row: {
          created_at: string;
          file_name: string;
          file_size: number | null;
          id: string;
          mime_type: string | null;
          post_id: string;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          file_size?: number | null;
          id?: string;
          mime_type?: string | null;
          post_id: string;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          file_size?: number | null;
          id?: string;
          mime_type?: string | null;
          post_id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_attachments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          author_id: string | null;
          content: string;
          created_at: string;
          excerpt: string | null;
          id: string;
          published: boolean;
          published_at: string | null;
          slug: string;
          tiktok_url: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          author_id?: string | null;
          content?: string;
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          published?: boolean;
          published_at?: string | null;
          slug: string;
          tiktok_url?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string | null;
          content?: string;
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          published?: boolean;
          published_at?: string | null;
          slug?: string;
          tiktok_url?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      subscribers: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          last_sent_at: string | null;
          unsubscribed_at: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          last_sent_at?: string | null;
          unsubscribed_at?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          last_sent_at?: string | null;
          unsubscribed_at?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      match_content: {
        Args: {
          filter_content_type?: string;
          filter_topics?: string[];
          match_count?: number;
          match_threshold?: number;
          query_embedding: string;
        };
        Returns: {
          chunk_index: number;
          chunk_text: string;
          chunk_title: string;
          content_type: string;
          id: string;
          metadata: Json;
          similarity: number;
          source_id: string;
        }[];
      };
    };
    Enums: {
      app_role: "admin" | "user";
      newsletter_status: "draft" | "scheduled" | "sending" | "sent" | "failed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      newsletter_status: ["draft", "scheduled", "sending", "sent", "failed"],
    },
  },
} as const;
