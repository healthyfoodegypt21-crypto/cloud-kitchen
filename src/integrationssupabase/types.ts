export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          achieved_at: string
          badge: string
          id: string
          order_count: number
          period: string
          user_id: string
        }
        Insert: {
          achieved_at?: string
          badge: string
          id?: string
          order_count?: number
          period: string
          user_id: string
        }
        Update: {
          achieved_at?: string
          badge?: string
          id?: string
          order_count?: number
          period?: string
          user_id?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string
          address_apartment: string
          address_area: string
          address_floor: string
          address_house_number: string
          address_street: string
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string
          phone: string
          phone_secondary: string
          updated_at: string
        }
        Insert: {
          address?: string
          address_apartment?: string
          address_area?: string
          address_floor?: string
          address_house_number?: string
          address_street?: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string
          phone: string
          phone_secondary?: string
          updated_at?: string
        }
        Update: {
          address?: string
          address_apartment?: string
          address_area?: string
          address_floor?: string
          address_house_number?: string
          address_street?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string
          phone?: string
          phone_secondary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          brand_id: string
          calories: number
          carbs: number
          category: string
          created_at: string
          created_by: string | null
          fat: number
          id: string
          name: string
          price: number | null
          protein: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          calories?: number
          carbs?: number
          category: string
          created_at?: string
          created_by?: string | null
          fat?: number
          id?: string
          name: string
          price?: number | null
          protein?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          calories?: number
          carbs?: number
          category?: string
          created_at?: string
          created_by?: string | null
          fat?: number
          id?: string
          name?: string
          price?: number | null
          protein?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string
          address_apartment: string
          address_area: string
          address_floor: string
          address_house_number: string
          address_street: string
          brand_id: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          execution_date: string
          id: string
          meal_type: string
          notes: string | null
          order_mode: string
          order_number: string
          package: string
          package_plan_id: string | null
          phone: string
          phone_secondary: string
          price: number
          selected_meal_ids: string[]
          source: Database["public"]["Enums"]["order_source"]
          status: string
          updated_at: string
        }
        Insert: {
          address: string
          address_apartment?: string
          address_area?: string
          address_floor?: string
          address_house_number?: string
          address_street?: string
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          execution_date?: string
          id?: string
          meal_type?: string
          notes?: string | null
          order_mode?: string
          order_number: string
          package: string
          package_plan_id?: string | null
          phone: string
          phone_secondary?: string
          price?: number
          selected_meal_ids?: string[]
          source?: Database["public"]["Enums"]["order_source"]
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          address_apartment?: string
          address_area?: string
          address_floor?: string
          address_house_number?: string
          address_street?: string
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          execution_date?: string
          id?: string
          meal_type?: string
          notes?: string | null
          order_mode?: string
          order_number?: string
          package?: string
          package_plan_id?: string | null
          phone?: string
          phone_secondary?: string
          price?: number
          selected_meal_ids?: string[]
          source?: Database["public"]["Enums"]["order_source"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_package_plan_id_fkey"
            columns: ["package_plan_id"]
            isOneToOne: false
            referencedRelation: "package_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      package_plan_items: {
        Row: {
          created_at: string
          custom_meal_name: string | null
          display_order: number
          id: string
          menu_item_id: string | null
          package_plan_id: string
        }
        Insert: {
          created_at?: string
          custom_meal_name?: string | null
          display_order?: number
          id?: string
          menu_item_id?: string | null
          package_plan_id: string
        }
        Update: {
          created_at?: string
          custom_meal_name?: string | null
          display_order?: number
          id?: string
          menu_item_id?: string | null
          package_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_plan_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_plan_items_package_plan_id_fkey"
            columns: ["package_plan_id"]
            isOneToOne: false
            referencedRelation: "package_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      package_plans: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          days_count: number
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          days_count: number
          id?: string
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          days_count?: number
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_plans_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      targets: {
        Row: {
          brand_id: string | null
          created_at: string
          id: string
          type: string
          updated_at: string
          value: number
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          id?: string
          type: string
          updated_at?: string
          value: number
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          id?: string
          type?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "targets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      user_brand_access: {
        Row: {
          brand_id: string
          id: string
          user_id: string
        }
        Insert: {
          brand_id: string
          id?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_brand_access_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      user_page_permissions: {
        Row: {
          id: string
          page: string
          user_id: string
        }
        Insert: {
          id?: string
          page: string
          user_id: string
        }
        Update: {
          id?: string
          page?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "call_center" | "kitchen" | "delivery"
      order_source: "facebook" | "instagram" | "website" | "referral" | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "call_center", "kitchen", "delivery"],
      order_source: ["facebook", "instagram", "website", "referral", "other"],
    },
  },
} as const
