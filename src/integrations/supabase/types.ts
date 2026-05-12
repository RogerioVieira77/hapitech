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
      agent_knowledge_files: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          knowledge_file_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          knowledge_file_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          knowledge_file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_files_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_files_knowledge_file_id_fkey"
            columns: ["knowledge_file_id"]
            isOneToOne: false
            referencedRelation: "knowledge_files"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          agent_timezone: string
          allow_reminders: boolean
          avatar_url: string | null
          communication_style: string | null
          connection_id: string | null
          conversation_starters: string[] | null
          created_at: string
          elevenlabs_always_audio: boolean | null
          elevenlabs_api_key: string | null
          elevenlabs_audio_on_audio: boolean | null
          elevenlabs_enabled: boolean | null
          elevenlabs_model: string | null
          elevenlabs_similarity: number | null
          elevenlabs_speaker_boost: boolean | null
          elevenlabs_speed: number | null
          elevenlabs_stability: number | null
          elevenlabs_style: number | null
          elevenlabs_voice_id: string | null
          id: string
          inactivity_rules: Json | null
          instructions: string
          max_interactions: number | null
          max_response_chars: number | null
          model: string
          name: string
          official_site: string | null
          product_description: string | null
          product_name: string | null
          prompt_como_pergunta: string | null
          prompt_nao_fazer: string | null
          prompt_o_que_fazer: string | null
          purpose: string | null
          response_delay_seconds: number
          restrict_topics: boolean
          sign_agent_name: boolean
          smart_training_search: boolean
          split_delay_ms: number
          split_response_max_chars: number | null
          split_responses: boolean
          status: string
          summary_on_transfer: boolean
          telegram_connection_id: string | null
          temperature: number
          transfer_rules: Json | null
          transfer_to_human: boolean
          updated_at: string
          use_emojis: boolean
          user_id: string
          webhook_rules: Json | null
        }
        Insert: {
          agent_timezone?: string
          allow_reminders?: boolean
          avatar_url?: string | null
          communication_style?: string | null
          connection_id?: string | null
          conversation_starters?: string[] | null
          created_at?: string
          elevenlabs_always_audio?: boolean | null
          elevenlabs_api_key?: string | null
          elevenlabs_audio_on_audio?: boolean | null
          elevenlabs_enabled?: boolean | null
          elevenlabs_model?: string | null
          elevenlabs_similarity?: number | null
          elevenlabs_speaker_boost?: boolean | null
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number | null
          elevenlabs_style?: number | null
          elevenlabs_voice_id?: string | null
          id?: string
          inactivity_rules?: Json | null
          instructions?: string
          max_interactions?: number | null
          max_response_chars?: number | null
          model?: string
          name: string
          official_site?: string | null
          product_description?: string | null
          product_name?: string | null
          prompt_como_pergunta?: string | null
          prompt_nao_fazer?: string | null
          prompt_o_que_fazer?: string | null
          purpose?: string | null
          response_delay_seconds?: number
          restrict_topics?: boolean
          sign_agent_name?: boolean
          smart_training_search?: boolean
          split_delay_ms?: number
          split_response_max_chars?: number | null
          split_responses?: boolean
          status?: string
          summary_on_transfer?: boolean
          telegram_connection_id?: string | null
          temperature?: number
          transfer_rules?: Json | null
          transfer_to_human?: boolean
          updated_at?: string
          use_emojis?: boolean
          user_id: string
          webhook_rules?: Json | null
        }
        Update: {
          agent_timezone?: string
          allow_reminders?: boolean
          avatar_url?: string | null
          communication_style?: string | null
          connection_id?: string | null
          conversation_starters?: string[] | null
          created_at?: string
          elevenlabs_always_audio?: boolean | null
          elevenlabs_api_key?: string | null
          elevenlabs_audio_on_audio?: boolean | null
          elevenlabs_enabled?: boolean | null
          elevenlabs_model?: string | null
          elevenlabs_similarity?: number | null
          elevenlabs_speaker_boost?: boolean | null
          elevenlabs_speed?: number | null
          elevenlabs_stability?: number | null
          elevenlabs_style?: number | null
          elevenlabs_voice_id?: string | null
          id?: string
          inactivity_rules?: Json | null
          instructions?: string
          max_interactions?: number | null
          max_response_chars?: number | null
          model?: string
          name?: string
          official_site?: string | null
          product_description?: string | null
          product_name?: string | null
          prompt_como_pergunta?: string | null
          prompt_nao_fazer?: string | null
          prompt_o_que_fazer?: string | null
          purpose?: string | null
          response_delay_seconds?: number
          restrict_topics?: boolean
          sign_agent_name?: boolean
          smart_training_search?: boolean
          split_delay_ms?: number
          split_response_max_chars?: number | null
          split_responses?: boolean
          status?: string
          summary_on_transfer?: boolean
          telegram_connection_id?: string | null
          temperature?: number
          transfer_rules?: Json | null
          transfer_to_human?: boolean
          updated_at?: string
          use_emojis?: boolean
          user_id?: string
          webhook_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "wuzapi_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_telegram_connection_id_fkey"
            columns: ["telegram_connection_id"]
            isOneToOne: false
            referencedRelation: "telegram_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_models: {
        Row: {
          created_at: string
          credits_per_response: number
          display_name: string
          id: string
          is_enabled: boolean
          model_id: string
          provider_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_per_response?: number
          display_name: string
          id?: string
          is_enabled?: boolean
          model_id: string
          provider_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_per_response?: number
          display_name?: string
          id?: string
          is_enabled?: boolean
          model_id?: string
          provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_key: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      asaas_subscriptions: {
        Row: {
          asaas_customer_id: string
          asaas_subscription_id: string
          billing_cycle: string
          created_at: string
          id: string
          organization_id: string
          plan_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asaas_customer_id: string
          asaas_subscription_id: string
          billing_cycle?: string
          created_at?: string
          id?: string
          organization_id: string
          plan_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asaas_customer_id?: string
          asaas_subscription_id?: string
          billing_cycle?: string
          created_at?: string
          id?: string
          organization_id?: string
          plan_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asaas_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asaas_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_data: {
        Row: {
          city: string | null
          complement: string | null
          created_at: string
          document_number: string
          document_type: string
          email: string | null
          id: string
          legal_name: string
          neighborhood: string | null
          number: string | null
          organization_id: string
          phone: string | null
          state: string | null
          street: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          complement?: string | null
          created_at?: string
          document_number: string
          document_type?: string
          email?: string | null
          id?: string
          legal_name: string
          neighborhood?: string | null
          number?: string | null
          organization_id: string
          phone?: string | null
          state?: string | null
          street?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          complement?: string | null
          created_at?: string
          document_number?: string
          document_type?: string
          email?: string | null
          id?: string
          legal_name?: string
          neighborhood?: string | null
          number?: string | null
          organization_id?: string
          phone?: string | null
          state?: string | null
          street?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_data_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clinicorp_connections: {
        Row: {
          api_key: string
          clinic_id: string
          clinic_name: string | null
          created_at: string
          id: string
          is_connected: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          clinic_id: string
          clinic_name?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          clinic_id?: string
          clinic_name?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      connection_events: {
        Row: {
          channel_name: string | null
          connection_id: string
          connection_type: string
          created_at: string
          disconnected_at: string
          duration_seconds: number | null
          id: string
          reconnected_at: string | null
          user_id: string
        }
        Insert: {
          channel_name?: string | null
          connection_id: string
          connection_type: string
          created_at?: string
          disconnected_at?: string
          duration_seconds?: number | null
          id?: string
          reconnected_at?: string | null
          user_id: string
        }
        Update: {
          channel_name?: string | null
          connection_id?: string
          connection_type?: string
          created_at?: string
          disconnected_at?: string
          duration_seconds?: number | null
          id?: string
          reconnected_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contact_custom_field_values: {
        Row: {
          conversation_id: string
          created_at: string
          custom_field_id: string
          id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custom_field_id: string
          id?: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custom_field_id?: string
          id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_custom_field_values_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_custom_field_values_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "contact_custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_custom_fields: {
        Row: {
          created_at: string
          field_name: string
          field_options: Json | null
          field_type: string
          id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          field_name: string
          field_options?: Json | null
          field_type?: string
          id?: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          field_name?: string
          field_options?: Json | null
          field_type?: string
          id?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      contact_notes: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_tags: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_id: string | null
          assigned_to: string | null
          connection_id: string | null
          contact_birth_date: string | null
          contact_city: string | null
          contact_company: string | null
          contact_email: string | null
          contact_gender: string | null
          contact_job_title: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_state: string | null
          created_at: string
          crm_stage: string | null
          id: string
          is_ai_active: boolean | null
          is_blocked: boolean
          is_resolved: boolean
          last_message: string | null
          last_message_at: string | null
          last_message_media_type: string | null
          last_message_sender: string | null
          profile_picture_url: string | null
          remote_jid: string
          unread_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          assigned_to?: string | null
          connection_id?: string | null
          contact_birth_date?: string | null
          contact_city?: string | null
          contact_company?: string | null
          contact_email?: string | null
          contact_gender?: string | null
          contact_job_title?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_state?: string | null
          created_at?: string
          crm_stage?: string | null
          id?: string
          is_ai_active?: boolean | null
          is_blocked?: boolean
          is_resolved?: boolean
          last_message?: string | null
          last_message_at?: string | null
          last_message_media_type?: string | null
          last_message_sender?: string | null
          profile_picture_url?: string | null
          remote_jid: string
          unread_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          assigned_to?: string | null
          connection_id?: string | null
          contact_birth_date?: string | null
          contact_city?: string | null
          contact_company?: string | null
          contact_email?: string | null
          contact_gender?: string | null
          contact_job_title?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_state?: string | null
          created_at?: string
          crm_stage?: string | null
          id?: string
          is_ai_active?: boolean | null
          is_blocked?: boolean
          is_resolved?: boolean
          last_message?: string | null
          last_message_at?: string | null
          last_message_media_type?: string | null
          last_message_sender?: string | null
          profile_picture_url?: string | null
          remote_jid?: string
          unread_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "wuzapi_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          agent_id: string | null
          amount: number
          balance_after: number | null
          created_at: string
          description: string | null
          id: string
          model_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          amount?: number
          balance_after?: number | null
          created_at?: string
          description?: string | null
          id?: string
          model_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          amount?: number
          balance_after?: number | null
          created_at?: string
          description?: string | null
          id?: string
          model_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_automation_rules: {
        Row: {
          action_config: Json | null
          action_type: string
          created_at: string
          id: string
          pipeline_id: string
          position: number
          stage_slug: string
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          created_at?: string
          id?: string
          pipeline_id: string
          position?: number
          stage_slug: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          created_at?: string
          id?: string
          pipeline_id?: string
          position?: number
          stage_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_automation_rules_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_custom_field_values: {
        Row: {
          created_at: string
          field_id: string
          id: string
          lead_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          lead_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          lead_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_custom_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "crm_custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_custom_field_values_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_custom_fields: {
        Row: {
          created_at: string
          field_type: string
          id: string
          name: string
          options: Json
          pipeline_id: string | null
          position: number
          show_on_board: boolean
          show_on_list: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          field_type?: string
          id?: string
          name: string
          options?: Json
          pipeline_id?: string | null
          position?: number
          show_on_board?: boolean
          show_on_list?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          field_type?: string
          id?: string
          name?: string
          options?: Json
          pipeline_id?: string | null
          position?: number
          show_on_board?: boolean
          show_on_list?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_custom_fields_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      crm_stages: {
        Row: {
          created_at: string
          id: string
          name: string
          pipeline_id: string | null
          position: number
          slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pipeline_id?: string | null
          position?: number
          slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pipeline_id?: string | null
          position?: number
          slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          access_token: string | null
          business_hours: Json
          calendar_id: string
          calendar_name: string
          created_at: string
          display_name: string
          fields: Json
          google_email: string
          id: string
          is_always_open: boolean
          refresh_token: string | null
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          business_hours?: Json
          calendar_id: string
          calendar_name?: string
          created_at?: string
          display_name?: string
          fields?: Json
          google_email: string
          id?: string
          is_always_open?: boolean
          refresh_token?: string | null
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          business_hours?: Json
          calendar_id?: string
          calendar_name?: string
          created_at?: string
          display_name?: string
          fields?: Json
          google_email?: string
          id?: string
          is_always_open?: boolean
          refresh_token?: string | null
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          knowledge_file_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          knowledge_file_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          knowledge_file_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_knowledge_file_id_fkey"
            columns: ["knowledge_file_id"]
            isOneToOne: false
            referencedRelation: "knowledge_files"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_files: {
        Row: {
          content: string | null
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          source_type: string
          source_url: string | null
          status: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_name: string
          file_size?: number
          file_type: string
          id?: string
          source_type?: string
          source_url?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          source_type?: string
          source_url?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          lead_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          lead_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_comments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          lead_id: string
          name: string
          phone: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          lead_id: string
          name: string
          phone?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          lead_id?: string
          name?: string
          phone?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_products: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          name: string
          price: number
          quantity: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          name?: string
          price?: number
          quantity?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          name?: string
          price?: number
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_products_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string
          due_date: string | null
          id: string
          lead_id: string
          status: string
          task_type: string
          title: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          lead_id: string
          status?: string
          task_type?: string
          title?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          lead_id?: string
          status?: string
          task_type?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          position: number
          priority: string | null
          source: string | null
          stage: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          position?: number
          priority?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          position?: number
          priority?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          media_type: string | null
          media_url: string | null
          message_id: string | null
          remote_jid: string
          sender: string
          timestamp: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          remote_jid: string
          sender: string
          timestamp?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          remote_jid?: string
          sender?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_period: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          name: string
          owner_id: string
          plan_id: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          billing_period?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          name: string
          owner_id: string
          plan_id?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          billing_period?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          name?: string
          owner_id?: string
          plan_id?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          features: string[]
          id: string
          is_active: boolean
          max_agents: number
          max_connections: number
          max_members: number
          monthly_credits: number
          monthly_price: number
          name: string
          popular: boolean
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          features?: string[]
          id?: string
          is_active?: boolean
          max_agents?: number
          max_connections?: number
          max_members?: number
          monthly_credits?: number
          monthly_price?: number
          name: string
          popular?: boolean
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          features?: string[]
          id?: string
          is_active?: boolean
          max_agents?: number
          max_connections?: number
          max_members?: number
          monthly_credits?: number
          monthly_price?: number
          name?: string
          popular?: boolean
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          compact_mode: boolean
          created_at: string
          display_name: string | null
          id: string
          language: string
          notif_desktop: boolean
          notif_sound: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          compact_mode?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          language?: string
          notif_desktop?: boolean
          notif_sound?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          compact_mode?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          language?: string
          notif_desktop?: boolean
          notif_sound?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recovery_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          recovery_link: string
          used: boolean
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          recovery_link: string
          used?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          recovery_link?: string
          used?: boolean
        }
        Relationships: []
      }
      smtp_settings: {
        Row: {
          created_at: string
          gmail_oauth_email: string | null
          gmail_oauth_refresh_token: string | null
          id: string
          is_active: boolean
          sender_email: string
          sender_name: string
          smtp_host: string
          smtp_pass: string
          smtp_port: number
          smtp_user: string
          updated_at: string
          use_gmail_oauth: boolean | null
        }
        Insert: {
          created_at?: string
          gmail_oauth_email?: string | null
          gmail_oauth_refresh_token?: string | null
          id?: string
          is_active?: boolean
          sender_email?: string
          sender_name?: string
          smtp_host?: string
          smtp_pass?: string
          smtp_port?: number
          smtp_user?: string
          updated_at?: string
          use_gmail_oauth?: boolean | null
        }
        Update: {
          created_at?: string
          gmail_oauth_email?: string | null
          gmail_oauth_refresh_token?: string | null
          id?: string
          is_active?: boolean
          sender_email?: string
          sender_name?: string
          smtp_host?: string
          smtp_pass?: string
          smtp_port?: number
          smtp_user?: string
          updated_at?: string
          use_gmail_oauth?: boolean | null
        }
        Relationships: []
      }
      solarmarket_connections: {
        Row: {
          api_key: string
          company_name: string | null
          created_at: string
          id: string
          is_connected: boolean
          settings: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          company_name?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean
          settings?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          company_name?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean
          settings?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_connections: {
        Row: {
          bot_name: string | null
          bot_token: string | null
          bot_username: string | null
          created_at: string
          id: string
          is_connected: boolean
          photo_url: string | null
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          bot_name?: string | null
          bot_token?: string | null
          bot_username?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean
          photo_url?: string | null
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          bot_name?: string | null
          bot_token?: string | null
          bot_username?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean
          photo_url?: string | null
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      widget_connections: {
        Row: {
          agent_id: string | null
          allowed_domains: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          primary_color: string | null
          updated_at: string
          user_id: string
          welcome_message: string | null
        }
        Insert: {
          agent_id?: string | null
          allowed_domains?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          primary_color?: string | null
          updated_at?: string
          user_id: string
          welcome_message?: string | null
        }
        Update: {
          agent_id?: string | null
          allowed_domains?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          primary_color?: string | null
          updated_at?: string
          user_id?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "widget_connections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      wuzapi_connections: {
        Row: {
          api_token: string
          created_at: string
          id: string
          instance_url: string
          is_connected: boolean
          phone_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_token: string
          created_at?: string
          id?: string
          instance_url: string
          is_connected?: boolean
          phone_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_token?: string
          created_at?: string
          id?: string
          instance_url?: string
          is_connected?: boolean
          phone_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_providers_public: {
        Row: {
          display_name: string | null
          id: string | null
          name: string | null
        }
        Insert: {
          display_name?: string | null
          id?: string | null
          name?: string | null
        }
        Update: {
          display_name?: string | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      deduct_credits: {
        Args: {
          _agent_id?: string
          _amount: number
          _description?: string
          _model_id?: string
          _user_id: string
        }
        Returns: Json
      }
      get_admin_stats: { Args: never; Returns: Json }
      get_all_users_for_admin: { Args: never; Returns: Json }
      get_my_org_id: { Args: never; Returns: string }
      get_org_members_for_admin: { Args: { _org_id: string }; Returns: Json }
      get_org_members_with_email: {
        Args: never
        Returns: {
          email: string
          last_sign_in_at: string
          user_id: string
        }[]
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_org_member: { Args: { _check_user_id: string }; Returns: boolean }
      is_org_member_direct: {
        Args: { _check_user_id: string }
        Returns: boolean
      }
      match_knowledge_chunks: {
        Args: {
          knowledge_file_ids: string[]
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          knowledge_file_id: string
          similarity: number
        }[]
      }
      set_user_credits: {
        Args: {
          _amount: number
          _description?: string
          _operation: string
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
