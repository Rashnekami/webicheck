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
      agent_authorization_requests: {
        Row: {
          agent_version: string | null
          approved_at: string | null
          approved_by: string | null
          consumed_at: string | null
          created_at: string
          device_code_hash: string
          device_id: string | null
          device_name: string
          expires_at: string
          fingerprint_hash: string
          id: string
          platform: string | null
          provider_id: string
          status: string
          user_code: string
        }
        Insert: {
          agent_version?: string | null
          approved_at?: string | null
          approved_by?: string | null
          consumed_at?: string | null
          created_at?: string
          device_code_hash: string
          device_id?: string | null
          device_name: string
          expires_at: string
          fingerprint_hash: string
          id?: string
          platform?: string | null
          provider_id: string
          status?: string
          user_code: string
        }
        Update: {
          agent_version?: string | null
          approved_at?: string | null
          approved_by?: string | null
          consumed_at?: string | null
          created_at?: string
          device_code_hash?: string
          device_id?: string | null
          device_name?: string
          expires_at?: string
          fingerprint_hash?: string
          id?: string
          platform?: string | null
          provider_id?: string
          status?: string
          user_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_authorization_requests_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "agent_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_authorization_requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_devices: {
        Row: {
          agent_version: string | null
          created_at: string
          fingerprint_hash: string
          id: string
          last_seen_at: string | null
          name: string
          platform: string | null
          provider_id: string
          revoked_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          agent_version?: string | null
          created_at?: string
          fingerprint_hash: string
          id?: string
          last_seen_at?: string | null
          name: string
          platform?: string | null
          provider_id: string
          revoked_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          agent_version?: string | null
          created_at?: string
          fingerprint_hash?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          platform?: string | null
          provider_id?: string
          revoked_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_devices_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          message: string
          provider_id: string
          severity: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          message: string
          provider_id: string
          severity?: string
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          message?: string
          provider_id?: string
          severity?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_diagnostic_reports: {
        Row: {
          agent_version: string | null
          case_id: string
          checklist_id: string
          created_at: string
          diagnostic_session_id: string
          generated_at: string | null
          id: string
          metadata: Json
          mime_type: string
          original_filename: string
          report_sequence: number
          revoked_at: string | null
          revoked_by: string | null
          sha256: string
          size_bytes: number
          status: string
          storage_path: string
          supersedes_report_id: string | null
          test_stage: string
          uploaded_by: string
        }
        Insert: {
          agent_version?: string | null
          case_id: string
          checklist_id: string
          created_at?: string
          diagnostic_session_id: string
          generated_at?: string | null
          id?: string
          metadata?: Json
          mime_type: string
          original_filename: string
          report_sequence?: number
          revoked_at?: string | null
          revoked_by?: string | null
          sha256: string
          size_bytes: number
          status?: string
          storage_path: string
          supersedes_report_id?: string | null
          test_stage: string
          uploaded_by: string
        }
        Update: {
          agent_version?: string | null
          case_id?: string
          checklist_id?: string
          created_at?: string
          diagnostic_session_id?: string
          generated_at?: string | null
          id?: string
          metadata?: Json
          mime_type?: string
          original_filename?: string
          report_sequence?: number
          revoked_at?: string | null
          revoked_by?: string | null
          sha256?: string
          size_bytes?: number
          status?: string
          storage_path?: string
          supersedes_report_id?: string | null
          test_stage?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_diagnostic_reports_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_diagnostic_reports_supersedes_report_id_fkey"
            columns: ["supersedes_report_id"]
            isOneToOne: false
            referencedRelation: "checklist_diagnostic_reports"
            referencedColumns: ["id"]
          },
        ]
      }
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
          case_id: string
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
          is_current: boolean
          modelo: string | null
          modelo_ont_instalada: string | null
          modelo_ont_retirada: string | null
          numero_publico: string | null
          os: string | null
          parent_checklist_id: string | null
          plano: string | null
          provider_id: string
          revised_at: string | null
          revised_by: string | null
          revision_notes: string | null
          revision_number: number
          revision_reason: string | null
          serial: string | null
          serial_ont_instalada: string | null
          serial_ont_retirada: string | null
          service_stage: string
          status: Database["public"]["Enums"]["checklist_status"]
          superseded_by_checklist_id: string | null
          tecnico_id: string
          tipo: Database["public"]["Enums"]["checklist_tipo"]
          troca_realizada: boolean | null
          updated_at: string
        }
        Insert: {
          case_id?: string
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
          is_current?: boolean
          modelo?: string | null
          modelo_ont_instalada?: string | null
          modelo_ont_retirada?: string | null
          numero_publico?: string | null
          os?: string | null
          parent_checklist_id?: string | null
          plano?: string | null
          provider_id: string
          revised_at?: string | null
          revised_by?: string | null
          revision_notes?: string | null
          revision_number?: number
          revision_reason?: string | null
          serial?: string | null
          serial_ont_instalada?: string | null
          serial_ont_retirada?: string | null
          service_stage?: string
          status?: Database["public"]["Enums"]["checklist_status"]
          superseded_by_checklist_id?: string | null
          tecnico_id: string
          tipo?: Database["public"]["Enums"]["checklist_tipo"]
          troca_realizada?: boolean | null
          updated_at?: string
        }
        Update: {
          case_id?: string
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
          is_current?: boolean
          modelo?: string | null
          modelo_ont_instalada?: string | null
          modelo_ont_retirada?: string | null
          numero_publico?: string | null
          os?: string | null
          parent_checklist_id?: string | null
          plano?: string | null
          provider_id?: string
          revised_at?: string | null
          revised_by?: string | null
          revision_notes?: string | null
          revision_number?: number
          revision_reason?: string | null
          serial?: string | null
          serial_ont_instalada?: string | null
          serial_ont_retirada?: string | null
          service_stage?: string
          status?: Database["public"]["Enums"]["checklist_status"]
          superseded_by_checklist_id?: string | null
          tecnico_id?: string
          tipo?: Database["public"]["Enums"]["checklist_tipo"]
          troca_realizada?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_parent_checklist_id_fkey"
            columns: ["parent_checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_superseded_by_checklist_id_fkey"
            columns: ["superseded_by_checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
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
          platform_admin: boolean
          provider_id: string
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
          platform_admin?: boolean
          provider_id: string
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
          platform_admin?: boolean
          provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_cities: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          normalized_name: string
          provider_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          normalized_name: string
          provider_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string
          provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_cities_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          slug?: string
          status?: string
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
      webi_api_rate_limits: {
        Row: {
          action: string
          request_count: number
          token_id: string
          window_started_at: string
        }
        Insert: {
          action: string
          request_count?: number
          token_id: string
          window_started_at: string
        }
        Update: {
          action?: string
          request_count?: number
          token_id?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webi_api_rate_limits_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "webi_integration_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      webi_integration_tokens: {
        Row: {
          active: boolean
          created_at: string
          device_id: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          provider_id: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          device_id?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          provider_id: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          device_id?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          provider_id?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webi_integration_tokens_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "agent_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webi_integration_tokens_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_agent_authorization: {
        Args: {
          _device_code_hash: string
          _token_hash: string
          _token_prefix: string
        }
        Returns: {
          token_id: string
        }[]
      }
      consume_webi_rate_limit: {
        Args: {
          _action: string
          _limit?: number
          _token_id: string
          _window_seconds?: number
        }
        Returns: boolean
      }
      create_checklist_revision: {
        Args: {
          _notes?: string
          _parent_id: string
          _reason: string
          _stage: string
        }
        Returns: {
          id: string
          revision_number: number
        }[]
      }
      create_snapshot_version: {
        Args: {
          _checklist_id: string
          _created_by: string
          _document_hash: string
          _finalized_at: string
          _public_token: string
          _snapshot_data: Json
        }
        Returns: {
          id: string
          version: number
        }[]
      }
      current_provider_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      link_diagnostic_report: {
        Args: {
          _agent_version: string | null
          _case_id: string
          _checklist_id: string
          _diagnostic_session_id: string
          _generated_at: string | null
          _id: string
          _metadata?: Json
          _original_filename: string
          _sha256: string
          _size_bytes: number
          _storage_path: string
          _test_stage: string
          _uploaded_by: string
        }
        Returns: {
          created_at: string
          id: string
          report_sequence: number
        }[]
      }
      provider_is_active: { Args: { _provider_id: string }; Returns: boolean }
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
