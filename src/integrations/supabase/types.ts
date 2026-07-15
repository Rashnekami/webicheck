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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      checklist_document_snapshots: {
        Row: {
          checklist_id: string
          created_at: string
          created_by: string
          document_hash: string
          finalized_at: string
          id: string
          last_viewed_at: string | null
          public_status: string
          public_token: string
          replaced_by_snapshot_id: string | null
          revoked_at: string | null
          revoked_by: string | null
          snapshot_data: Json
          version: number
          view_count: number
        }
        Insert: {
          checklist_id: string
          created_at?: string
          created_by: string
          document_hash: string
          finalized_at: string
          id?: string
          last_viewed_at?: string | null
          public_status?: string
          public_token: string
          replaced_by_snapshot_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          snapshot_data: Json
          version?: number
          view_count?: number
        }
        Update: {
          checklist_id?: string
          created_at?: string
          created_by?: string
          document_hash?: string
          finalized_at?: string
          id?: string
          last_viewed_at?: string | null
          public_status?: string
          public_token?: string
          replaced_by_snapshot_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          snapshot_data?: Json
          version?: number
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_document_snapshots_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_document_snapshots_replaced_by_snapshot_id_fkey"
            columns: ["replaced_by_snapshot_id"]
            isOneToOne: false
            referencedRelation: "checklist_document_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_fotos: {
        Row: {
          categoria: Database["public"]["Enums"]["foto_categoria"]
          checklist_id: string
          created_at: string
          id: string
          legenda: string | null
          storage_path: string
          tecnico_id: string
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["foto_categoria"]
          checklist_id: string
          created_at?: string
          id?: string
          legenda?: string | null
          storage_path: string
          tecnico_id: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["foto_categoria"]
          checklist_id?: string
          created_at?: string
          id?: string
          legenda?: string | null
          storage_path?: string
          tecnico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_fotos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_public_access_logs: {
        Row: {
          accessed_at: string
          event_type: string
          id: string
          ip_hash: string | null
          referer_domain: string | null
          snapshot_id: string
          user_agent_summary: string | null
        }
        Insert: {
          accessed_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          referer_domain?: string | null
          snapshot_id: string
          user_agent_summary?: string | null
        }
        Update: {
          accessed_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          referer_domain?: string | null
          snapshot_id?: string
          user_agent_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_public_access_logs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "checklist_document_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          cidade: string | null
          cliente: string | null
          codigo_validacao: string | null
          created_at: string
          cto_porta: string | null
          dados: Json
          data_atendimento: string | null
          endereco: string | null
          finalizado_em: string | null
          hora_atendimento: string | null
          id: string
          modelo: string | null
          modelo_ont_instalada: string | null
          modelo_ont_retirada: string | null
          numero_publico: string | null
          os: string | null
          plano: string | null
          serial: string | null
          serial_ont_instalada: string | null
          serial_ont_retirada: string | null
          status: Database["public"]["Enums"]["checklist_status"]
          tecnico_id: string
          tipo: Database["public"]["Enums"]["checklist_tipo"]
          troca_realizada: boolean | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cliente?: string | null
          codigo_validacao?: string | null
          created_at?: string
          cto_porta?: string | null
          dados?: Json
          data_atendimento?: string | null
          endereco?: string | null
          finalizado_em?: string | null
          hora_atendimento?: string | null
          id?: string
          modelo?: string | null
          modelo_ont_instalada?: string | null
          modelo_ont_retirada?: string | null
          numero_publico?: string | null
          os?: string | null
          plano?: string | null
          serial?: string | null
          serial_ont_instalada?: string | null
          serial_ont_retirada?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          tecnico_id: string
          tipo?: Database["public"]["Enums"]["checklist_tipo"]
          troca_realizada?: boolean | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cliente?: string | null
          codigo_validacao?: string | null
          created_at?: string
          cto_porta?: string | null
          dados?: Json
          data_atendimento?: string | null
          endereco?: string | null
          finalizado_em?: string | null
          hora_atendimento?: string | null
          id?: string
          modelo?: string | null
          modelo_ont_instalada?: string | null
          modelo_ont_retirada?: string | null
          numero_publico?: string | null
          os?: string | null
          plano?: string | null
          serial?: string | null
          serial_ont_instalada?: string | null
          serial_ont_retirada?: string | null
          status?: Database["public"]["Enums"]["checklist_status"]
          tecnico_id?: string
          tipo?: Database["public"]["Enums"]["checklist_tipo"]
          troca_realizada?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          assinatura: string | null
          city: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          matricula: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          assinatura?: string | null
          city?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          matricula?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          assinatura?: string | null
          city?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          matricula?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "tecnico"
      checklist_status: "rascunho" | "finalizado"
      checklist_tipo: "validacao_ont" | "instalacao"
      foto_categoria:
        | "etiqueta"
        | "leds"
        | "fonte"
        | "teste_cabeado"
        | "teste_wifi"
        | "outro"
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
      app_role: ["admin", "tecnico"],
      checklist_status: ["rascunho", "finalizado"],
      checklist_tipo: ["validacao_ont", "instalacao"],
      foto_categoria: [
        "etiqueta",
        "leds",
        "fonte",
        "teste_cabeado",
        "teste_wifi",
        "outro",
      ],
    },
  },
} as const
