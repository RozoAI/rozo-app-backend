export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      currencies: {
        Row: {
          created_at: string
          currency_id: string
          display_name: string
          updated_at: string
          usd_price: number
        }
        Insert: {
          created_at?: string
          currency_id: string
          display_name: string
          updated_at?: string
          usd_price: number
        }
        Update: {
          created_at?: string
          currency_id?: string
          display_name?: string
          updated_at?: string
          usd_price?: number
        }
        Relationships: []
      }
      languages: {
        Row: {
          display_name: string
          language_id: string
        }
        Insert: {
          display_name: string
          language_id: string
        }
        Update: {
          display_name?: string
          language_id?: string
        }
        Relationships: []
      }
      merchants: {
        Row: {
          created_at: string
          default_currency: string
          default_language: string
          default_token_id: string
          description: string | null
          display_name: string | null
          dynamic_id: string
          email: string
          logo_url: string | null
          merchant_id: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          default_currency: string
          default_language: string
          default_token_id: string
          description?: string | null
          display_name?: string | null
          dynamic_id: string
          email: string
          logo_url?: string | null
          merchant_id?: string
          updated_at?: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          default_language?: string
          default_token_id?: string
          description?: string | null
          display_name?: string | null
          dynamic_id?: string
          email?: string
          logo_url?: string | null
          merchant_id?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchants_default_currency_fkey"
            columns: ["default_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["currency_id"]
          },
          {
            foreignKeyName: "merchants_default_language_fkey"
            columns: ["default_language"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["language_id"]
          },
          {
            foreignKeyName: "merchants_default_token_id_fkey"
            columns: ["default_token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["token_id"]
          },
        ]
      }
      orders: {
        Row: {
          callback_payload: Json | null
          created_at: string
          description: string | null
          display_amount: number
          display_currency: string
          merchant_address: string
          merchant_chain_id: string
          merchant_id: string
          number: string | null
          order_id: string
          payment_id: string
          required_amount_usd: number
          required_token: string
          source_chain_name: string | null
          source_token_address: string | null
          source_token_amount: number | null
          source_txn_hash: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string | null
        }
        Insert: {
          callback_payload?: Json | null
          created_at?: string
          description?: string | null
          display_amount: number
          display_currency: string
          merchant_address: string
          merchant_chain_id: string
          merchant_id: string
          number?: string | null
          order_id?: string
          payment_id: string
          required_amount_usd: number
          required_token: string
          source_chain_name?: string | null
          source_token_address?: string | null
          source_token_amount?: number | null
          source_txn_hash?: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at?: string | null
        }
        Update: {
          callback_payload?: Json | null
          created_at?: string
          description?: string | null
          display_amount?: number
          display_currency?: string
          merchant_address?: string
          merchant_chain_id?: string
          merchant_id?: string
          number?: string | null
          order_id?: string
          payment_id?: string
          required_amount_usd?: number
          required_token?: string
          source_chain_name?: string | null
          source_token_address?: string | null
          source_token_amount?: number | null
          source_txn_hash?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_display_currency_fkey"
            columns: ["display_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["currency_id"]
          },
        ]
      }
      tokens: {
        Row: {
          chain_id: string
          chain_name: string
          token_address: string
          token_id: string
          token_name: string
        }
        Insert: {
          chain_id: string
          chain_name: string
          token_address: string
          token_id: string
          token_name: string
        }
        Update: {
          chain_id?: string
          chain_name?: string
          token_address?: string
          token_id?: string
          token_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      payment_status:
        | "PENDING"
        | "PROCESSING"
        | "COMPLETED"
        | "FAILED"
        | "DISCREPANCY"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      payment_status: [
        "PENDING",
        "PROCESSING",
        "COMPLETED",
        "FAILED",
        "DISCREPANCY",
      ],
    },
  },
} as const
