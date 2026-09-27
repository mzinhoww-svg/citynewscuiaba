export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_agents: {
        Row: {
          daily_budget_brl: number;
          enabled: boolean;
          fallback_model_id: string | null;
          function: string;
          id: string;
          model_id: string;
          prompt_version: number | null;
        };
        Insert: {
          daily_budget_brl: number;
          enabled?: boolean;
          fallback_model_id?: string | null;
          function: string;
          id: string;
          model_id: string;
          prompt_version?: number | null;
        };
        Update: {
          daily_budget_brl?: number;
          enabled?: boolean;
          fallback_model_id?: string | null;
          function?: string;
          id?: string;
          model_id?: string;
          prompt_version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_agents_fallback_model_id_fkey";
            columns: ["fallback_model_id"];
            isOneToOne: false;
            referencedRelation: "ai_models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agents_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "ai_models";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_calls: {
        Row: {
          agent_id: string;
          cost_brl: number | null;
          created_at: string;
          error: string | null;
          fallback_used: boolean;
          id: number;
          latency_ms: number | null;
          model_id: string;
          ok: boolean;
          prompt_version: number | null;
          tokens_in: number | null;
          tokens_out: number | null;
        };
        Insert: {
          agent_id: string;
          cost_brl?: number | null;
          created_at?: string;
          error?: string | null;
          fallback_used?: boolean;
          id?: number;
          latency_ms?: number | null;
          model_id: string;
          ok: boolean;
          prompt_version?: number | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Update: {
          agent_id?: string;
          cost_brl?: number | null;
          created_at?: string;
          error?: string | null;
          fallback_used?: boolean;
          id?: number;
          latency_ms?: number | null;
          model_id?: string;
          ok?: boolean;
          prompt_version?: number | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Relationships: [];
      };
      ai_models: {
        Row: {
          cost_per_1k_in: number | null;
          cost_per_1k_out: number | null;
          id: string;
          max_tokens: number | null;
          name: string;
          provider: string;
          status: string;
          temperature: number | null;
          updated_at: string;
          updated_by: string | null;
          version: string;
        };
        Insert: {
          cost_per_1k_in?: number | null;
          cost_per_1k_out?: number | null;
          id: string;
          max_tokens?: number | null;
          name: string;
          provider: string;
          status?: string;
          temperature?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          version: string;
        };
        Update: {
          cost_per_1k_in?: number | null;
          cost_per_1k_out?: number | null;
          id?: string;
          max_tokens?: number | null;
          name?: string;
          provider?: string;
          status?: string;
          temperature?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: string;
        };
        Relationships: [];
      };
      ai_prompts: {
        Row: {
          agent_id: string;
          approved_by: string[];
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          rationale: string;
          status: string;
          version: number;
        };
        Insert: {
          agent_id: string;
          approved_by?: string[];
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          rationale: string;
          status?: string;
          version: number;
        };
        Update: {
          agent_id?: string;
          approved_by?: string[];
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          rationale?: string;
          status?: string;
          version?: number;
        };
        Relationships: [];
      };
      alerts: {
        Row: {
          active: boolean;
          channel: string;
          frequency: string;
          id: string;
          owner_ref: string;
          target_id: string;
          target_kind: string;
        };
        Insert: {
          active?: boolean;
          channel: string;
          frequency: string;
          id?: string;
          owner_ref: string;
          target_id: string;
          target_kind: string;
        };
        Update: {
          active?: boolean;
          channel?: string;
          frequency?: string;
          id?: string;
          owner_ref?: string;
          target_id?: string;
          target_kind?: string;
        };
        Relationships: [];
      };
      approvals: {
        Row: {
          approved_by: string | null;
          created_at: string;
          id: string;
          justification: string;
          kind: string;
          requested_by: string;
          status: string;
          target_ref: string;
        };
        Insert: {
          approved_by?: string | null;
          created_at?: string;
          id?: string;
          justification: string;
          kind: string;
          requested_by: string;
          status?: string;
          target_ref: string;
        };
        Update: {
          approved_by?: string | null;
          created_at?: string;
          id?: string;
          justification?: string;
          kind?: string;
          requested_by?: string;
          status?: string;
          target_ref?: string;
        };
        Relationships: [];
      };
      article_media: {
        Row: {
          article_id: string;
          chosen_at: string;
          chosen_by: string;
          media_id: string;
          rationale: string;
        };
        Insert: {
          article_id: string;
          chosen_at?: string;
          chosen_by: string;
          media_id: string;
          rationale: string;
        };
        Update: {
          article_id?: string;
          chosen_at?: string;
          chosen_by?: string;
          media_id?: string;
          rationale?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_media_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_media_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      article_sources: {
        Row: {
          article_id: string;
          confirmed: boolean;
          item_id: string;
          role: string;
        };
        Insert: {
          article_id: string;
          confirmed?: boolean;
          item_id: string;
          role: string;
        };
        Update: {
          article_id?: string;
          confirmed?: boolean;
          item_id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_sources_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_sources_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "collected_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_sources_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "public_aggregated";
            referencedColumns: ["id"];
          },
        ];
      };
      article_versions: {
        Row: {
          article_id: string;
          author_id: string | null;
          change_kind: string;
          created_at: string;
          id: string;
          number: number;
          origin: string;
          public_note: string | null;
          snapshot: NonNullable<Json>;
        };
        Insert: {
          article_id: string;
          author_id?: string | null;
          change_kind?: string;
          created_at?: string;
          id?: string;
          number: number;
          origin: string;
          public_note?: string | null;
          snapshot: NonNullable<Json>;
        };
        Update: {
          article_id?: string;
          author_id?: string | null;
          change_kind?: string;
          created_at?: string;
          id?: string;
          number?: number;
          origin?: string;
          public_note?: string | null;
          snapshot?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "article_versions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      articles: {
        Row: {
          agent_id: string | null;
          ai_summary: string[] | null;
          ai_summary_reviewed_by: string | null;
          author_id: string | null;
          body: NonNullable<Json>;
          confidence: Database["public"]["Enums"]["confidence_level"];
          confidence_score: number;
          dek: string;
          embedding: string | null;
          gone_reason: string | null;
          id: string;
          kind: Database["public"]["Enums"]["content_kind"];
          neighborhoods: string[];
          publish_mode: Database["public"]["Enums"]["publish_mode"] | null;
          published_at: string | null;
          rules_version: number | null;
          scheduled_for: string | null;
          section_slug: string;
          slug: string;
          sponsored: boolean;
          status: Database["public"]["Enums"]["article_status"];
          title: string;
          topic_id: string | null;
          tsv: unknown;
          updated_at: string;
          urgent: boolean;
        };
        Insert: {
          agent_id?: string | null;
          ai_summary?: string[] | null;
          ai_summary_reviewed_by?: string | null;
          author_id?: string | null;
          body: NonNullable<Json>;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          confidence_score?: number;
          dek: string;
          embedding?: string | null;
          gone_reason?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["content_kind"];
          neighborhoods?: string[];
          publish_mode?: Database["public"]["Enums"]["publish_mode"] | null;
          published_at?: string | null;
          rules_version?: number | null;
          scheduled_for?: string | null;
          section_slug: string;
          slug: string;
          sponsored?: boolean;
          status?: Database["public"]["Enums"]["article_status"];
          title: string;
          topic_id?: string | null;
          tsv?: unknown;
          updated_at?: string;
          urgent?: boolean;
        };
        Update: {
          agent_id?: string | null;
          ai_summary?: string[] | null;
          ai_summary_reviewed_by?: string | null;
          author_id?: string | null;
          body?: NonNullable<Json>;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          confidence_score?: number;
          dek?: string;
          embedding?: string | null;
          gone_reason?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["content_kind"];
          neighborhoods?: string[];
          publish_mode?: Database["public"]["Enums"]["publish_mode"] | null;
          published_at?: string | null;
          rules_version?: number | null;
          scheduled_for?: string | null;
          section_slug?: string;
          slug?: string;
          sponsored?: boolean;
          status?: Database["public"]["Enums"]["article_status"];
          title?: string;
          topic_id?: string | null;
          tsv?: unknown;
          updated_at?: string;
          urgent?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "articles_section_slug_fkey";
            columns: ["section_slug"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "articles_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor: string;
          at: string;
          details: NonNullable<Json>;
          id: number;
          ip_hash: string | null;
          object_ref: string;
        };
        Insert: {
          action: string;
          actor: string;
          at?: string;
          details?: NonNullable<Json>;
          id?: number;
          ip_hash?: string | null;
          object_ref: string;
        };
        Update: {
          action?: string;
          actor?: string;
          at?: string;
          details?: NonNullable<Json>;
          id?: number;
          ip_hash?: string | null;
          object_ref?: string;
        };
        Relationships: [];
      };
      collected_items: {
        Row: {
          author: string | null;
          canonical_url: string;
          created_at: string;
          duplicate_of: string | null;
          embedding: string | null;
          excerpt: string | null;
          id: string;
          image_url: string | null;
          locality: string | null;
          original_title: string;
          published_at: string | null;
          raw_id: string | null;
          section_slug: string | null;
          simhash: number | null;
          source_id: string;
          topic_id: string | null;
        };
        Insert: {
          author?: string | null;
          canonical_url: string;
          created_at?: string;
          duplicate_of?: string | null;
          embedding?: string | null;
          excerpt?: string | null;
          id?: string;
          image_url?: string | null;
          locality?: string | null;
          original_title: string;
          published_at?: string | null;
          raw_id?: string | null;
          section_slug?: string | null;
          simhash?: number | null;
          source_id: string;
          topic_id?: string | null;
        };
        Update: {
          author?: string | null;
          canonical_url?: string;
          created_at?: string;
          duplicate_of?: string | null;
          embedding?: string | null;
          excerpt?: string | null;
          id?: string;
          image_url?: string | null;
          locality?: string | null;
          original_title?: string;
          published_at?: string | null;
          raw_id?: string | null;
          section_slug?: string | null;
          simhash?: number | null;
          source_id?: string;
          topic_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "collected_items_duplicate_of_fkey";
            columns: ["duplicate_of"];
            isOneToOne: false;
            referencedRelation: "collected_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collected_items_duplicate_of_fkey";
            columns: ["duplicate_of"];
            isOneToOne: false;
            referencedRelation: "public_aggregated";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collected_items_raw_id_fkey";
            columns: ["raw_id"];
            isOneToOne: false;
            referencedRelation: "raw_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collected_items_section_slug_fkey";
            columns: ["section_slug"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "collected_items_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "public_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collected_items_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collected_items_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      collection_items: {
        Row: {
          collection_id: string;
          content_ref: string;
          position: number;
        };
        Insert: {
          collection_id: string;
          content_ref: string;
          position: number;
        };
        Update: {
          collection_id?: string;
          content_ref?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
        ];
      };
      collections: {
        Row: {
          curator_id: string | null;
          description: string;
          id: string;
          is_editorial: boolean;
          owner_ref: string | null;
          slug: string;
          title: string;
        };
        Insert: {
          curator_id?: string | null;
          description: string;
          id?: string;
          is_editorial?: boolean;
          owner_ref?: string | null;
          slug: string;
          title: string;
        };
        Update: {
          curator_id?: string | null;
          description?: string;
          id?: string;
          is_editorial?: boolean;
          owner_ref?: string | null;
          slug?: string;
          title?: string;
        };
        Relationships: [];
      };
      corrections: {
        Row: {
          article_id: string;
          id: string;
          kind: string;
          public_note: string;
          published_at: string | null;
          requested_by: string;
          status: string;
        };
        Insert: {
          article_id: string;
          id?: string;
          kind: string;
          public_note: string;
          published_at?: string | null;
          requested_by: string;
          status?: string;
        };
        Update: {
          article_id?: string;
          id?: string;
          kind?: string;
          public_note?: string;
          published_at?: string | null;
          requested_by?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "corrections_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      decisions: {
        Row: {
          agent_id: string | null;
          created_at: string;
          human_decision: string | null;
          human_id: string | null;
          id: string;
          input_hash: string | null;
          object_ref: string;
          output: Json | null;
          prompt_version: number | null;
          rationale: string | null;
          recommended: string | null;
          rules_version: number | null;
          step: string;
        };
        Insert: {
          agent_id?: string | null;
          created_at?: string;
          human_decision?: string | null;
          human_id?: string | null;
          id?: string;
          input_hash?: string | null;
          object_ref: string;
          output?: Json | null;
          prompt_version?: number | null;
          rationale?: string | null;
          recommended?: string | null;
          rules_version?: number | null;
          step: string;
        };
        Update: {
          agent_id?: string | null;
          created_at?: string;
          human_decision?: string | null;
          human_id?: string | null;
          id?: string;
          input_hash?: string | null;
          object_ref?: string;
          output?: Json | null;
          prompt_version?: number | null;
          rationale?: string | null;
          recommended?: string | null;
          rules_version?: number | null;
          step?: string;
        };
        Relationships: [];
      };
      event_listings: {
        Row: {
          accessibility: string | null;
          age_rating: string;
          category: string;
          confirmed_at: string | null;
          description: string | null;
          ends_at: string | null;
          id: string;
          is_free: boolean | null;
          neighborhood: string | null;
          origin: string;
          price_cents: number | null;
          slug: string;
          starts_at: string;
          title: string;
          venue: string;
        };
        Insert: {
          accessibility?: string | null;
          age_rating?: string;
          category: string;
          confirmed_at?: string | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          is_free?: never;
          neighborhood?: string | null;
          origin: string;
          price_cents?: number | null;
          slug: string;
          starts_at: string;
          title: string;
          venue: string;
        };
        Update: {
          accessibility?: string | null;
          age_rating?: string;
          category?: string;
          confirmed_at?: string | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          is_free?: never;
          neighborhood?: string | null;
          origin?: string;
          price_cents?: number | null;
          slug?: string;
          starts_at?: string;
          title?: string;
          venue?: string;
        };
        Relationships: [];
      };
      event_submissions: {
        Row: {
          contact_email: string;
          created_at: string;
          id: string;
          payload: NonNullable<Json>;
          status: string;
        };
        Insert: {
          contact_email: string;
          created_at?: string;
          id?: string;
          payload: NonNullable<Json>;
          status?: string;
        };
        Update: {
          contact_email?: string;
          created_at?: string;
          id?: string;
          payload?: NonNullable<Json>;
          status?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          algo_version: string;
          anon_id: string | null;
          at: string;
          consent: NonNullable<Json>;
          content_ref: string | null;
          id: number;
          name: string;
          props: NonNullable<Json>;
          received_at: string;
          session: NonNullable<Json>;
          source_slug: string | null;
          user_id: string | null;
        };
        Insert: {
          algo_version: string;
          anon_id?: string | null;
          at: string;
          consent: NonNullable<Json>;
          content_ref?: string | null;
          id?: number;
          name: string;
          props?: NonNullable<Json>;
          received_at?: string;
          session: NonNullable<Json>;
          source_slug?: string | null;
          user_id?: string | null;
        };
        Update: {
          algo_version?: string;
          anon_id?: string | null;
          at?: string;
          consent?: NonNullable<Json>;
          content_ref?: string | null;
          id?: number;
          name?: string;
          props?: NonNullable<Json>;
          received_at?: string;
          session?: NonNullable<Json>;
          source_slug?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      events_default: {
        Row: {
          algo_version: string;
          anon_id: string | null;
          at: string;
          consent: NonNullable<Json>;
          content_ref: string | null;
          id: number;
          name: string;
          props: NonNullable<Json>;
          received_at: string;
          session: NonNullable<Json>;
          source_slug: string | null;
          user_id: string | null;
        };
        Insert: {
          algo_version: string;
          anon_id?: string | null;
          at: string;
          consent: NonNullable<Json>;
          content_ref?: string | null;
          id?: number;
          name: string;
          props?: NonNullable<Json>;
          received_at?: string;
          session: NonNullable<Json>;
          source_slug?: string | null;
          user_id?: string | null;
        };
        Update: {
          algo_version?: string;
          anon_id?: string | null;
          at?: string;
          consent?: NonNullable<Json>;
          content_ref?: string | null;
          id?: number;
          name?: string;
          props?: NonNullable<Json>;
          received_at?: string;
          session?: NonNullable<Json>;
          source_slug?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          enabled: boolean;
          key: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          enabled: boolean;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          created_at: string;
          owner_ref: string;
          target_id: string;
          target_kind: string;
        };
        Insert: {
          created_at?: string;
          owner_ref: string;
          target_id: string;
          target_kind: string;
        };
        Update: {
          created_at?: string;
          owner_ref?: string;
          target_id?: string;
          target_kind?: string;
        };
        Relationships: [];
      };
      ingest_runs: {
        Row: {
          finished_at: string | null;
          id: string;
          started_at: string;
          stats: NonNullable<Json>;
          status: string;
          window_start: string;
        };
        Insert: {
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          stats?: NonNullable<Json>;
          status?: string;
          window_start: string;
        };
        Update: {
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          stats?: NonNullable<Json>;
          status?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      media_assets: {
        Row: {
          allowed_use: string;
          captured_at: string;
          credit: string | null;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          license: string;
          license_until: string | null;
          origin_url: string | null;
          phash: number | null;
          risk: string;
          status: string;
          storage_path: string;
          width: number | null;
        };
        Insert: {
          allowed_use: string;
          captured_at?: string;
          credit?: string | null;
          height?: number | null;
          id?: string;
          kind: Database["public"]["Enums"]["media_kind"];
          license: string;
          license_until?: string | null;
          origin_url?: string | null;
          phash?: number | null;
          risk?: string;
          status?: string;
          storage_path: string;
          width?: number | null;
        };
        Update: {
          allowed_use?: string;
          captured_at?: string;
          credit?: string | null;
          height?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["media_kind"];
          license?: string;
          license_until?: string | null;
          origin_url?: string | null;
          phash?: number | null;
          risk?: string;
          status?: string;
          storage_path?: string;
          width?: number | null;
        };
        Relationships: [];
      };
      newsletter_subscriptions: {
        Row: {
          confirmed_at: string | null;
          email: string;
          list: string;
          token_hash: string;
          unsubscribed_at: string | null;
        };
        Insert: {
          confirmed_at?: string | null;
          email: string;
          list: string;
          token_hash: string;
          unsubscribed_at?: string | null;
        };
        Update: {
          confirmed_at?: string | null;
          email?: string;
          list?: string;
          token_hash?: string;
          unsubscribed_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          migrated_from_anon: string | null;
          neighborhood: string | null;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id: string;
          migrated_from_anon?: string | null;
          neighborhood?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          migrated_from_anon?: string | null;
          neighborhood?: string | null;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          bucket: string;
          hits: number;
          key_hash: string;
          window_start: string;
        };
        Insert: {
          bucket: string;
          hits?: number;
          key_hash: string;
          window_start: string;
        };
        Update: {
          bucket?: string;
          hits?: number;
          key_hash?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      raw_items: {
        Row: {
          fetched_at: string;
          id: string;
          payload: NonNullable<Json>;
          run_id: string;
          source_id: string;
          state: string;
        };
        Insert: {
          fetched_at?: string;
          id?: string;
          payload: NonNullable<Json>;
          run_id: string;
          source_id: string;
          state?: string;
        };
        Update: {
          fetched_at?: string;
          id?: string;
          payload?: NonNullable<Json>;
          run_id?: string;
          source_id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: "raw_items_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "ingest_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_items_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "public_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_items_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      rec_weights: {
        Row: {
          active: boolean;
          approved_by: string | null;
          cap: number;
          created_at: string;
          discovery_every: number;
          proposed_by: string;
          version: string;
          weights: NonNullable<Json>;
        };
        Insert: {
          active?: boolean;
          approved_by?: string | null;
          cap?: number;
          created_at?: string;
          discovery_every?: number;
          proposed_by: string;
          version: string;
          weights: NonNullable<Json>;
        };
        Update: {
          active?: boolean;
          approved_by?: string | null;
          cap?: number;
          created_at?: string;
          discovery_every?: number;
          proposed_by?: string;
          version?: string;
          weights?: NonNullable<Json>;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          contact_email: string | null;
          content_ref: string;
          created_at: string;
          due_at: string;
          id: string;
          kind: string;
          message: string | null;
          status: string;
        };
        Insert: {
          contact_email?: string | null;
          content_ref: string;
          created_at?: string;
          due_at?: string;
          id?: string;
          kind: string;
          message?: string | null;
          status?: string;
        };
        Update: {
          contact_email?: string | null;
          content_ref?: string;
          created_at?: string;
          due_at?: string;
          id?: string;
          kind?: string;
          message?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      rules: {
        Row: {
          active: boolean;
          approved_by: string | null;
          body: NonNullable<Json>;
          created_at: string;
          force_review: boolean;
          proposed_by: string;
          version: number;
        };
        Insert: {
          active?: boolean;
          approved_by?: string | null;
          body: NonNullable<Json>;
          created_at?: string;
          force_review?: boolean;
          proposed_by: string;
          version: number;
        };
        Update: {
          active?: boolean;
          approved_by?: string | null;
          body?: NonNullable<Json>;
          created_at?: string;
          force_review?: boolean;
          proposed_by?: string;
          version?: number;
        };
        Relationships: [];
      };
      saved_items: {
        Row: {
          content_ref: string;
          created_at: string;
          owner_ref: string;
          progress: number;
        };
        Insert: {
          content_ref: string;
          created_at?: string;
          owner_ref: string;
          progress?: number;
        };
        Update: {
          content_ref?: string;
          created_at?: string;
          owner_ref?: string;
          progress?: number;
        };
        Relationships: [];
      };
      sections: {
        Row: {
          autonomy_category: string;
          name: string;
          parent_slug: string | null;
          slug: string;
        };
        Insert: {
          autonomy_category: string;
          name: string;
          parent_slug?: string | null;
          slug: string;
        };
        Update: {
          autonomy_category?: string;
          name?: string;
          parent_slug?: string | null;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sections_parent_slug_fkey";
            columns: ["parent_slug"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["slug"];
          },
        ];
      };
      source_stats_daily: {
        Row: {
          avg_read_seconds: number | null;
          clicks: number;
          day: string;
          follows: number;
          locality: string | null;
          reads: number;
          returns: number;
          saves: number;
          sessions: number;
          shares: number;
          source_id: string;
        };
        Insert: {
          avg_read_seconds?: number | null;
          clicks?: number;
          day: string;
          follows?: number;
          locality?: string | null;
          reads?: number;
          returns?: number;
          saves?: number;
          sessions?: number;
          shares?: number;
          source_id: string;
        };
        Update: {
          avg_read_seconds?: number | null;
          clicks?: number;
          day?: string;
          follows?: number;
          locality?: string | null;
          reads?: number;
          returns?: number;
          saves?: number;
          sessions?: number;
          shares?: number;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_stats_daily_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "public_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_stats_daily_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      sources: {
        Row: {
          agreement_until: string | null;
          base_url: string;
          categories: string[];
          created_at: string;
          display_name: string | null;
          feed_url: string | null;
          frequency_minutes: number;
          id: string;
          image_policy: Database["public"]["Enums"]["image_policy"];
          kind: Database["public"]["Enums"]["source_kind"];
          last_error: string | null;
          last_fetched_at: string | null;
          locality: string;
          logo_path: string | null;
          may_be_sole_source: boolean;
          name: string;
          owner_id: string | null;
          priority: number;
          rate_limit_per_hour: number;
          rec_excluded: boolean;
          rec_local_highlight: boolean;
          rec_pinned: boolean;
          reliability: Database["public"]["Enums"]["source_reliability"];
          republish_policy: Database["public"]["Enums"]["republish_policy"];
          slug: string;
          status: Database["public"]["Enums"]["source_status"];
        };
        Insert: {
          agreement_until?: string | null;
          base_url: string;
          categories?: string[];
          created_at?: string;
          display_name?: string | null;
          feed_url?: string | null;
          frequency_minutes?: number;
          id?: string;
          image_policy?: Database["public"]["Enums"]["image_policy"];
          kind: Database["public"]["Enums"]["source_kind"];
          last_error?: string | null;
          last_fetched_at?: string | null;
          locality: string;
          logo_path?: string | null;
          may_be_sole_source?: boolean;
          name: string;
          owner_id?: string | null;
          priority?: number;
          rate_limit_per_hour?: number;
          rec_excluded?: boolean;
          rec_local_highlight?: boolean;
          rec_pinned?: boolean;
          reliability?: Database["public"]["Enums"]["source_reliability"];
          republish_policy?: Database["public"]["Enums"]["republish_policy"];
          slug: string;
          status?: Database["public"]["Enums"]["source_status"];
        };
        Update: {
          agreement_until?: string | null;
          base_url?: string;
          categories?: string[];
          created_at?: string;
          display_name?: string | null;
          feed_url?: string | null;
          frequency_minutes?: number;
          id?: string;
          image_policy?: Database["public"]["Enums"]["image_policy"];
          kind?: Database["public"]["Enums"]["source_kind"];
          last_error?: string | null;
          last_fetched_at?: string | null;
          locality?: string;
          logo_path?: string | null;
          may_be_sole_source?: boolean;
          name?: string;
          owner_id?: string | null;
          priority?: number;
          rate_limit_per_hour?: number;
          rec_excluded?: boolean;
          rec_local_highlight?: boolean;
          rec_pinned?: boolean;
          reliability?: Database["public"]["Enums"]["source_reliability"];
          republish_policy?: Database["public"]["Enums"]["republish_policy"];
          slug?: string;
          status?: Database["public"]["Enums"]["source_status"];
        };
        Relationships: [];
      };
      sponsored_campaigns: {
        Row: {
          advertiser: string;
          allowed_sections: string[];
          creative: NonNullable<Json>;
          ends_on: string;
          id: string;
          starts_on: string;
        };
        Insert: {
          advertiser: string;
          allowed_sections: string[];
          creative: NonNullable<Json>;
          ends_on: string;
          id?: string;
          starts_on: string;
        };
        Update: {
          advertiser?: string;
          allowed_sections?: string[];
          creative?: NonNullable<Json>;
          ends_on?: string;
          id?: string;
          starts_on?: string;
        };
        Relationships: [];
      };
      topics: {
        Row: {
          centroid: string | null;
          confidence: Database["public"]["Enums"]["confidence_level"];
          confidence_score: number;
          first_seen_at: string;
          id: string;
          section_slug: string | null;
          slug: string;
          state: Database["public"]["Enums"]["topic_state"];
          summary: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          centroid?: string | null;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          confidence_score?: number;
          first_seen_at?: string;
          id?: string;
          section_slug?: string | null;
          slug: string;
          state?: Database["public"]["Enums"]["topic_state"];
          summary?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          centroid?: string | null;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          confidence_score?: number;
          first_seen_at?: string;
          id?: string;
          section_slug?: string | null;
          slug?: string;
          state?: Database["public"]["Enums"]["topic_state"];
          summary?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "topics_section_slug_fkey";
            columns: ["section_slug"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["slug"];
          },
        ];
      };
      user_roles: {
        Row: {
          role: Database["public"]["Enums"]["app_role"];
          sections: string[];
          user_id: string;
        };
        Insert: {
          role: Database["public"]["Enums"]["app_role"];
          sections?: string[];
          user_id: string;
        };
        Update: {
          role?: Database["public"]["Enums"]["app_role"];
          sections?: string[];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      public_aggregated: {
        Row: {
          canonical_url: string | null;
          id: string | null;
          image_policy: Database["public"]["Enums"]["image_policy"] | null;
          image_url: string | null;
          locality: string | null;
          original_title: string | null;
          published_at: string | null;
          section_slug: string | null;
          source_id: string | null;
          source_name: string | null;
          source_slug: string | null;
          summary: string | null;
          topic_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "collected_items_section_slug_fkey";
            columns: ["section_slug"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "collected_items_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "public_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collected_items_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collected_items_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      public_bylines: {
        Row: {
          display_name: string | null;
          id: string | null;
        };
        Insert: {
          display_name?: string | null;
          id?: string | null;
        };
        Update: {
          display_name?: string | null;
          id?: string | null;
        };
        Relationships: [];
      };
      public_sources: {
        Row: {
          base_url: string | null;
          categories: string[] | null;
          id: string | null;
          image_policy: Database["public"]["Enums"]["image_policy"] | null;
          kind: Database["public"]["Enums"]["source_kind"] | null;
          last_fetched_at: string | null;
          locality: string | null;
          logo_path: string | null;
          name: string | null;
          rec_excluded: boolean | null;
          rec_local_highlight: boolean | null;
          rec_pinned: boolean | null;
          reliability: Database["public"]["Enums"]["source_reliability"] | null;
          republish_policy: Database["public"]["Enums"]["republish_policy"] | null;
          slug: string | null;
          status: Database["public"]["Enums"]["source_status"] | null;
        };
        Insert: {
          base_url?: string | null;
          categories?: string[] | null;
          id?: string | null;
          image_policy?: Database["public"]["Enums"]["image_policy"] | null;
          kind?: Database["public"]["Enums"]["source_kind"] | null;
          last_fetched_at?: string | null;
          locality?: string | null;
          logo_path?: string | null;
          name?: never;
          rec_excluded?: boolean | null;
          rec_local_highlight?: boolean | null;
          rec_pinned?: boolean | null;
          reliability?: Database["public"]["Enums"]["source_reliability"] | null;
          republish_policy?: Database["public"]["Enums"]["republish_policy"] | null;
          slug?: string | null;
          status?: Database["public"]["Enums"]["source_status"] | null;
        };
        Update: {
          base_url?: string | null;
          categories?: string[] | null;
          id?: string | null;
          image_policy?: Database["public"]["Enums"]["image_policy"] | null;
          kind?: Database["public"]["Enums"]["source_kind"] | null;
          last_fetched_at?: string | null;
          locality?: string | null;
          logo_path?: string | null;
          name?: never;
          rec_excluded?: boolean | null;
          rec_local_highlight?: boolean | null;
          rec_pinned?: boolean | null;
          reliability?: Database["public"]["Enums"]["source_reliability"] | null;
          republish_policy?: Database["public"]["Enums"]["republish_policy"] | null;
          slug?: string | null;
          status?: Database["public"]["Enums"]["source_status"] | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      article_is_public: { Args: { article: string }; Returns: boolean };
      article_owner: { Args: { article: string }; Returns: string };
      article_section: { Args: { article: string }; Returns: string };
      can_approve_media: { Args: { media: string; uid: string }; Returns: boolean };
      can_edit_section: { Args: { section: string; uid: string }; Returns: boolean };
      consume_role_admin_approval: { Args: { target: string }; Returns: boolean };
      critical_actor: { Args: Record<PropertyKey, never>; Returns: string };
      dearmor: { Args: { "": string }; Returns: string };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { "": string }; Returns: string };
      has_any_role: {
        Args: { roles: Database["public"]["Enums"]["app_role"][]; uid: string };
        Returns: boolean;
      };
      has_role: {
        Args: { role: Database["public"]["Enums"]["app_role"]; section?: string; uid: string };
        Returns: boolean;
      };
      hit_rate_limit: {
        Args: { p_bucket: string; p_key_hash: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      is_staff: { Args: { uid: string }; Returns: boolean };
      pgp_armor_headers: { Args: { "": string }; Returns: Record<string, unknown>[] };
      public_article_gone: { Args: { p_slug: string }; Returns: string };
      public_most_read: {
        Args: { p_hours?: number; p_limit?: number };
        Returns: {
          article_id: string;
          reads: number;
        }[];
      };
      two_person_error: { Args: { msg: string }; Returns: undefined };
      unaccent: { Args: { "": string }; Returns: string };
    };
    Enums: {
      app_role:
        | "admin"
        | "editor_chefe"
        | "editor"
        | "jornalista"
        | "revisor"
        | "operador_ia"
        | "analista"
        | "moderador"
        | "leitura";
      article_status:
        | "draft"
        | "in_review"
        | "changes_requested"
        | "approved"
        | "scheduled"
        | "published"
        | "updated"
        | "archived"
        | "unpublished";
      confidence_level: "alta" | "média" | "baixa";
      content_kind: "original" | "normalized" | "aggregated";
      image_policy: "none" | "with_agreement" | "licensed_only" | "reproduction";
      media_kind: "original" | "licensed" | "illustrative" | "ai_generated" | "reproduction";
      publish_mode: "human" | "auto";
      republish_policy: "link_only" | "summary_2_sentences";
      source_kind: "rss" | "sitemap" | "api" | "page" | "newsletter" | "social" | "events";
      source_reliability: "primary" | "verified" | "standard" | "low";
      source_status: "active" | "paused" | "degraded" | "blocked";
      topic_state: "em_apuracao" | "confirmado" | "corrigido" | "encerrado";
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "editor_chefe",
        "editor",
        "jornalista",
        "revisor",
        "operador_ia",
        "analista",
        "moderador",
        "leitura",
      ],
      article_status: [
        "draft",
        "in_review",
        "changes_requested",
        "approved",
        "scheduled",
        "published",
        "updated",
        "archived",
        "unpublished",
      ],
      confidence_level: ["alta", "média", "baixa"],
      content_kind: ["original", "normalized", "aggregated"],
      image_policy: ["none", "with_agreement", "licensed_only", "reproduction"],
      media_kind: ["original", "licensed", "illustrative", "ai_generated", "reproduction"],
      publish_mode: ["human", "auto"],
      republish_policy: ["link_only", "summary_2_sentences"],
      source_kind: ["rss", "sitemap", "api", "page", "newsletter", "social", "events"],
      source_reliability: ["primary", "verified", "standard", "low"],
      source_status: ["active", "paused", "degraded", "blocked"],
      topic_state: ["em_apuracao", "confirmado", "corrigido", "encerrado"],
    },
  },
} as const;
