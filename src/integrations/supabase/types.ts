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
      access_logs: {
        Row: {
          created_at: string
          geo_city: string | null
          geo_country: string | null
          geo_region: string | null
          id: string
          ip: string | null
          method: string
          provider_id: string | null
          route: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip?: string | null
          method: string
          provider_id?: string | null
          route: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip?: string | null
          method?: string
          provider_id?: string | null
          route?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_logs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
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
      checklist_ai_analyses: {
        Row: {
          analyzed_at: string | null
          batch_id: string | null
          checklist_id: string
          checklist_tipo: string
          competence: string
          confidence: string | null
          content_hash: string
          created_at: string
          created_by: string | null
          employee_id: string
          error_message: string | null
          id: string
          is_current: boolean
          model: string | null
          provider_id: string
          raw_response: Json | null
          revision_number: number
          rubric_version: string
          status: string
          updated_at: string
        }
        Insert: {
          analyzed_at?: string | null
          batch_id?: string | null
          checklist_id: string
          checklist_tipo: string
          competence: string
          confidence?: string | null
          content_hash: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          error_message?: string | null
          id?: string
          is_current?: boolean
          model?: string | null
          provider_id: string
          raw_response?: Json | null
          revision_number?: number
          rubric_version: string
          status?: string
          updated_at?: string
        }
        Update: {
          analyzed_at?: string | null
          batch_id?: string | null
          checklist_id?: string
          checklist_tipo?: string
          competence?: string
          confidence?: string | null
          content_hash?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          error_message?: string | null
          id?: string
          is_current?: boolean
          model?: string | null
          provider_id?: string
          raw_response?: Json | null
          revision_number?: number
          rubric_version?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_ai_analyses_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_ai_analyses_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_ai_findings: {
        Row: {
          analysis_id: string
          category: string
          confidence: string
          created_at: string
          description: string
          id: string
          kind: string
          origin: string
          reclassified_kind: string | null
          refs: Json
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          supervisor_note: string | null
        }
        Insert: {
          analysis_id: string
          category: string
          confidence?: string
          created_at?: string
          description: string
          id?: string
          kind: string
          origin?: string
          reclassified_kind?: string | null
          refs?: Json
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          supervisor_note?: string | null
        }
        Update: {
          analysis_id?: string
          category?: string
          confidence?: string
          created_at?: string
          description?: string
          id?: string
          kind?: string
          origin?: string
          reclassified_kind?: string | null
          refs?: Json
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          supervisor_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_ai_findings_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "checklist_ai_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_audit_batches: {
        Row: {
          created_at: string
          employee_id: string | null
          failed: number
          filters: Json
          finished_at: string | null
          id: string
          last_error: string | null
          processed: number
          provider_id: string
          skipped_duplicate: number
          started_by: string
          status: string
          total_checklists: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          failed?: number
          filters?: Json
          finished_at?: string | null
          id?: string
          last_error?: string | null
          processed?: number
          provider_id: string
          skipped_duplicate?: number
          started_by: string
          status?: string
          total_checklists?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          failed?: number
          filters?: Json
          finished_at?: string | null
          id?: string
          last_error?: string | null
          processed?: number
          provider_id?: string
          skipped_duplicate?: number
          started_by?: string
          status?: string
          total_checklists?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_audit_batches_provider_id_fkey"
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
          exchange_ticket_code: string | null
          finalizado_em: string | null
          hora_atendimento: string | null
          id: string
          intervention_code: string | null
          is_current: boolean
          locked_for_rework: boolean
          modelo: string | null
          modelo_ont_instalada: string | null
          modelo_ont_retirada: string | null
          numero_publico: string | null
          os: string | null
          parent_checklist_id: string | null
          plano: string | null
          provider_id: string
          review_comment: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revised_at: string | null
          revised_by: string | null
          revision_notes: string | null
          revision_number: number
          revision_reason: string | null
          rmap_code: string | null
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
          exchange_ticket_code?: string | null
          finalizado_em?: string | null
          hora_atendimento?: string | null
          id?: string
          intervention_code?: string | null
          is_current?: boolean
          locked_for_rework?: boolean
          modelo?: string | null
          modelo_ont_instalada?: string | null
          modelo_ont_retirada?: string | null
          numero_publico?: string | null
          os?: string | null
          parent_checklist_id?: string | null
          plano?: string | null
          provider_id: string
          review_comment?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revised_at?: string | null
          revised_by?: string | null
          revision_notes?: string | null
          revision_number?: number
          revision_reason?: string | null
          rmap_code?: string | null
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
          exchange_ticket_code?: string | null
          finalizado_em?: string | null
          hora_atendimento?: string | null
          id?: string
          intervention_code?: string | null
          is_current?: boolean
          locked_for_rework?: boolean
          modelo?: string | null
          modelo_ont_instalada?: string | null
          modelo_ont_retirada?: string | null
          numero_publico?: string | null
          os?: string | null
          parent_checklist_id?: string | null
          plano?: string | null
          provider_id?: string
          review_comment?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revised_at?: string | null
          revised_by?: string | null
          revision_notes?: string | null
          revision_number?: number
          revision_reason?: string | null
          rmap_code?: string | null
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
      city_access_exceptions: {
        Row: {
          checklist_id: string | null
          city: string
          city_key: string | null
          created_at: string
          expires_at: string | null
          granted_by: string
          id: string
          os: string
          provider_id: string
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          technician_id: string
        }
        Insert: {
          checklist_id?: string | null
          city: string
          city_key?: string | null
          created_at?: string
          expires_at?: string | null
          granted_by: string
          id?: string
          os: string
          provider_id: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          technician_id: string
        }
        Update: {
          checklist_id?: string | null
          city?: string
          city_key?: string | null
          created_at?: string
          expires_at?: string | null
          granted_by?: string
          id?: string
          os?: string
          provider_id?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          technician_id?: string
        }
        Relationships: []
      }
      city_territories: {
        Row: {
          city_key: string
          city_label: string
          created_at: string
          territory_code: string
          territory_name: string
        }
        Insert: {
          city_key: string
          city_label: string
          created_at?: string
          territory_code: string
          territory_name: string
        }
        Update: {
          city_key?: string
          city_label?: string
          created_at?: string
          territory_code?: string
          territory_name?: string
        }
        Relationships: []
      }
      cto_reference_points: {
        Row: {
          cidade: string
          id: string
          lat: number | null
          lng: number | null
          nome: string
          nome_normalizado: string
          provider_id: string
          snapshot_id: string
        }
        Insert: {
          cidade: string
          id?: string
          lat?: number | null
          lng?: number | null
          nome: string
          nome_normalizado: string
          provider_id: string
          snapshot_id: string
        }
        Update: {
          cidade?: string
          id?: string
          lat?: number | null
          lng?: number | null
          nome?: string
          nome_normalizado?: string
          provider_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cto_reference_points_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cto_reference_points_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "cto_reference_latest"
            referencedColumns: ["snapshot_id"]
          },
          {
            foreignKeyName: "cto_reference_points_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "cto_reference_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      cto_reference_snapshots: {
        Row: {
          cidade: string
          created_at: string
          filename: string | null
          id: string
          imported_by: string | null
          provider_id: string
          total_ctos: number
        }
        Insert: {
          cidade: string
          created_at?: string
          filename?: string | null
          id?: string
          imported_by?: string | null
          provider_id: string
          total_ctos?: number
        }
        Update: {
          cidade?: string
          created_at?: string
          filename?: string | null
          id?: string
          imported_by?: string | null
          provider_id?: string
          total_ctos?: number
        }
        Relationships: [
          {
            foreignKeyName: "cto_reference_snapshots_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_counterproof_events: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          counterproof_id: string
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          actor_type: string
          actor_user_id?: string | null
          counterproof_id: string
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          counterproof_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_counterproof_events_counterproof_id_fkey"
            columns: ["counterproof_id"]
            isOneToOne: false
            referencedRelation: "customer_counterproofs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_counterproofs: {
        Row: {
          annulled_at: string | null
          annulled_by: string | null
          annulment_reason: string | null
          case_id: string
          checklist_code: string
          checklist_id: string
          client_checklist: Json | null
          client_checklist_version: string | null
          client_name: string | null
          client_phone_e164: string | null
          code: string
          created_at: string
          created_by: string
          first_opened_at: string | null
          id: string
          identity_sha256: string | null
          identity_storage_path: string | null
          provider_id: string
          public_token: string
          service_order: string | null
          signature_data_url: string | null
          status: string
          tecnico_id: string
          terms_version: string | null
          updated_at: string
          validated_at: string | null
          validated_ip: string | null
          validated_user_agent: string | null
        }
        Insert: {
          annulled_at?: string | null
          annulled_by?: string | null
          annulment_reason?: string | null
          case_id: string
          checklist_code: string
          checklist_id: string
          client_checklist?: Json | null
          client_checklist_version?: string | null
          client_name?: string | null
          client_phone_e164?: string | null
          code: string
          created_at?: string
          created_by: string
          first_opened_at?: string | null
          id?: string
          identity_sha256?: string | null
          identity_storage_path?: string | null
          provider_id: string
          public_token: string
          service_order?: string | null
          signature_data_url?: string | null
          status?: string
          tecnico_id: string
          terms_version?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_ip?: string | null
          validated_user_agent?: string | null
        }
        Update: {
          annulled_at?: string | null
          annulled_by?: string | null
          annulment_reason?: string | null
          case_id?: string
          checklist_code?: string
          checklist_id?: string
          client_checklist?: Json | null
          client_checklist_version?: string | null
          client_name?: string | null
          client_phone_e164?: string | null
          code?: string
          created_at?: string
          created_by?: string
          first_opened_at?: string | null
          id?: string
          identity_sha256?: string | null
          identity_storage_path?: string | null
          provider_id?: string
          public_token?: string
          service_order?: string | null
          signature_data_url?: string | null
          status?: string
          tecnico_id?: string
          terms_version?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_ip?: string | null
          validated_user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_counterproofs_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_counterproofs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_code_counters: {
        Row: {
          code_year: number
          last_value: number
          provider_id: string
          tipo: string
        }
        Insert: {
          code_year: number
          last_value?: number
          provider_id: string
          tipo: string
        }
        Update: {
          code_year?: number
          last_value?: number
          provider_id?: string
          tipo?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          created_at: string
          geo_city: string | null
          geo_country: string | null
          geo_region: string | null
          id: string
          ip: string | null
          login: string
          provider_id: string | null
          reason: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip?: string | null
          login: string
          provider_id?: string | null
          reason?: string | null
          success: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip?: string | null
          login?: string
          provider_id?: string | null
          reason?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_attempts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ont_exchange_ticket_counters: {
        Row: {
          last_value: number
          provider_id: string
          ticket_year: number
        }
        Insert: {
          last_value?: number
          provider_id: string
          ticket_year: number
        }
        Update: {
          last_value?: number
          provider_id?: string
          ticket_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "ont_exchange_ticket_counters_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ont_exchange_tickets: {
        Row: {
          case_id: string
          checklist_id: string | null
          city: string | null
          client_name: string | null
          exchanged_at: string
          id: string
          installed_model: string | null
          installed_serial: string | null
          provider_id: string
          reason: string
          removed_model: string | null
          removed_serial: string | null
          revision_number: number
          service_order: string | null
          technician_id: string | null
          technician_name: string | null
          ticket_code: string
          updated_at: string
        }
        Insert: {
          case_id: string
          checklist_id?: string | null
          city?: string | null
          client_name?: string | null
          exchanged_at?: string
          id?: string
          installed_model?: string | null
          installed_serial?: string | null
          provider_id: string
          reason?: string
          removed_model?: string | null
          removed_serial?: string | null
          revision_number?: number
          service_order?: string | null
          technician_id?: string | null
          technician_name?: string | null
          ticket_code: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          checklist_id?: string | null
          city?: string | null
          client_name?: string | null
          exchanged_at?: string
          id?: string
          installed_model?: string | null
          installed_serial?: string | null
          provider_id?: string
          reason?: string
          removed_model?: string | null
          removed_serial?: string | null
          revision_number?: number
          service_order?: string | null
          technician_id?: string | null
          technician_name?: string | null
          ticket_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ont_exchange_tickets_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ont_exchange_tickets_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          assinatura: string | null
          cities_configured_at: string | null
          city: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          matricula: string | null
          must_change_password: boolean
          phone: string | null
          platform_admin: boolean
          provider_id: string
          supervisor_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          assinatura?: string | null
          cities_configured_at?: string | null
          city?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          matricula?: string | null
          must_change_password?: boolean
          phone?: string | null
          platform_admin?: boolean
          provider_id: string
          supervisor_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          assinatura?: string | null
          cities_configured_at?: string | null
          city?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          matricula?: string | null
          must_change_password?: boolean
          phone?: string | null
          platform_admin?: boolean
          provider_id?: string
          supervisor_id?: string | null
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
      provider_checklist_counters: {
        Row: {
          last_number: number
          provider_id: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          provider_id: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_checklist_counters_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
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
      provider_login_accounts: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          login: string
          password_hash: string
          provider_id: string
          supabase_email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          login: string
          password_hash: string
          provider_id: string
          supabase_email: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          login?: string
          password_hash?: string
          provider_id?: string
          supabase_email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_login_accounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          accent_color: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          pdf_template: string
          primary_color: string | null
          public_code_prefix: string | null
          slug: string
          status: string
          updated_at: string
          validation_code_prefix: string | null
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          pdf_template?: string
          primary_color?: string | null
          public_code_prefix?: string | null
          slug: string
          status?: string
          updated_at?: string
          validation_code_prefix?: string | null
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          pdf_template?: string
          primary_color?: string | null
          public_code_prefix?: string | null
          slug?: string
          status?: string
          updated_at?: string
          validation_code_prefix?: string | null
        }
        Relationships: []
      }
      supervisor_cities: {
        Row: {
          city: string
          created_at: string
          id: string
          provider_id: string
          supervisor_id: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          provider_id: string
          supervisor_id: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          provider_id?: string
          supervisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_cities_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_employee_notes: {
        Row: {
          ai_analyzed_at: string | null
          ai_professional_text: string | null
          ai_suggested_category: string | null
          ai_suggested_competencies: Json
          ai_suggested_type: string | null
          author_user_id: string
          category: string | null
          checklist_id: string | null
          competence: string
          created_at: string
          employee_id: string
          id: string
          linked_review_id: string | null
          note_text: string
          note_type: string
          occurred_at: string
          provider_id: string
          service_order: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_analyzed_at?: string | null
          ai_professional_text?: string | null
          ai_suggested_category?: string | null
          ai_suggested_competencies?: Json
          ai_suggested_type?: string | null
          author_user_id: string
          category?: string | null
          checklist_id?: string | null
          competence: string
          created_at?: string
          employee_id: string
          id?: string
          linked_review_id?: string | null
          note_text: string
          note_type?: string
          occurred_at?: string
          provider_id: string
          service_order?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_analyzed_at?: string | null
          ai_professional_text?: string | null
          ai_suggested_category?: string | null
          ai_suggested_competencies?: Json
          ai_suggested_type?: string | null
          author_user_id?: string
          category?: string | null
          checklist_id?: string | null
          competence?: string
          created_at?: string
          employee_id?: string
          id?: string
          linked_review_id?: string | null
          note_text?: string
          note_type?: string
          occurred_at?: string
          provider_id?: string
          service_order?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_employee_notes_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_employee_notes_linked_review_id_fkey"
            columns: ["linked_review_id"]
            isOneToOne: false
            referencedRelation: "technical_employee_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_employee_notes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_employee_pdi_actions: {
        Row: {
          agreed_action: string
          created_at: string
          due_date: string | null
          employee_id: string
          evaluator_user_id: string
          followup_comment: string | null
          id: string
          indicator: string
          management_support: string | null
          objective: string
          provider_id: string
          review_id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          agreed_action: string
          created_at?: string
          due_date?: string | null
          employee_id: string
          evaluator_user_id: string
          followup_comment?: string | null
          id?: string
          indicator: string
          management_support?: string | null
          objective: string
          provider_id: string
          review_id: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agreed_action?: string
          created_at?: string
          due_date?: string | null
          employee_id?: string
          evaluator_user_id?: string
          followup_comment?: string | null
          id?: string
          indicator?: string
          management_support?: string | null
          objective?: string
          provider_id?: string
          review_id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_employee_pdi_actions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_employee_pdi_actions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "technical_employee_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_employee_review_ai: {
        Row: {
          analysis_type: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          input_snapshot: Json
          model: string | null
          options: Json
          review_id: string
        }
        Insert: {
          analysis_type: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          input_snapshot?: Json
          model?: string | null
          options?: Json
          review_id: string
        }
        Update: {
          analysis_type?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          input_snapshot?: Json
          model?: string | null
          options?: Json
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_employee_review_ai_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "technical_employee_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_employee_review_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          provider_id: string | null
          review_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          provider_id?: string | null
          review_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          provider_id?: string | null
          review_id?: string | null
        }
        Relationships: []
      }
      technical_employee_review_evidences: {
        Row: {
          checklist_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          evidence_reference_id: string | null
          evidence_type: string
          id: string
          os: string | null
          review_id: string
        }
        Insert: {
          checklist_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          evidence_reference_id?: string | null
          evidence_type: string
          id?: string
          os?: string | null
          review_id: string
        }
        Update: {
          checklist_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          evidence_reference_id?: string | null
          evidence_type?: string
          id?: string
          os?: string | null
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_employee_review_evidences_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_employee_review_evidences_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "technical_employee_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_employee_review_followups: {
        Row: {
          created_at: string
          created_by: string | null
          followup_date: string
          id: string
          observation: string | null
          previous_goal: string | null
          result: string | null
          review_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          followup_date?: string
          id?: string
          observation?: string | null
          previous_goal?: string | null
          result?: string | null
          review_id: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          followup_date?: string
          id?: string
          observation?: string | null
          previous_goal?: string | null
          result?: string | null
          review_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_employee_review_followups_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "technical_employee_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_employee_review_items: {
        Row: {
          category: string
          created_at: string
          id: string
          is_not_applicable: boolean
          item_key: string
          item_label: string
          observation: string | null
          review_id: string
          score: number | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_not_applicable?: boolean
          item_key: string
          item_label: string
          observation?: string | null
          review_id: string
          score?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_not_applicable?: boolean
          item_key?: string
          item_label?: string
          observation?: string | null
          review_id?: string
          score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_employee_review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "technical_employee_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_employee_review_meetings: {
        Row: {
          agreed_actions: string | null
          agreement_status: string | null
          created_at: string
          created_by: string | null
          employee_comments: string | null
          employee_reaction: string | null
          feedback_realized: boolean
          id: string
          meeting_date: string
          meeting_place: string | null
          new_information: string | null
          new_information_presented: boolean
          next_review_date: string | null
          review_id: string
          supervisor_notes: string | null
        }
        Insert: {
          agreed_actions?: string | null
          agreement_status?: string | null
          created_at?: string
          created_by?: string | null
          employee_comments?: string | null
          employee_reaction?: string | null
          feedback_realized?: boolean
          id?: string
          meeting_date?: string
          meeting_place?: string | null
          new_information?: string | null
          new_information_presented?: boolean
          next_review_date?: string | null
          review_id: string
          supervisor_notes?: string | null
        }
        Update: {
          agreed_actions?: string | null
          agreement_status?: string | null
          created_at?: string
          created_by?: string | null
          employee_comments?: string | null
          employee_reaction?: string | null
          feedback_realized?: boolean
          id?: string
          meeting_date?: string
          meeting_place?: string | null
          new_information?: string | null
          new_information_presented?: boolean
          next_review_date?: string | null
          review_id?: string
          supervisor_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technical_employee_review_meetings_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "technical_employee_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_employee_reviews: {
        Row: {
          archived_at: string | null
          communication_notes: string | null
          communication_score: number | null
          created_at: string
          development_action: string | null
          development_due_date: string | null
          development_goal: string | null
          development_metric: string | null
          development_notes: string | null
          development_points: Json
          employee_city: string | null
          employee_id: string
          employee_role: string | null
          evaluator_user_id: string
          evidence_notes: string | null
          evidence_score: number | null
          feedback_completed_at: string | null
          feedback_completed_by: string | null
          final_score: number | null
          general_notes: string | null
          id: string
          next_review_date: string | null
          operational_notes: string | null
          operational_score: number | null
          period_end: string
          period_start: string
          productivity_notes: string | null
          productivity_score: number | null
          provider_id: string
          recurrence_notes: string | null
          recurrence_score: number | null
          review_date: string
          status: string
          strengths: Json
          strengths_notes: string | null
          technical_notes: string | null
          technical_score: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          communication_notes?: string | null
          communication_score?: number | null
          created_at?: string
          development_action?: string | null
          development_due_date?: string | null
          development_goal?: string | null
          development_metric?: string | null
          development_notes?: string | null
          development_points?: Json
          employee_city?: string | null
          employee_id: string
          employee_role?: string | null
          evaluator_user_id: string
          evidence_notes?: string | null
          evidence_score?: number | null
          feedback_completed_at?: string | null
          feedback_completed_by?: string | null
          final_score?: number | null
          general_notes?: string | null
          id?: string
          next_review_date?: string | null
          operational_notes?: string | null
          operational_score?: number | null
          period_end: string
          period_start: string
          productivity_notes?: string | null
          productivity_score?: number | null
          provider_id: string
          recurrence_notes?: string | null
          recurrence_score?: number | null
          review_date?: string
          status?: string
          strengths?: Json
          strengths_notes?: string | null
          technical_notes?: string | null
          technical_score?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          communication_notes?: string | null
          communication_score?: number | null
          created_at?: string
          development_action?: string | null
          development_due_date?: string | null
          development_goal?: string | null
          development_metric?: string | null
          development_notes?: string | null
          development_points?: Json
          employee_city?: string | null
          employee_id?: string
          employee_role?: string | null
          evaluator_user_id?: string
          evidence_notes?: string | null
          evidence_score?: number | null
          feedback_completed_at?: string | null
          feedback_completed_by?: string | null
          final_score?: number | null
          general_notes?: string | null
          id?: string
          next_review_date?: string | null
          operational_notes?: string | null
          operational_score?: number | null
          period_end?: string
          period_start?: string
          productivity_notes?: string | null
          productivity_score?: number | null
          provider_id?: string
          recurrence_notes?: string | null
          recurrence_score?: number | null
          review_date?: string
          status?: string
          strengths?: Json
          strengths_notes?: string | null
          technical_notes?: string | null
          technical_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_employee_reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_feedback_access: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          provider_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          provider_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          provider_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_feedback_access_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cities: {
        Row: {
          city: string
          city_key: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          city: string
          city_key?: string | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          city?: string
          city_key?: string | null
          created_at?: string
          id?: string
          user_id?: string
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
      whistleblower_access: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          provider_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          provider_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          provider_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whistleblower_access_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblower_access_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          provider_id: string | null
          report_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          provider_id?: string | null
          report_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          provider_id?: string | null
          report_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whistleblower_access_logs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whistleblower_access_logs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "whistleblower_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblower_attachments: {
        Row: {
          created_at: string
          display_name: string
          id: string
          mime_type: string
          origin: string
          report_id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          mime_type: string
          origin: string
          report_id: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          mime_type?: string
          origin?: string
          report_id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "whistleblower_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "whistleblower_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblower_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          provider_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          provider_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          provider_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "whistleblower_categories_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblower_internal_notes: {
        Row: {
          author_user_id: string
          created_at: string
          id: string
          note: string
          report_id: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          id?: string
          note: string
          report_id: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          id?: string
          note?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whistleblower_internal_notes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "whistleblower_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblower_messages: {
        Row: {
          attachment_id: string | null
          created_at: string
          id: string
          message: string
          read_at: string | null
          report_id: string
          sender_type: string
          sender_user_id: string | null
        }
        Insert: {
          attachment_id?: string | null
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          report_id: string
          sender_type: string
          sender_user_id?: string | null
        }
        Update: {
          attachment_id?: string | null
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          report_id?: string
          sender_type?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whistleblower_messages_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "whistleblower_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whistleblower_messages_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "whistleblower_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblower_rate_limits: {
        Row: {
          action: string
          bucket: string
          request_count: number
          window_started_at: string
        }
        Insert: {
          action: string
          bucket: string
          request_count?: number
          window_started_at: string
        }
        Update: {
          action?: string
          bucket?: string
          request_count?: number
          window_started_at?: string
        }
        Relationships: []
      }
      whistleblower_reports: {
        Row: {
          access_key_hash: string
          access_key_salt: string
          assigned_to: string | null
          category_label: string
          category_slug: string
          city: string | null
          closed_at: string | null
          conclusion: string | null
          created_at: string
          department: string | null
          description: string
          first_analysis_at: string | null
          frequency: string | null
          id: string
          identified_department: string | null
          identified_email: string | null
          identified_name: string | null
          identified_phone: string | null
          incident_date: string | null
          incident_time: string | null
          location_description: string | null
          people_involved: string | null
          priority: string
          protocol: string
          provider_id: string
          report_type: string
          status: string
          title: string
          unit: string | null
          updated_at: string
          validation_code: string
          witnesses: string | null
        }
        Insert: {
          access_key_hash: string
          access_key_salt: string
          assigned_to?: string | null
          category_label: string
          category_slug: string
          city?: string | null
          closed_at?: string | null
          conclusion?: string | null
          created_at?: string
          department?: string | null
          description: string
          first_analysis_at?: string | null
          frequency?: string | null
          id?: string
          identified_department?: string | null
          identified_email?: string | null
          identified_name?: string | null
          identified_phone?: string | null
          incident_date?: string | null
          incident_time?: string | null
          location_description?: string | null
          people_involved?: string | null
          priority?: string
          protocol: string
          provider_id: string
          report_type: string
          status?: string
          title: string
          unit?: string | null
          updated_at?: string
          validation_code: string
          witnesses?: string | null
        }
        Update: {
          access_key_hash?: string
          access_key_salt?: string
          assigned_to?: string | null
          category_label?: string
          category_slug?: string
          city?: string | null
          closed_at?: string | null
          conclusion?: string | null
          created_at?: string
          department?: string | null
          description?: string
          first_analysis_at?: string | null
          frequency?: string | null
          id?: string
          identified_department?: string | null
          identified_email?: string | null
          identified_name?: string | null
          identified_phone?: string | null
          incident_date?: string | null
          incident_time?: string | null
          location_description?: string | null
          people_involved?: string | null
          priority?: string
          protocol?: string
          provider_id?: string
          report_type?: string
          status?: string
          title?: string
          unit?: string | null
          updated_at?: string
          validation_code?: string
          witnesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whistleblower_reports_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblower_settings: {
        Row: {
          channel_enabled: boolean
          intro_text: string | null
          provider_id: string
          updated_at: string
        }
        Insert: {
          channel_enabled?: boolean
          intro_text?: string | null
          provider_id: string
          updated_at?: string
        }
        Update: {
          channel_enabled?: boolean
          intro_text?: string | null
          provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whistleblower_settings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      whistleblower_status_history: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          internal_note: string | null
          is_public: boolean
          public_note: string | null
          report_id: string
          to_status: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          internal_note?: string | null
          is_public?: boolean
          public_note?: string | null
          report_id: string
          to_status?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          internal_note?: string | null
          is_public?: boolean
          public_note?: string | null
          report_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whistleblower_status_history_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "whistleblower_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      zumme_productivity_breakdown: {
        Row: {
          category: string
          created_at: string
          entry_id: string
          id: string
          kind: string
          label: string
          percent: number | null
          quantity: number
        }
        Insert: {
          category?: string
          created_at?: string
          entry_id: string
          id?: string
          kind: string
          label: string
          percent?: number | null
          quantity: number
        }
        Update: {
          category?: string
          created_at?: string
          entry_id?: string
          id?: string
          kind?: string
          label?: string
          percent?: number | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "zumme_productivity_breakdown_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "zumme_productivity_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      zumme_productivity_entries: {
        Row: {
          avg_completion_minutes: number | null
          avg_completion_raw: string | null
          avg_per_day: number | null
          cities: string[]
          competence: string
          created_at: string
          employee_id: string | null
          entered_by: string
          id: string
          notes: string | null
          provider_id: string
          source: string
          source_name: string
          total_os: number
          updated_at: string
        }
        Insert: {
          avg_completion_minutes?: number | null
          avg_completion_raw?: string | null
          avg_per_day?: number | null
          cities?: string[]
          competence: string
          created_at?: string
          employee_id?: string | null
          entered_by: string
          id?: string
          notes?: string | null
          provider_id: string
          source?: string
          source_name: string
          total_os: number
          updated_at?: string
        }
        Update: {
          avg_completion_minutes?: number | null
          avg_completion_raw?: string | null
          avg_per_day?: number | null
          cities?: string[]
          competence?: string
          created_at?: string
          employee_id?: string | null
          entered_by?: string
          id?: string
          notes?: string | null
          provider_id?: string
          source?: string
          source_name?: string
          total_os?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zumme_productivity_entries_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      zumme_technician_aliases: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          provider_id: string
          zumme_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          provider_id: string
          zumme_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          provider_id?: string
          zumme_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "zumme_technician_aliases_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      cto_reference_latest: {
        Row: {
          cidade: string | null
          created_at: string | null
          provider_id: string | null
          snapshot_id: string | null
          total_ctos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cto_reference_snapshots_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
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
      consume_whistleblower_rate_limit: {
        Args: {
          _action: string
          _bucket: string
          _limit?: number
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
      empty_checklist_revision_data: {
        Args: { _tipo: Database["public"]["Enums"]["checklist_tipo"] }
        Returns: Json
      }
      generate_next_technician_login: {
        Args: { _provider_id: string }
        Returns: string
      }
      has_city_exception: {
        Args: { _city: string; _os: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_technical_feedback_access: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_whistleblower_access: { Args: { _user_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_supervisor_of: {
        Args: { _supervisor: string; _tecnico: string }
        Returns: boolean
      }
      link_diagnostic_report: {
        Args: {
          _agent_version: string
          _case_id: string
          _checklist_id: string
          _diagnostic_session_id: string
          _generated_at: string
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
      norm_city: { Args: { _city: string }; Returns: string }
      owns_checklist_analysis: {
        Args: { _analysis_id: string }
        Returns: boolean
      }
      owns_technical_review: { Args: { _review_id: string }; Returns: boolean }
      owns_zumme_entry: { Args: { _entry_id: string }; Returns: boolean }
      provider_is_active: { Args: { _provider_id: string }; Returns: boolean }
      purge_old_security_logs: { Args: never; Returns: undefined }
      review_checklist: {
        Args: { _comment?: string; _decision: string; _id: string }
        Returns: {
          id: string
          locked_for_rework: boolean
          review_status: string
        }[]
      }
      supervisor_can_see_checklist: {
        Args: {
          _city: string
          _provider: string
          _supervisor: string
          _tecnico: string
        }
        Returns: boolean
      }
      supervisor_covers_city: {
        Args: { _city: string; _supervisor: string }
        Returns: boolean
      }
      user_can_access_city: {
        Args: { _city: string; _user_id: string }
        Returns: boolean
      }
      user_territories: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role:
        | "admin"
        | "tecnico"
        | "almoxarifado"
        | "supervisor"
        | "noc"
        | "rh"
      checklist_status: "rascunho" | "finalizado"
      checklist_tipo:
        | "validacao_ont"
        | "instalacao"
        | "remapeamento_cto"
        | "rompimento"
        | "readequacao"
        | "melhoria_sinal"
      foto_categoria:
        | "etiqueta"
        | "leds"
        | "fonte"
        | "teste_cabeado"
        | "teste_wifi"
        | "outro"
        | "antes"
        | "depois"
        | "sinal_fibra"
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
      app_role: ["admin", "tecnico", "almoxarifado", "supervisor", "noc", "rh"],
      checklist_status: ["rascunho", "finalizado"],
      checklist_tipo: [
        "validacao_ont",
        "instalacao",
        "remapeamento_cto",
        "rompimento",
        "readequacao",
        "melhoria_sinal",
      ],
      foto_categoria: [
        "etiqueta",
        "leds",
        "fonte",
        "teste_cabeado",
        "teste_wifi",
        "outro",
        "antes",
        "depois",
        "sinal_fibra",
      ],
    },
  },
} as const
