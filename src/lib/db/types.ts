export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ad_creatives: {
        Row: {
          advertiser_id: string | null;
          created_at: string;
          created_by: string | null;
          creative: NonNullable<Json>;
          id: string;
          name: string;
          slot: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          advertiser_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          creative: NonNullable<Json>;
          id?: string;
          name: string;
          slot: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          advertiser_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          creative?: NonNullable<Json>;
          id?: string;
          name?: string;
          slot?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ad_creatives_advertiser_id_fkey";
            columns: ["advertiser_id"];
            isOneToOne: false;
            referencedRelation: "advertisers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_creatives_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_creatives_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_creatives_slot_fkey";
            columns: ["slot"];
            isOneToOne: false;
            referencedRelation: "ad_slots";
            referencedColumns: ["code"];
          },
        ];
      };
      ad_event_keys: {
        Row: {
          at: string;
          key: string;
        };
        Insert: {
          at?: string;
          key: string;
        };
        Update: {
          at?: string;
          key?: string;
        };
        Relationships: [];
      };
      ad_placements: {
        Row: {
          allowed_sections: string[];
          campaign_id: string | null;
          created_at: string;
          created_by: string | null;
          creative_id: string;
          ends_on: string;
          id: string;
          max_impressions_per_day: number | null;
          slot: string;
          starts_on: string;
          status: string;
          weight: number;
        };
        Insert: {
          allowed_sections?: string[];
          campaign_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          creative_id: string;
          ends_on: string;
          id?: string;
          max_impressions_per_day?: number | null;
          slot: string;
          starts_on: string;
          status?: string;
          weight?: number;
        };
        Update: {
          allowed_sections?: string[];
          campaign_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          creative_id?: string;
          ends_on?: string;
          id?: string;
          max_impressions_per_day?: number | null;
          slot?: string;
          starts_on?: string;
          status?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ad_placements_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "sponsored_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_placements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_placements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_placements_creative_id_fkey";
            columns: ["creative_id"];
            isOneToOne: false;
            referencedRelation: "ad_creatives";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_placements_slot_fkey";
            columns: ["slot"];
            isOneToOne: false;
            referencedRelation: "ad_slots";
            referencedColumns: ["code"];
          },
        ];
      };
      ad_slots: {
        Row: {
          code: string;
          enabled: boolean;
          formats: NonNullable<Json>;
          max_kb: number;
          name: string;
        };
        Insert: {
          code: string;
          enabled?: boolean;
          formats?: NonNullable<Json>;
          max_kb?: number;
          name: string;
        };
        Update: {
          code?: string;
          enabled?: boolean;
          formats?: NonNullable<Json>;
          max_kb?: number;
          name?: string;
        };
        Relationships: [];
      };
      ad_stats: {
        Row: {
          clicks: number;
          day: string;
          impressions: number;
          placement_id: string;
          section_slug: string;
          views: number;
        };
        Insert: {
          clicks?: number;
          day: string;
          impressions?: number;
          placement_id: string;
          section_slug?: string;
          views?: number;
        };
        Update: {
          clicks?: number;
          day?: string;
          impressions?: number;
          placement_id?: string;
          section_slug?: string;
          views?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ad_stats_placement_id_fkey";
            columns: ["placement_id"];
            isOneToOne: false;
            referencedRelation: "ad_placements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_stats_placement_id_fkey";
            columns: ["placement_id"];
            isOneToOne: false;
            referencedRelation: "public_ad_placements";
            referencedColumns: ["id"];
          },
        ];
      };
      advertisers: {
        Row: {
          contact_email: string | null;
          created_at: string;
          created_by: string | null;
          document: string | null;
          id: string;
          name: string;
        };
        Insert: {
          contact_email?: string | null;
          created_at?: string;
          created_by?: string | null;
          document?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          contact_email?: string | null;
          created_at?: string;
          created_by?: string | null;
          document?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      agenda_collect_runs: {
        Row: {
          finished_at: string | null;
          id: string;
          report: Json | null;
          started_at: string;
          trigger: string;
        };
        Insert: {
          finished_at?: string | null;
          id?: string;
          report?: Json | null;
          started_at?: string;
          trigger?: string;
        };
        Update: {
          finished_at?: string | null;
          id?: string;
          report?: Json | null;
          started_at?: string;
          trigger?: string;
        };
        Relationships: [];
      };
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
          created_at: string;
          frequency: string;
          id: string;
          owner_ref: string;
          target_id: string;
          target_kind: string;
        };
        Insert: {
          active?: boolean;
          channel: string;
          created_at?: string;
          frequency: string;
          id?: string;
          owner_ref: string;
          target_id: string;
          target_kind: string;
        };
        Update: {
          active?: boolean;
          channel?: string;
          created_at?: string;
          frequency?: string;
          id?: string;
          owner_ref?: string;
          target_id?: string;
          target_kind?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: NonNullable<Json>;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      approvals: {
        Row: {
          approved_by: string | null;
          content_hash: string | null;
          created_at: string;
          decided_at: string | null;
          id: string;
          justification: string;
          kind: string;
          requested_by: string;
          status: string;
          target_ref: string;
          approval_assert_content: undefined | null;
        };
        Insert: {
          approved_by?: string | null;
          content_hash?: string | null;
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          justification: string;
          kind: string;
          requested_by: string;
          status?: string;
          target_ref: string;
        };
        Update: {
          approved_by?: string | null;
          content_hash?: string | null;
          created_at?: string;
          decided_at?: string | null;
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
          alt: string | null;
          article_id: string;
          caption: string | null;
          chosen_at: string;
          chosen_by: string;
          credit_shown: string | null;
          media_id: string;
          position: number | null;
          rationale: string;
          role: string;
        };
        Insert: {
          alt?: string | null;
          article_id: string;
          caption?: string | null;
          chosen_at?: string;
          chosen_by: string;
          credit_shown?: string | null;
          media_id: string;
          position?: number | null;
          rationale: string;
          role?: string;
        };
        Update: {
          alt?: string | null;
          article_id?: string;
          caption?: string | null;
          chosen_at?: string;
          chosen_by?: string;
          credit_shown?: string | null;
          media_id?: string;
          position?: number | null;
          rationale?: string;
          role?: string;
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
            foreignKeyName: "article_media_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "studio_queue";
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
            foreignKeyName: "article_sources_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "studio_queue";
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
      article_suggestions: {
        Row: {
          agent_id: string;
          article_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          field: string;
          id: string;
          prompt_version: number | null;
          rationale: string | null;
          status: string;
          value: string;
        };
        Insert: {
          agent_id: string;
          article_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          field: string;
          id?: string;
          prompt_version?: number | null;
          rationale?: string | null;
          status?: string;
          value: string;
        };
        Update: {
          agent_id?: string;
          article_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          field?: string;
          id?: string;
          prompt_version?: number | null;
          rationale?: string | null;
          status?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_suggestions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_suggestions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "studio_queue";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_suggestions_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_suggestions_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
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
          {
            foreignKeyName: "article_versions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "studio_queue";
            referencedColumns: ["id"];
          },
        ];
      };
      articles: {
        Row: {
          agent_id: string | null;
          ai_fallback: boolean;
          ai_summary: string[] | null;
          ai_summary_reviewed_by: string | null;
          assignee_id: string | null;
          author_id: string | null;
          body: NonNullable<Json>;
          confidence: Database["public"]["Enums"]["confidence_level"];
          confidence_score: number;
          dek: string;
          due_at: string | null;
          embedding: string | null;
          field_origins: NonNullable<Json>;
          gone_reason: string | null;
          id: string;
          kind: Database["public"]["Enums"]["content_kind"];
          national_commotion: boolean;
          neighborhoods: string[];
          news_scope: string | null;
          publish_destinations: string[];
          short_reason: string | null;
          publish_mode: Database["public"]["Enums"]["publish_mode"] | null;
          published_at: string | null;
          review_banner: boolean;
          review_reason: string | null;
          risk_level: number | null;
          rules_version: number | null;
          scheduled_for: string | null;
          section_slug: string;
          seo_description: string | null;
          seo_title: string | null;
          slug: string;
          sponsored: boolean;
          status: Database["public"]["Enums"]["article_status"];
          tags: string[];
          title: string;
          topic_id: string | null;
          tsv: unknown;
          updated_at: string;
          urgent: boolean;
          studio_snapshot: Json | null;
        };
        Insert: {
          agent_id?: string | null;
          ai_fallback?: boolean;
          ai_summary?: string[] | null;
          ai_summary_reviewed_by?: string | null;
          assignee_id?: string | null;
          author_id?: string | null;
          body: NonNullable<Json>;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          confidence_score?: number;
          dek: string;
          due_at?: string | null;
          embedding?: string | null;
          field_origins?: NonNullable<Json>;
          gone_reason?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["content_kind"];
          national_commotion?: boolean;
          neighborhoods?: string[];
          news_scope?: string | null;
          publish_destinations?: string[];
          short_reason?: string | null;
          publish_mode?: Database["public"]["Enums"]["publish_mode"] | null;
          published_at?: string | null;
          review_banner?: boolean;
          review_reason?: string | null;
          risk_level?: number | null;
          rules_version?: number | null;
          scheduled_for?: string | null;
          section_slug: string;
          seo_description?: string | null;
          seo_title?: string | null;
          slug: string;
          sponsored?: boolean;
          status?: Database["public"]["Enums"]["article_status"];
          tags?: string[];
          title: string;
          topic_id?: string | null;
          tsv?: unknown;
          updated_at?: string;
          urgent?: boolean;
        };
        Update: {
          agent_id?: string | null;
          ai_fallback?: boolean;
          ai_summary?: string[] | null;
          ai_summary_reviewed_by?: string | null;
          assignee_id?: string | null;
          author_id?: string | null;
          body?: NonNullable<Json>;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          confidence_score?: number;
          dek?: string;
          due_at?: string | null;
          embedding?: string | null;
          field_origins?: NonNullable<Json>;
          gone_reason?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["content_kind"];
          national_commotion?: boolean;
          neighborhoods?: string[];
          news_scope?: string | null;
          publish_destinations?: string[];
          short_reason?: string | null;
          publish_mode?: Database["public"]["Enums"]["publish_mode"] | null;
          published_at?: string | null;
          review_banner?: boolean;
          review_reason?: string | null;
          risk_level?: number | null;
          rules_version?: number | null;
          scheduled_for?: string | null;
          section_slug?: string;
          seo_description?: string | null;
          seo_title?: string | null;
          slug?: string;
          sponsored?: boolean;
          status?: Database["public"]["Enums"]["article_status"];
          tags?: string[];
          title?: string;
          topic_id?: string | null;
          tsv?: unknown;
          updated_at?: string;
          urgent?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "articles_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
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
          source_text: string | null;
          id: string;
          image_url: string | null;
          locality: string | null;
          neighborhood: string | null;
          original_title: string;
          published_at: string | null;
          quarantine_reason: string | null;
          quarantined_at: string | null;
          raw_id: string | null;
          relevance: number | null;
          section_slug: string | null;
          sensitive: boolean | null;
          simhash: number | null;
          source_id: string;
          summary: string | null;
          tags: string[];
          topic_id: string | null;
          tsv: unknown;
        };
        Insert: {
          author?: string | null;
          canonical_url: string;
          created_at?: string;
          duplicate_of?: string | null;
          embedding?: string | null;
          excerpt?: string | null;
          source_text?: string | null;
          id?: string;
          image_url?: string | null;
          locality?: string | null;
          neighborhood?: string | null;
          original_title: string;
          published_at?: string | null;
          quarantine_reason?: string | null;
          quarantined_at?: string | null;
          raw_id?: string | null;
          relevance?: number | null;
          section_slug?: string | null;
          sensitive?: boolean | null;
          simhash?: number | null;
          source_id: string;
          summary?: string | null;
          tags?: string[];
          topic_id?: string | null;
          tsv?: unknown;
        };
        Update: {
          author?: string | null;
          canonical_url?: string;
          created_at?: string;
          duplicate_of?: string | null;
          embedding?: string | null;
          excerpt?: string | null;
          source_text?: string | null;
          id?: string;
          image_url?: string | null;
          locality?: string | null;
          neighborhood?: string | null;
          original_title?: string;
          published_at?: string | null;
          quarantine_reason?: string | null;
          quarantined_at?: string | null;
          raw_id?: string | null;
          relevance?: number | null;
          section_slug?: string | null;
          sensitive?: boolean | null;
          simhash?: number | null;
          source_id?: string;
          summary?: string | null;
          tags?: string[];
          topic_id?: string | null;
          tsv?: unknown;
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
          updated_at: string;
        };
        Insert: {
          curator_id?: string | null;
          description: string;
          id?: string;
          is_editorial?: boolean;
          owner_ref?: string | null;
          slug: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          curator_id?: string | null;
          description?: string;
          id?: string;
          is_editorial?: boolean;
          owner_ref?: string | null;
          slug?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      corrections: {
        Row: {
          article_id: string;
          created_at: string;
          due_at: string;
          fields: string[];
          handled_by: string | null;
          id: string;
          kind: string;
          notified: number;
          public_note: string;
          published_at: string | null;
          report_id: string | null;
          requested_by: string;
          status: string;
        };
        Insert: {
          article_id: string;
          created_at?: string;
          due_at?: string;
          fields?: string[];
          handled_by?: string | null;
          id?: string;
          kind: string;
          notified?: number;
          public_note: string;
          published_at?: string | null;
          report_id?: string | null;
          requested_by: string;
          status?: string;
        };
        Update: {
          article_id?: string;
          created_at?: string;
          due_at?: string;
          fields?: string[];
          handled_by?: string | null;
          id?: string;
          kind?: string;
          notified?: number;
          public_note?: string;
          published_at?: string | null;
          report_id?: string | null;
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
          {
            foreignKeyName: "corrections_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "studio_queue";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "corrections_handled_by_fkey";
            columns: ["handled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "corrections_handled_by_fkey";
            columns: ["handled_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "corrections_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
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
      eval_cases: {
        Row: {
          active: boolean;
          agent_id: string;
          body: NonNullable<Json>;
          case_key: string;
          created_at: string;
          created_by: string | null;
          id: string;
        };
        Insert: {
          active?: boolean;
          agent_id: string;
          body: NonNullable<Json>;
          case_key: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
        };
        Update: {
          active?: boolean;
          agent_id?: string;
          body?: NonNullable<Json>;
          case_key?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eval_cases_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eval_cases_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      eval_runs: {
        Row: {
          agent_id: string;
          cases: number;
          created_at: string;
          created_by: string | null;
          gate_failures: string[];
          id: string;
          metrics: NonNullable<Json>;
          model_id: string | null;
          prompt_version: number | null;
          provider: string;
          results: NonNullable<Json>;
          trigger: string;
        };
        Insert: {
          agent_id: string;
          cases: number;
          created_at?: string;
          created_by?: string | null;
          gate_failures?: string[];
          id?: string;
          metrics: NonNullable<Json>;
          model_id?: string | null;
          prompt_version?: number | null;
          provider: string;
          results?: NonNullable<Json>;
          trigger?: string;
        };
        Update: {
          agent_id?: string;
          cases?: number;
          created_at?: string;
          created_by?: string | null;
          gate_failures?: string[];
          id?: string;
          metrics?: NonNullable<Json>;
          model_id?: string | null;
          prompt_version?: number | null;
          provider?: string;
          results?: NonNullable<Json>;
          trigger?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eval_runs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eval_runs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      event_listings: {
        Row: {
          accessibility: string | null;
          age_rating: string;
          category: string;
          collected_at: string | null;
          confirmed_at: string | null;
          dedupe_key: string | null;
          description: string | null;
          ends_at: string | null;
          id: string;
          is_free: boolean | null;
          neighborhood: string | null;
          origin: string;
          price_cents: number | null;
          price_unknown: boolean;
          slug: string;
          source_id: string | null;
          source_url: string | null;
          starts_at: string;
          title: string;
          tsv: unknown;
          venue: string;
        };
        Insert: {
          accessibility?: string | null;
          age_rating?: string;
          category: string;
          collected_at?: string | null;
          confirmed_at?: string | null;
          dedupe_key?: string | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          is_free?: never;
          neighborhood?: string | null;
          origin: string;
          price_cents?: number | null;
          price_unknown?: boolean;
          slug: string;
          source_id?: string | null;
          source_url?: string | null;
          starts_at: string;
          title: string;
          tsv?: unknown;
          venue: string;
        };
        Update: {
          accessibility?: string | null;
          age_rating?: string;
          category?: string;
          collected_at?: string | null;
          confirmed_at?: string | null;
          dedupe_key?: string | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          is_free?: never;
          neighborhood?: string | null;
          origin?: string;
          price_cents?: number | null;
          price_unknown?: boolean;
          slug?: string;
          source_id?: string | null;
          source_url?: string | null;
          starts_at?: string;
          title?: string;
          tsv?: unknown;
          venue?: string;
        };
        Relationships: [];
      };
      event_submissions: {
        Row: {
          contact_email: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_reason: string | null;
          event_id: string | null;
          id: string;
          payload: NonNullable<Json>;
          status: string;
        };
        Insert: {
          contact_email: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_reason?: string | null;
          event_id?: string | null;
          id?: string;
          payload: NonNullable<Json>;
          status?: string;
        };
        Update: {
          contact_email?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_reason?: string | null;
          event_id?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_submissions_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_submissions_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_submissions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event_listings";
            referencedColumns: ["id"];
          },
        ];
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
      forced_publish_jobs: {
        Row: {
          batches: NonNullable<Json>;
          batches_done: number[];
          done: number;
          excluded: NonNullable<Json>;
          failed: number;
          failures: NonNullable<Json>;
          finished_at: string | null;
          id: string;
          requested_at: string;
          requested_by: string;
          risks: NonNullable<Json>;
          status: string;
          total: number;
        };
        Insert: {
          batches?: NonNullable<Json>;
          batches_done?: number[];
          done?: number;
          excluded?: NonNullable<Json>;
          failed?: number;
          failures?: NonNullable<Json>;
          finished_at?: string | null;
          id?: string;
          requested_at?: string;
          requested_by: string;
          risks?: NonNullable<Json>;
          status?: string;
          total: number;
        };
        Update: {
          batches?: NonNullable<Json>;
          batches_done?: number[];
          done?: number;
          excluded?: NonNullable<Json>;
          failed?: number;
          failures?: NonNullable<Json>;
          finished_at?: string | null;
          id?: string;
          requested_at?: string;
          requested_by?: string;
          risks?: NonNullable<Json>;
          status?: string;
          total?: number;
        };
        Relationships: [];
      };
      featured_image_requests: {
        Row: {
          article_id: string;
          requested_at: string;
        };
        Insert: {
          article_id: string;
          requested_at?: string;
        };
        Update: {
          article_id?: string;
          requested_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "featured_image_requests_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: true;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      featured_items: {
        Row: {
          article_id: string;
          created_at: string;
          created_by: string | null;
          ends_at: string | null;
          ended_at: string | null;
          id: string;
          kind: string;
          note: string;
          position: number;
          section_slug: string | null;
          slot_key: string;
          starts_at: string;
        };
        Insert: {
          article_id: string;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          ended_at?: string | null;
          id?: string;
          kind?: string;
          note?: string;
          position?: number;
          section_slug?: string | null;
          slot_key: string;
          starts_at?: string;
        };
        Update: {
          article_id?: string;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          ended_at?: string | null;
          id?: string;
          kind?: string;
          note?: string;
          position?: number;
          section_slug?: string | null;
          slot_key?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "featured_items_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "featured_items_slot_key_fkey";
            columns: ["slot_key"];
            isOneToOne: false;
            referencedRelation: "featured_slots";
            referencedColumns: ["key"];
          },
        ];
      };
      featured_slots: {
        Row: {
          capacity: number;
          key: string;
          label: string;
          page: string;
          position: number;
        };
        Insert: {
          capacity: number;
          key: string;
          label: string;
          page: string;
          position?: number;
        };
        Update: {
          capacity?: number;
          key?: string;
          label?: string;
          page?: string;
          position?: number;
        };
        Relationships: [];
      };
      home_layouts: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          modules: NonNullable<Json>;
          note: string;
          published_at: string | null;
          published_by: string | null;
          status: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          modules: NonNullable<Json>;
          note?: string;
          published_at?: string | null;
          published_by?: string | null;
          status?: string;
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          modules?: NonNullable<Json>;
          note?: string;
          published_at?: string | null;
          published_by?: string | null;
          status?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "home_layouts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "home_layouts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "home_layouts_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "home_layouts_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      ingest_runs: {
        Row: {
          finished_at: string | null;
          id: string;
          started_at: string;
          stats: NonNullable<Json>;
          status: string;
          trigger: string;
          window_start: string;
        };
        Insert: {
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          stats?: NonNullable<Json>;
          status?: string;
          trigger?: string;
          window_start: string;
        };
        Update: {
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          stats?: NonNullable<Json>;
          status?: string;
          trigger?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      integration_keys: {
        Row: {
          integration: string;
          key: string;
          label: string;
          notes: string;
          rotate_every_days: number;
          rotated_at: string | null;
          rotated_by: string | null;
        };
        Insert: {
          integration: string;
          key: string;
          label: string;
          notes?: string;
          rotate_every_days?: number;
          rotated_at?: string | null;
          rotated_by?: string | null;
        };
        Update: {
          integration?: string;
          key?: string;
          label?: string;
          notes?: string;
          rotate_every_days?: number;
          rotated_at?: string | null;
          rotated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "integration_keys_rotated_by_fkey";
            columns: ["rotated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "integration_keys_rotated_by_fkey";
            columns: ["rotated_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          dedupe_key: string;
          enqueued_at: string;
          id: number;
          last_error: string | null;
          message: NonNullable<Json>;
          queue: string;
          read_ct: number;
          visible_at: string;
        };
        Insert: {
          dedupe_key: string;
          enqueued_at?: string;
          id?: number;
          last_error?: string | null;
          message: NonNullable<Json>;
          queue: string;
          read_ct?: number;
          visible_at?: string;
        };
        Update: {
          dedupe_key?: string;
          enqueued_at?: string;
          id?: number;
          last_error?: string | null;
          message?: NonNullable<Json>;
          queue?: string;
          read_ct?: number;
          visible_at?: string;
        };
        Relationships: [];
      };
      media_assets: {
        Row: {
          allowed_use: string;
          archived_at: string | null;
          author: string | null;
          captured_at: string;
          content_type: string | null;
          credit: string | null;
          disclaimer: string | null;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          license: string;
          license_until: string | null;
          origin_url: string | null;
          page_url: string | null;
          phash: number | null;
          provenance: NonNullable<Json>;
          removal_reason: string | null;
          removed_at: string | null;
          risk: string;
          rights_status: Database["public"]["Enums"]["media_rights_status"] | null;
          sha256: string | null;
          source_id: string | null;
          source_name: string | null;
          status: string;
          storage_path: string;
          tags: string[];
          updated_at: string;
          usage_scope: string[];
          width: number | null;
        };
        Insert: {
          allowed_use: string;
          archived_at?: string | null;
          author?: string | null;
          captured_at?: string;
          content_type?: string | null;
          credit?: string | null;
          disclaimer?: string | null;
          height?: number | null;
          id?: string;
          kind: Database["public"]["Enums"]["media_kind"];
          license: string;
          license_until?: string | null;
          origin_url?: string | null;
          page_url?: string | null;
          phash?: number | null;
          provenance?: NonNullable<Json>;
          removal_reason?: string | null;
          removed_at?: string | null;
          risk?: string;
          rights_status?: Database["public"]["Enums"]["media_rights_status"] | null;
          sha256?: string | null;
          source_id?: string | null;
          source_name?: string | null;
          status?: string;
          storage_path: string;
          tags?: string[];
          updated_at?: string;
          usage_scope?: string[];
          width?: number | null;
        };
        Update: {
          allowed_use?: string;
          archived_at?: string | null;
          author?: string | null;
          captured_at?: string;
          content_type?: string | null;
          credit?: string | null;
          disclaimer?: string | null;
          height?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["media_kind"];
          license?: string;
          license_until?: string | null;
          origin_url?: string | null;
          page_url?: string | null;
          phash?: number | null;
          provenance?: NonNullable<Json>;
          removal_reason?: string | null;
          removed_at?: string | null;
          risk?: string;
          rights_status?: Database["public"]["Enums"]["media_rights_status"] | null;
          sha256?: string | null;
          source_id?: string | null;
          source_name?: string | null;
          status?: string;
          storage_path?: string;
          tags?: string[];
          updated_at?: string;
          usage_scope?: string[];
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "public_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_assets_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
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
      notifications: {
        Row: {
          body: string;
          channel: string;
          created_at: string;
          dedupe_key: string;
          id: number;
          kind: string;
          object_ref: string;
          read_at: string | null;
          read_by: string | null;
          severity: string;
          status: string;
          title: string;
        };
        Insert: {
          body: string;
          channel: string;
          created_at?: string;
          dedupe_key: string;
          id?: number;
          kind: string;
          object_ref: string;
          read_at?: string | null;
          read_by?: string | null;
          severity: string;
          status?: string;
          title: string;
        };
        Update: {
          body?: string;
          channel?: string;
          created_at?: string;
          dedupe_key?: string;
          id?: number;
          kind?: string;
          object_ref?: string;
          read_at?: string | null;
          read_by?: string | null;
          severity?: string;
          status?: string;
          title?: string;
        };
        Relationships: [];
      };
      pipeline_events: {
        Row: {
          at: string;
          details: NonNullable<Json>;
          id: number;
          item_ref: string | null;
          level: string;
          message: string;
          run_id: string | null;
          step: string;
        };
        Insert: {
          at?: string;
          details?: NonNullable<Json>;
          id?: number;
          item_ref?: string | null;
          level: string;
          message: string;
          run_id?: string | null;
          step: string;
        };
        Update: {
          at?: string;
          details?: NonNullable<Json>;
          id?: number;
          item_ref?: string | null;
          level?: string;
          message?: string;
          run_id?: string | null;
          step?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_events_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "ingest_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_quarantine: {
        Row: {
          dedupe_key: string;
          error: string;
          id: number;
          message: NonNullable<Json>;
          msg_id: number;
          quarantined_at: string;
          queue: string;
          read_ct: number;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          dedupe_key: string;
          error: string;
          id?: number;
          message: NonNullable<Json>;
          msg_id: number;
          quarantined_at?: string;
          queue: string;
          read_ct: number;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          dedupe_key?: string;
          error?: string;
          id?: number;
          message?: NonNullable<Json>;
          msg_id?: number;
          quarantined_at?: string;
          queue?: string;
          read_ct?: number;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [];
      };
      places: {
        Row: {
          active: boolean;
          in_phrase: string;
          kind: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          in_phrase: string;
          kind: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          in_phrase?: string;
          kind?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      privacy_requests: {
        Row: {
          created_at: string;
          created_by: string | null;
          decided_at: string | null;
          decided_by: string | null;
          due_at: string;
          email: string;
          id: string;
          kind: string;
          notes: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          due_at?: string;
          email: string;
          id?: string;
          kind: string;
          notes?: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          due_at?: string;
          email?: string;
          id?: string;
          kind?: string;
          notes?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "privacy_requests_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "privacy_requests_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "privacy_requests_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "privacy_requests_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          delete_requested_at: string | null;
          display_name: string;
          id: string;
          neighborhood: string | null;
        };
        Insert: {
          created_at?: string;
          delete_requested_at?: string | null;
          display_name: string;
          id: string;
          neighborhood?: string | null;
        };
        Update: {
          created_at?: string;
          delete_requested_at?: string | null;
          display_name?: string;
          id?: string;
          neighborhood?: string | null;
        };
        Relationships: [];
      };
      push_batches: {
        Row: {
          after_id: string | null;
          batch_no: number;
          send_id: string;
          status: string;
          until_id: string;
        };
        Insert: {
          after_id?: string | null;
          batch_no: number;
          send_id: string;
          status?: string;
          until_id: string;
        };
        Update: {
          after_id?: string | null;
          batch_no?: number;
          send_id?: string;
          status?: string;
          until_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_batches_send_id_fkey";
            columns: ["send_id"];
            isOneToOne: false;
            referencedRelation: "push_sends";
            referencedColumns: ["id"];
          },
        ];
      };
      push_deliveries: {
        Row: {
          article_id: string;
          attempts: number;
          browser: string | null;
          created_at: string;
          device_class: string | null;
          error_code: string | null;
          http_status: number | null;
          id: number;
          measurable: boolean;
          not_before: string | null;
          send_id: string;
          sent_at: string | null;
          skip_reason: string | null;
          status: string;
          subscription_id: string | null;
        };
        Insert: {
          article_id: string;
          attempts?: number;
          browser?: string | null;
          created_at?: string;
          device_class?: string | null;
          error_code?: string | null;
          http_status?: number | null;
          id?: number;
          measurable?: boolean;
          not_before?: string | null;
          send_id: string;
          sent_at?: string | null;
          skip_reason?: string | null;
          status: string;
          subscription_id?: string | null;
        };
        Update: {
          article_id?: string;
          attempts?: number;
          browser?: string | null;
          created_at?: string;
          device_class?: string | null;
          error_code?: string | null;
          http_status?: number | null;
          id?: number;
          measurable?: boolean;
          not_before?: string | null;
          send_id?: string;
          sent_at?: string | null;
          skip_reason?: string | null;
          status?: string;
          subscription_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "push_deliveries_send_id_fkey";
            columns: ["send_id"];
            isOneToOne: false;
            referencedRelation: "push_sends";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_deliveries_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "my_push_subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_deliveries_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "push_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      push_funnel_daily: {
        Row: {
          browser: string;
          day: string;
          device_class: string;
          n: number;
          stage: string;
        };
        Insert: {
          browser: string;
          day: string;
          device_class: string;
          n?: number;
          stage: string;
        };
        Update: {
          browser?: string;
          day?: string;
          device_class?: string;
          n?: number;
          stage?: string;
        };
        Relationships: [];
      };
      push_send_counters: {
        Row: {
          browser: string;
          clicked: number;
          delivered: number;
          device_class: string;
          send_id: string;
        };
        Insert: {
          browser: string;
          clicked?: number;
          delivered?: number;
          device_class: string;
          send_id: string;
        };
        Update: {
          browser?: string;
          clicked?: number;
          delivered?: number;
          device_class?: string;
          send_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_send_counters_send_id_fkey";
            columns: ["send_id"];
            isOneToOne: false;
            referencedRelation: "push_sends";
            referencedColumns: ["id"];
          },
        ];
      };
      push_sends: {
        Row: {
          accepted_n: number;
          approval_id: string | null;
          approved_at: string | null;
          approved_by: string | null;
          article_id: string;
          audience: NonNullable<Json>;
          batches_done: number;
          batches_total: number;
          body: string;
          created_at: string;
          failed_n: number;
          finished_at: string | null;
          id: string;
          justification: string | null;
          kind: string;
          not_before: string | null;
          origin_label: string;
          queued_n: number;
          removed_n: number;
          requested_by: string | null;
          scheduled_at: string | null;
          sent_measurable_n: number;
          skipped_duplicate_n: number;
          skipped_limit_n: number;
          skipped_pref_n: number;
          skipped_quiet_n: number;
          started_at: string | null;
          status: string;
          status_reason: string | null;
          tag: string;
          targets_n: number;
          title: string;
          url: string;
          version: number;
        };
        Insert: {
          accepted_n?: number;
          approval_id?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          article_id: string;
          audience?: NonNullable<Json>;
          batches_done?: number;
          batches_total?: number;
          body: string;
          created_at?: string;
          failed_n?: number;
          finished_at?: string | null;
          id?: string;
          justification?: string | null;
          kind: string;
          not_before?: string | null;
          origin_label: string;
          queued_n?: number;
          removed_n?: number;
          requested_by?: string | null;
          scheduled_at?: string | null;
          sent_measurable_n?: number;
          skipped_duplicate_n?: number;
          skipped_limit_n?: number;
          skipped_pref_n?: number;
          skipped_quiet_n?: number;
          started_at?: string | null;
          status?: string;
          status_reason?: string | null;
          tag: string;
          targets_n?: number;
          title: string;
          url: string;
          version?: number;
        };
        Update: {
          accepted_n?: number;
          approval_id?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          article_id?: string;
          audience?: NonNullable<Json>;
          batches_done?: number;
          batches_total?: number;
          body?: string;
          created_at?: string;
          failed_n?: number;
          finished_at?: string | null;
          id?: string;
          justification?: string | null;
          kind?: string;
          not_before?: string | null;
          origin_label?: string;
          queued_n?: number;
          removed_n?: number;
          requested_by?: string | null;
          scheduled_at?: string | null;
          sent_measurable_n?: number;
          skipped_duplicate_n?: number;
          skipped_limit_n?: number;
          skipped_pref_n?: number;
          skipped_quiet_n?: number;
          started_at?: string | null;
          status?: string;
          status_reason?: string | null;
          tag?: string;
          targets_n?: number;
          title?: string;
          url?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "push_sends_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_sends_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "studio_queue";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_sends_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_sends_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_notifications: {
        Row: {
          audience: Json;
          body: string;
          created_at: string;
          dedupe_key: string;
          expires_at: string | null;
          href: string;
          id: string;
          kind: string;
          object_ref: string | null;
          push_sent_at: string | null;
          severity: string;
          title: string;
        };
        Insert: {
          audience?: Json;
          body?: string;
          created_at?: string;
          dedupe_key: string;
          expires_at?: string | null;
          href: string;
          id?: string;
          kind: string;
          object_ref?: string | null;
          push_sent_at?: string | null;
          severity?: string;
          title: string;
        };
        Update: {
          audience?: Json;
          body?: string;
          created_at?: string;
          dedupe_key?: string;
          expires_at?: string | null;
          href?: string;
          id?: string;
          kind?: string;
          object_ref?: string | null;
          push_sent_at?: string | null;
          severity?: string;
          title?: string;
        };
        Relationships: [];
      };
      studio_notification_reads: {
        Row: {
          dismissed_at: string | null;
          notification_id: string;
          read_at: string | null;
          user_id: string;
        };
        Insert: {
          dismissed_at?: string | null;
          notification_id: string;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          dismissed_at?: string | null;
          notification_id?: string;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      publish_breaker: {
        Row: {
          ai_failures_per_hour: number;
          daily_limit: number;
          hourly_limit: number;
          id: boolean;
          reports_per_hour: number;
          reset_at: string | null;
          reset_by: string | null;
          trip_detail: Json;
          trip_reason: string | null;
          tripped_at: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          ai_failures_per_hour?: number;
          daily_limit?: number;
          hourly_limit?: number;
          id?: boolean;
          reports_per_hour?: number;
          reset_at?: string | null;
          reset_by?: string | null;
          trip_detail?: Json;
          trip_reason?: string | null;
          tripped_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          ai_failures_per_hour?: number;
          daily_limit?: number;
          hourly_limit?: number;
          id?: boolean;
          reports_per_hour?: number;
          reset_at?: string | null;
          reset_by?: string | null;
          trip_detail?: Json;
          trip_reason?: string | null;
          tripped_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          browser: string | null;
          consecutive_failures: number;
          created_at: string;
          daily_limit: number;
          day_count: number;
          day_key: string | null;
          device_class: string | null;
          endpoint: string;
          endpoint_host: string | null;
          id: string;
          installed: boolean;
          last_seen_at: string;
          last_success_at: string | null;
          manage_token_hash: string;
          metrics_consent: boolean;
          p256dh: string;
          platform: string | null;
          quiet_end: number;
          quiet_start: number;
          targets: string[];
          staff_alerts: boolean;
          user_id: string | null;
          want_follow: boolean;
          want_highlight: boolean;
          want_urgent: boolean;
        };
        Insert: {
          auth: string;
          browser?: string | null;
          consecutive_failures?: number;
          created_at?: string;
          daily_limit?: number;
          day_count?: number;
          day_key?: string | null;
          device_class?: string | null;
          endpoint: string;
          endpoint_host?: string | null;
          id?: string;
          installed?: boolean;
          last_seen_at?: string;
          last_success_at?: string | null;
          manage_token_hash: string;
          metrics_consent?: boolean;
          p256dh: string;
          platform?: string | null;
          quiet_end?: number;
          quiet_start?: number;
          targets?: string[];
          staff_alerts?: boolean;
          user_id?: string | null;
          want_follow?: boolean;
          want_highlight?: boolean;
          want_urgent?: boolean;
        };
        Update: {
          auth?: string;
          browser?: string | null;
          consecutive_failures?: number;
          created_at?: string;
          daily_limit?: number;
          day_count?: number;
          day_key?: string | null;
          device_class?: string | null;
          endpoint?: string;
          endpoint_host?: string | null;
          id?: string;
          installed?: boolean;
          last_seen_at?: string;
          last_success_at?: string | null;
          manage_token_hash?: string;
          metrics_consent?: boolean;
          p256dh?: string;
          platform?: string | null;
          quiet_end?: number;
          quiet_start?: number;
          targets?: string[];
          staff_alerts?: boolean;
          user_id?: string | null;
          want_follow?: boolean;
          want_highlight?: boolean;
          want_urgent?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
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
          entries: Json | null;
          error: string | null;
          fetched_at: string;
          id: string;
          payload: NonNullable<Json>;
          run_id: string;
          source_id: string;
          state: string;
        };
        Insert: {
          entries?: Json | null;
          error?: string | null;
          fetched_at?: string;
          id?: string;
          payload: NonNullable<Json>;
          run_id: string;
          source_id: string;
          state?: string;
        };
        Update: {
          entries?: Json | null;
          error?: string | null;
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
      reader_emails: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          kind: string;
          ref: string;
          sent_at: string | null;
          status: string;
          subject: string;
          to_email: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          kind: string;
          ref?: string;
          sent_at?: string | null;
          status?: string;
          subject: string;
          to_email: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          ref?: string;
          sent_at?: string | null;
          status?: string;
          subject?: string;
          to_email?: string;
        };
        Relationships: [];
      };
      reader_notifications: {
        Row: {
          body: string;
          content_ref: string;
          created_at: string;
          id: string;
          kind: string;
          owner_ref: string;
          read_at: string | null;
          title: string;
        };
        Insert: {
          body: string;
          content_ref: string;
          created_at?: string;
          id?: string;
          kind: string;
          owner_ref: string;
          read_at?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          content_ref?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          owner_ref?: string;
          read_at?: string | null;
          title?: string;
        };
        Relationships: [];
      };
      reader_preferences: {
        Row: {
          migrated_from_anon: string | null;
          preferences: NonNullable<Json>;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          migrated_from_anon?: string | null;
          preferences?: NonNullable<Json>;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          migrated_from_anon?: string | null;
          preferences?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reader_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reader_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      rec_campaigns: {
        Row: {
          audience: string;
          created_at: string;
          created_by: string | null;
          ends_on: string;
          id: string;
          name: string;
          quota: number;
          source_ids: string[];
          starts_on: string;
        };
        Insert: {
          audience?: string;
          created_at?: string;
          created_by?: string | null;
          ends_on: string;
          id?: string;
          name: string;
          quota?: number;
          source_ids: string[];
          starts_on: string;
        };
        Update: {
          audience?: string;
          created_at?: string;
          created_by?: string | null;
          ends_on?: string;
          id?: string;
          name?: string;
          quota?: number;
          source_ids?: string[];
          starts_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rec_campaigns_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rec_campaigns_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      rec_experiments: {
        Row: {
          created_at: string;
          created_by: string | null;
          ended_at: string | null;
          id: string;
          name: string;
          promoted_version: string | null;
          split: number[];
          started_at: string;
          status: string;
          variants: NonNullable<Json>;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          ended_at?: string | null;
          id?: string;
          name: string;
          promoted_version?: string | null;
          split: number[];
          started_at?: string;
          status?: string;
          variants: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          ended_at?: string | null;
          id?: string;
          name?: string;
          promoted_version?: string | null;
          split?: number[];
          started_at?: string;
          status?: string;
          variants?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "rec_experiments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rec_experiments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rec_experiments_promoted_version_fkey";
            columns: ["promoted_version"];
            isOneToOne: false;
            referencedRelation: "rec_weights";
            referencedColumns: ["version"];
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
      redirects: {
        Row: {
          created_at: string;
          created_by: string | null;
          from_path: string;
          id: string;
          kind: number;
          reason: string;
          to_path: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          from_path: string;
          id?: string;
          kind?: number;
          reason?: string;
          to_path: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          from_path?: string;
          id?: string;
          kind?: number;
          reason?: string;
          to_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "redirects_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "redirects_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_reviewer_settings: {
        Row: {
          id: boolean;
          mode: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          mode?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          mode?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      review_escalations: {
        Row: {
          article_id: string;
          id: string;
          kind: string;
          opened_at: string;
          report_count: number;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
        };
        Insert: {
          article_id: string;
          id?: string;
          kind?: string;
          opened_at?: string;
          report_count?: number;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
        };
        Update: {
          article_id?: string;
          id?: string;
          kind?: string;
          opened_at?: string;
          report_count?: number;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
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
          responded_at: string | null;
          responded_by: string | null;
          response: string | null;
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
          responded_at?: string | null;
          responded_by?: string | null;
          response?: string | null;
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
          responded_at?: string | null;
          responded_by?: string | null;
          response?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_responded_by_fkey";
            columns: ["responded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_responded_by_fkey";
            columns: ["responded_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
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
      source_discoveries: {
        Row: {
          accepted_fields: string[];
          created_at: string;
          created_by: string | null;
          final_url: string | null;
          id: string;
          input_url: string;
          preview: NonNullable<Json>;
          prompt_version: number | null;
          source_id: string | null;
          suggestion: NonNullable<Json>;
        };
        Insert: {
          accepted_fields?: string[];
          created_at?: string;
          created_by?: string | null;
          final_url?: string | null;
          id?: string;
          input_url: string;
          preview?: NonNullable<Json>;
          prompt_version?: number | null;
          source_id?: string | null;
          suggestion?: NonNullable<Json>;
        };
        Update: {
          accepted_fields?: string[];
          created_at?: string;
          created_by?: string | null;
          final_url?: string | null;
          id?: string;
          input_url?: string;
          preview?: NonNullable<Json>;
          prompt_version?: number | null;
          source_id?: string | null;
          suggestion?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "source_discoveries_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "public_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_discoveries_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      source_fetch_outcomes: {
        Row: {
          outcome: string;
          recorded_at: string;
          run_id: string;
          source_id: string;
        };
        Insert: {
          outcome: string;
          recorded_at?: string;
          run_id: string;
          source_id: string;
        };
        Update: {
          outcome?: string;
          recorded_at?: string;
          run_id?: string;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_fetch_outcomes_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "public_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_fetch_outcomes_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      source_health_daily: {
        Row: {
          day: string;
          fetch_failed: number;
          fetch_not_modified: number;
          fetch_ok: number;
          items_new: number;
          last_error: string | null;
          latency_ms_sum: number;
          latency_samples: number;
          source_id: string;
        };
        Insert: {
          day: string;
          fetch_failed?: number;
          fetch_not_modified?: number;
          fetch_ok?: number;
          items_new?: number;
          last_error?: string | null;
          latency_ms_sum?: number;
          latency_samples?: number;
          source_id: string;
        };
        Update: {
          day?: string;
          fetch_failed?: number;
          fetch_not_modified?: number;
          fetch_ok?: number;
          items_new?: number;
          last_error?: string | null;
          latency_ms_sum?: number;
          latency_samples?: number;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_health_daily_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "public_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_health_daily_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
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
      source_logo_checks: {
        Row: {
          checked_at: string;
          detail: string | null;
          found_at: string | null;
          outcome: string;
          source_id: string;
        };
        Insert: {
          checked_at?: string;
          detail?: string | null;
          found_at?: string | null;
          outcome: string;
          source_id: string;
        };
        Update: {
          checked_at?: string;
          detail?: string | null;
          found_at?: string | null;
          outcome?: string;
          source_id?: string;
        };
        Relationships: [];
      };
      sources: {
        Row: {
          agreement_note: string | null;
          agreement_until: string | null;
          archive_reason: string | null;
          archived_at: string | null;
          archived_by: string | null;
          base_url: string;
          categories: string[];
          consecutive_failures: number;
          consumption: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          display_name: string | null;
          editorial_score: number;
          etag: string | null;
          feed_url: string | null;
          frequency_minutes: number | null;
          id: string;
          image_policy: Database["public"]["Enums"]["image_policy"];
          kind: Database["public"]["Enums"]["source_kind"];
          last_error: string | null;
          last_fetch_run_id: string | null;
          last_fetch_started_at: string | null;
          last_fetched_at: string | null;
          last_modified: string | null;
          layer: number | null;
          locality: string;
          logo_path: string | null;
          logo_origin_url: string | null;
          logo_source: string | null;
          may_be_sole_source: boolean;
          name: string;
          owner_id: string | null;
          priority: number;
          rate_limit_per_hour: number;
          rec_excluded: boolean;
          rec_local_highlight: boolean;
          rec_pinned: boolean;
          trusted: boolean;
          reliability: Database["public"]["Enums"]["source_reliability"];
          republish_policy: Database["public"]["Enums"]["republish_policy"];
          slug: string;
          status: Database["public"]["Enums"]["source_status"];
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_reason: string | null;
          terms_min_interval_minutes: number | null;
          terms_reviewed_at: string | null;
          terms_reviewed_by: string | null;
          terms_url: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          agreement_note?: string | null;
          agreement_until?: string | null;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          base_url: string;
          categories?: string[];
          consecutive_failures?: number;
          consumption?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          display_name?: string | null;
          editorial_score?: number;
          etag?: string | null;
          feed_url?: string | null;
          frequency_minutes?: number | null;
          id?: string;
          image_policy?: Database["public"]["Enums"]["image_policy"];
          kind: Database["public"]["Enums"]["source_kind"];
          last_error?: string | null;
          last_fetch_run_id?: string | null;
          last_fetch_started_at?: string | null;
          last_fetched_at?: string | null;
          last_modified?: string | null;
          layer?: number | null;
          locality: string;
          logo_path?: string | null;
          logo_origin_url?: string | null;
          logo_source?: string | null;
          may_be_sole_source?: boolean;
          name: string;
          owner_id?: string | null;
          priority?: number;
          rate_limit_per_hour?: number;
          rec_excluded?: boolean;
          rec_local_highlight?: boolean;
          rec_pinned?: boolean;
          trusted?: boolean;
          reliability?: Database["public"]["Enums"]["source_reliability"];
          republish_policy?: Database["public"]["Enums"]["republish_policy"];
          slug: string;
          status?: Database["public"]["Enums"]["source_status"];
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_reason?: string | null;
          terms_min_interval_minutes?: number | null;
          terms_reviewed_at?: string | null;
          terms_reviewed_by?: string | null;
          terms_url?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          agreement_note?: string | null;
          agreement_until?: string | null;
          archive_reason?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          base_url?: string;
          categories?: string[];
          consecutive_failures?: number;
          consumption?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          display_name?: string | null;
          editorial_score?: number;
          etag?: string | null;
          feed_url?: string | null;
          frequency_minutes?: number | null;
          id?: string;
          image_policy?: Database["public"]["Enums"]["image_policy"];
          kind?: Database["public"]["Enums"]["source_kind"];
          last_error?: string | null;
          last_fetch_run_id?: string | null;
          last_fetch_started_at?: string | null;
          last_fetched_at?: string | null;
          last_modified?: string | null;
          layer?: number | null;
          locality?: string;
          logo_path?: string | null;
          logo_origin_url?: string | null;
          logo_source?: string | null;
          may_be_sole_source?: boolean;
          name?: string;
          owner_id?: string | null;
          priority?: number;
          rate_limit_per_hour?: number;
          rec_excluded?: boolean;
          rec_local_highlight?: boolean;
          rec_pinned?: boolean;
          trusted?: boolean;
          reliability?: Database["public"]["Enums"]["source_reliability"];
          republish_policy?: Database["public"]["Enums"]["republish_policy"];
          slug?: string;
          status?: Database["public"]["Enums"]["source_status"];
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_reason?: string | null;
          terms_min_interval_minutes?: number | null;
          terms_reviewed_at?: string | null;
          terms_reviewed_by?: string | null;
          terms_url?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      sponsored_campaigns: {
        Row: {
          advertiser: string;
          advertiser_id: string | null;
          allowed_sections: string[];
          created_by: string | null;
          creative: NonNullable<Json>;
          deliveries: number;
          ends_on: string;
          id: string;
          starts_on: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          advertiser: string;
          advertiser_id?: string | null;
          allowed_sections: string[];
          created_by?: string | null;
          creative: NonNullable<Json>;
          deliveries?: number;
          ends_on: string;
          id?: string;
          starts_on: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          advertiser?: string;
          advertiser_id?: string | null;
          allowed_sections?: string[];
          created_by?: string | null;
          creative?: NonNullable<Json>;
          deliveries?: number;
          ends_on?: string;
          id?: string;
          starts_on?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sponsored_campaigns_advertiser_id_fkey";
            columns: ["advertiser_id"];
            isOneToOne: false;
            referencedRelation: "advertisers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sponsored_campaigns_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sponsored_campaigns_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_invites: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["app_role"];
          sections: string[];
          user_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["app_role"];
          sections?: string[];
          user_id: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          sections?: string[];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_invites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_invites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      studio_revalidations: {
        Row: {
          created_at: string;
          id: number;
          tags: string[];
        };
        Insert: {
          created_at?: string;
          id?: number;
          tags: string[];
        };
        Update: {
          created_at?: string;
          id?: number;
          tags?: string[];
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          added_at: string;
          team_id: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          lead_id: string | null;
          name: string;
          sections: string[];
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          lead_id?: string | null;
          name: string;
          sections?: string[];
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          lead_id?: string | null;
          name?: string;
          sections?: string[];
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teams_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teams_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
        ];
      };
      topics: {
        Row: {
          agreements: string[];
          centroid: string | null;
          confidence: Database["public"]["Enums"]["confidence_level"];
          confidence_score: number;
          disagreements: string[];
          faq: NonNullable<Json>;
          first_seen_at: string;
          id: string;
          section_slug: string | null;
          slug: string;
          state: Database["public"]["Enums"]["topic_state"];
          summary: string | null;
          summary_reviewed_by: string | null;
          title: string;
          tsv: unknown;
          unconfirmed: string[];
          updated_at: string;
          visibility: string;
        };
        Insert: {
          agreements?: string[];
          centroid?: string | null;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          confidence_score?: number;
          disagreements?: string[];
          faq?: NonNullable<Json>;
          first_seen_at?: string;
          id?: string;
          section_slug?: string | null;
          slug: string;
          state?: Database["public"]["Enums"]["topic_state"];
          summary?: string | null;
          summary_reviewed_by?: string | null;
          title: string;
          tsv?: unknown;
          unconfirmed?: string[];
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          agreements?: string[];
          centroid?: string | null;
          confidence?: Database["public"]["Enums"]["confidence_level"];
          confidence_score?: number;
          disagreements?: string[];
          faq?: NonNullable<Json>;
          first_seen_at?: string;
          id?: string;
          section_slug?: string | null;
          slug?: string;
          state?: Database["public"]["Enums"]["topic_state"];
          summary?: string | null;
          summary_reviewed_by?: string | null;
          title?: string;
          tsv?: unknown;
          unconfirmed?: string[];
          updated_at?: string;
          visibility?: string;
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
      venues: {
        Row: {
          address: string | null;
          category: string;
          created_at: string;
          data_sources: string[];
          data_updated_at: string | null;
          hours: string | null;
          id: string;
          instagram: string | null;
          lat: number | null;
          lng: number | null;
          name: string;
          neighborhood: string | null;
          phone: string | null;
          photo_checked_at: string | null;
          place_ids: Json;
          price_level: number | null;
          rating: number | null;
          rating_count: number | null;
          rating_source: string | null;
          rating_updated_at: string | null;
          slug: string;
          status: string;
          status_reason: string | null;
          subcategory: string | null;
          tripadvisor_rank: number | null;
          tripadvisor_url: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          category: string;
          created_at?: string;
          data_sources?: string[];
          data_updated_at?: string | null;
          hours?: string | null;
          id?: string;
          instagram?: string | null;
          lat?: number | null;
          lng?: number | null;
          name: string;
          neighborhood?: string | null;
          phone?: string | null;
          photo_checked_at?: string | null;
          place_ids?: Json;
          price_level?: number | null;
          rating?: number | null;
          rating_count?: number | null;
          rating_source?: string | null;
          rating_updated_at?: string | null;
          slug: string;
          status?: string;
          status_reason?: string | null;
          subcategory?: string | null;
          tripadvisor_rank?: number | null;
          tripadvisor_url?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          category?: string;
          created_at?: string;
          data_sources?: string[];
          data_updated_at?: string | null;
          hours?: string | null;
          id?: string;
          instagram?: string | null;
          lat?: number | null;
          lng?: number | null;
          name?: string;
          neighborhood?: string | null;
          phone?: string | null;
          photo_checked_at?: string | null;
          place_ids?: Json;
          price_level?: number | null;
          rating?: number | null;
          rating_count?: number | null;
          rating_source?: string | null;
          rating_updated_at?: string | null;
          slug?: string;
          status?: string;
          status_reason?: string | null;
          subcategory?: string | null;
          tripadvisor_rank?: number | null;
          tripadvisor_url?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      venue_media: {
        Row: {
          created_at: string;
          credit: string;
          id: string;
          media_id: string;
          origin_url: string;
          position: number;
          venue_id: string;
        };
        Insert: {
          created_at?: string;
          credit: string;
          id?: string;
          media_id: string;
          origin_url: string;
          position?: number;
          venue_id: string;
        };
        Update: {
          created_at?: string;
          credit?: string;
          id?: string;
          media_id?: string;
          origin_url?: string;
          position?: number;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_media_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venue_media_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_reports: {
        Row: {
          contact: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          reason: string;
          status: string;
          venue_id: string;
        };
        Insert: {
          contact?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          reason: string;
          status?: string;
          venue_id: string;
        };
        Update: {
          contact?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          reason?: string;
          status?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_reports_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      guide_templates: {
        Row: {
          active: boolean;
          category: string;
          created_at: string;
          id: string;
          last_proposed_at: string | null;
          min_venues: number;
          neighborhood: string | null;
          noun: string;
          slug: string;
          subcategory: string | null;
          take: number;
          title: string;
          weights: Json | null;
        };
        Insert: {
          active?: boolean;
          category: string;
          created_at?: string;
          id?: string;
          last_proposed_at?: string | null;
          min_venues?: number;
          neighborhood?: string | null;
          noun?: string;
          slug: string;
          subcategory?: string | null;
          take?: number;
          title: string;
          weights?: Json | null;
        };
        Update: {
          active?: boolean;
          category?: string;
          created_at?: string;
          id?: string;
          last_proposed_at?: string | null;
          min_venues?: number;
          neighborhood?: string | null;
          noun?: string;
          slug?: string;
          subcategory?: string | null;
          take?: number;
          title?: string;
          weights?: Json | null;
        };
        Relationships: [];
      };
      guide_lists: {
        Row: {
          category: string;
          created_at: string;
          created_by: string | null;
          criteria: string;
          id: string;
          intro: string | null;
          neighborhood: string | null;
          next_refresh_at: string | null;
          origin: string;
          published_at: string | null;
          published_by: string | null;
          refreshed_at: string | null;
          slug: string;
          sponsor_kind: string | null;
          sponsor_name: string | null;
          sponsored: boolean;
          status: string;
          subcategory: string | null;
          suspended_at: string | null;
          suspended_reason: string | null;
          take: number;
          template_id: string | null;
          title: string;
          updated_at: string;
          weights: Json | null;
        };
        Insert: {
          category: string;
          created_at?: string;
          created_by?: string | null;
          criteria?: string;
          id?: string;
          intro?: string | null;
          neighborhood?: string | null;
          next_refresh_at?: string | null;
          origin?: string;
          published_at?: string | null;
          published_by?: string | null;
          refreshed_at?: string | null;
          slug: string;
          sponsor_kind?: string | null;
          sponsor_name?: string | null;
          sponsored?: boolean;
          status?: string;
          subcategory?: string | null;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          take?: number;
          template_id?: string | null;
          title: string;
          updated_at?: string;
          weights?: Json | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          criteria?: string;
          id?: string;
          intro?: string | null;
          neighborhood?: string | null;
          next_refresh_at?: string | null;
          origin?: string;
          published_at?: string | null;
          published_by?: string | null;
          refreshed_at?: string | null;
          slug?: string;
          sponsor_kind?: string | null;
          sponsor_name?: string | null;
          sponsored?: boolean;
          status?: string;
          subcategory?: string | null;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          take?: number;
          template_id?: string | null;
          title?: string;
          updated_at?: string;
          weights?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "guide_lists_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "guide_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      guide_list_items: {
        Row: {
          editor_note: string | null;
          list_id: string;
          position: number;
          score: number | null;
          score_breakdown: Json;
          venue_id: string;
        };
        Insert: {
          editor_note?: string | null;
          list_id: string;
          position: number;
          score?: number | null;
          score_breakdown?: Json;
          venue_id: string;
        };
        Update: {
          editor_note?: string | null;
          list_id?: string;
          position?: number;
          score?: number | null;
          score_breakdown?: Json;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guide_list_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "guide_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guide_list_items_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      guide_proposals: {
        Row: {
          analysis: Json;
          created_at: string;
          created_by: string | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          list_id: string | null;
          origin: string;
          source_url: string | null;
          status: string;
          template_id: string | null;
        };
        Insert: {
          analysis?: Json;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          list_id?: string | null;
          origin: string;
          source_url?: string | null;
          status?: string;
          template_id?: string | null;
        };
        Update: {
          analysis?: Json;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          list_id?: string | null;
          origin?: string;
          source_url?: string | null;
          status?: string;
          template_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "guide_proposals_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "guide_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guide_proposals_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "guide_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      guide_runs: {
        Row: {
          finished_at: string | null;
          id: string;
          kind: string;
          report: Json | null;
          started_at: string;
          trigger: string;
        };
        Insert: {
          finished_at?: string | null;
          id?: string;
          kind: string;
          report?: Json | null;
          started_at?: string;
          trigger?: string;
        };
        Update: {
          finished_at?: string | null;
          id?: string;
          kind?: string;
          report?: Json | null;
          started_at?: string;
          trigger?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      media_registry: {
        Row: {
          archived_at: string | null;
          article_ids: string[];
          content_hash: string | null;
          created_at: string;
          credit: string | null;
          disclaimer: string | null;
          expiration: string | null;
          id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          license: string;
          metadata: Json;
          origin: string | null;
          original_url: string | null;
          author: string | null;
          rights_status: Database["public"]["Enums"]["media_rights_status"];
          source_url: string | null;
          status: string;
          storage_path: string;
          updated_at: string;
          usage_scope: string[];
          uses: number;
        };
        Relationships: [];
      };
      public_ad_placements: {
        Row: {
          allowed_sections: string[] | null;
          creative: Json | null;
          ends_on: string | null;
          id: string | null;
          impressions_today: number | null;
          is_house: boolean | null;
          max_impressions_per_day: number | null;
          slot: string | null;
          starts_on: string | null;
          weight: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ad_placements_slot_fkey";
            columns: ["slot"];
            isOneToOne: false;
            referencedRelation: "ad_slots";
            referencedColumns: ["code"];
          },
        ];
      };
      audit_log_view: {
        Row: {
          action: string | null;
          actor: string | null;
          at: string | null;
          details: Json | null;
          id: number | null;
          ip_hash: string | null;
          object_ref: string | null;
        };
        Insert: {
          action?: string | null;
          actor?: string | null;
          at?: string | null;
          details?: never;
          id?: number | null;
          ip_hash?: never;
          object_ref?: string | null;
        };
        Update: {
          action?: string | null;
          actor?: string | null;
          at?: string | null;
          details?: never;
          id?: number | null;
          ip_hash?: never;
          object_ref?: string | null;
        };
        Relationships: [];
      };
      my_push_subscriptions: {
        Row: {
          browser: string | null;
          created_at: string | null;
          daily_limit: number | null;
          device_class: string | null;
          id: string | null;
          installed: boolean | null;
          last_seen_at: string | null;
          last_success_at: string | null;
          metrics_consent: boolean | null;
          platform: string | null;
          quiet_end: number | null;
          quiet_start: number | null;
          targets: string[] | null;
          want_follow: boolean | null;
          want_highlight: boolean | null;
          want_urgent: boolean | null;
        };
        Insert: {
          browser?: string | null;
          created_at?: string | null;
          daily_limit?: number | null;
          device_class?: string | null;
          id?: string | null;
          installed?: boolean | null;
          last_seen_at?: string | null;
          last_success_at?: string | null;
          metrics_consent?: boolean | null;
          platform?: string | null;
          quiet_end?: number | null;
          quiet_start?: number | null;
          targets?: string[] | null;
          want_follow?: boolean | null;
          want_highlight?: boolean | null;
          want_urgent?: boolean | null;
        };
        Update: {
          browser?: string | null;
          created_at?: string | null;
          daily_limit?: number | null;
          device_class?: string | null;
          id?: string | null;
          installed?: boolean | null;
          last_seen_at?: string | null;
          last_success_at?: string | null;
          metrics_consent?: boolean | null;
          platform?: string | null;
          quiet_end?: number | null;
          quiet_start?: number | null;
          targets?: string[] | null;
          want_follow?: boolean | null;
          want_highlight?: boolean | null;
          want_urgent?: boolean | null;
        };
        Relationships: [];
      };
      pipeline_events_view: {
        Row: {
          at: string | null;
          details: Json | null;
          id: number | null;
          item_ref: string | null;
          level: string | null;
          message: string | null;
          run_id: string | null;
          step: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_events_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "ingest_runs";
            referencedColumns: ["id"];
          },
        ];
      };
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
          source_editorial_score: number | null;
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
      public_article_versions: {
        Row: {
          article_id: string | null;
          body: Json | null;
          change_kind: string | null;
          created_at: string | null;
          dek: string | null;
          number: number | null;
          public_note: string | null;
          title: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "article_versions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_versions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "studio_queue";
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
      source_fetch_health: {
        Row: {
          consecutive_failures: number | null;
          ok: number | null;
          slug: string | null;
          total: number | null;
        };
        Relationships: [];
      };
      source_item_stats: {
        Row: {
          items_24h: number | null;
          items_today: number | null;
          last_item_at: string | null;
          source_id: string | null;
        };
        Relationships: [
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
        ];
      };
      studio_queue: {
        Row: {
          agent_id: string | null;
          ai_fallback: boolean | null;
          assignee_id: string | null;
          assignee_name: string | null;
          author_id: string | null;
          author_name: string | null;
          category: string | null;
          confidence: Database["public"]["Enums"]["confidence_level"] | null;
          confidence_score: number | null;
          due_at: string | null;
          id: string | null;
          kind: Database["public"]["Enums"]["content_kind"] | null;
          publish_mode: Database["public"]["Enums"]["publish_mode"] | null;
          published_at: string | null;
          recommended: string | null;
          recommended_rationale: string | null;
          review_reason: string | null;
          scheduled_for: string | null;
          section_name: string | null;
          section_slug: string | null;
          sensitive: boolean | null;
          slug: string | null;
          status: Database["public"]["Enums"]["article_status"] | null;
          title: string | null;
          topic_id: string | null;
          updated_at: string | null;
          urgent: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "articles_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "public_bylines";
            referencedColumns: ["id"];
          },
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
    };
    Functions: {
      ad_track: {
        Args: {
          p_event: string;
          p_key: string;
          p_placement: string;
          p_section: string;
        };
        Returns: boolean;
      };
      ai_cost_daily: {
        Args: { p_since: string };
        Returns: {
          agent_id: string;
          avg_latency_ms: number;
          calls: number;
          cost_brl: number;
          day: string;
          errors: number;
          fallbacks: number;
          model_id: string;
          tokens_in: number;
          tokens_out: number;
        }[];
      };
      ai_knowledge_bases: {
        Args: Record<PropertyKey, never>;
        Returns: {
          base: string;
          embedded: number;
          indexed: number;
          total: number;
          updated_at: string;
        }[];
      };
      ai_spend_since: {
        Args: { p_since: string };
        Returns: {
          agent_id: string;
          cost_brl: number;
        }[];
      };
      anonymize_old_events: { Args: { p_days?: number }; Returns: number };
      app_setting_set: {
        Args: { p_ctx?: Json; p_ip_hash?: string; p_key: string; p_value: Json };
        Returns: undefined;
      };
      approval_apply: { Args: { p_id: string }; Returns: Json };
      approval_assert_content: {
        Args: { a: Database["public"]["Tables"]["approvals"]["Row"] };
        Returns: undefined;
      };
      approval_kinds: { Args: Record<PropertyKey, never>; Returns: string[] };
      approval_target_hash: { Args: { p_kind: string; p_target: string }; Returns: string };
      article_body_text: { Args: { p_body: Json }; Returns: string };
      article_is_public: { Args: { article: string }; Returns: boolean };
      article_owner: { Args: { article: string }; Returns: string };
      article_section: { Args: { article: string }; Returns: string };
      article_tsv: { Args: { p_body: Json; p_dek: string; p_title: string }; Returns: unknown };
      attach_item_to_topic: {
        Args: { p_id: string; p_now: string; p_topic: string };
        Returns: undefined;
      };
      can_approve_media: { Args: { media: string; uid: string }; Returns: boolean };
      can_edit_section: { Args: { section: string; uid: string }; Returns: boolean };
      claim_source_fetch: {
        Args: { p_run: string; p_since: string; p_source: string };
        Returns: boolean;
      };
      consume_role_admin_approval: { Args: { target: string }; Returns: boolean };
      consume_role_admin_ref: { Args: { p_ref: string }; Returns: boolean };
      consume_source_critical_approval: { Args: { p_target: string }; Returns: string };
      contingency_pause_cycle: { Args: { p_reason: string }; Returns: number };
      topic_close_stale: { Args: { p_now?: string; p_days?: number }; Returns: number };
      ai_reviewer_set_mode: { Args: { p_mode: string; p_ctx?: Json }; Returns: string };
      review_due_articles: {
        Args: { p_now?: string; p_limit?: number };
        Returns: { id: string }[];
      };
      report_escalation_resolve: { Args: { p_id: string; p_note?: string }; Returns: Json };
      publish_counts: { Args: { p_now?: string }; Returns: Json };
      publish_breaker_trip: { Args: { p_reason: string; p_detail?: Json }; Returns: boolean };
      publish_breaker_reset: { Args: { p_ctx?: Json }; Returns: undefined };
      publish_breaker_set_limits: { Args: { p: Json; p_ctx?: Json }; Returns: undefined };
      control_can_operate: { Args: { uid: string }; Returns: boolean };
      control_can_view: { Args: { uid: string }; Returns: boolean };
      control_guard_view: { Args: Record<PropertyKey, never>; Returns: undefined };
      control_logs: {
        Args: {
          p_before?: number;
          p_item?: string;
          p_level?: string;
          p_limit?: number;
          p_q?: string;
          p_run?: string;
          p_since?: string;
          p_source?: string;
          p_steps?: string[];
        };
        Returns: {
          at: string;
          details: Json;
          id: number;
          item_ref: string;
          level: string;
          message: string;
          run_id: string;
          step: string;
        }[];
      };
      control_queue_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          in_flight: number;
          oldest_at: string;
          queue: string;
          ready: number;
          retrying: number;
          step: string;
        }[];
      };
      control_retrying_jobs: {
        Args: { p_limit?: number };
        Returns: {
          enqueued_at: string;
          id: number;
          item_ref: string;
          last_error: string;
          queue: string;
          read_ct: number;
          run_ref: string;
          step: string;
          visible_at: string;
        }[];
      };
      control_run_steps: {
        Args: { p_run_ids: string[] };
        Returns: {
          error: number;
          first_at: string;
          last_at: string;
          ok: number;
          run_id: string;
          security: number;
          step: string;
          warn: number;
        }[];
      };
      control_run_totals: {
        Args: { p_run_ids: string[] };
        Returns: {
          ai_calls: number;
          cost_brl: number;
          pending: number;
          quarantined: number;
          run_id: string;
        }[];
      };
      control_source_health: {
        Args: Record<PropertyKey, never>;
        Returns: {
          consecutive_failures: number;
          errors_24h: number;
          frequency_minutes: number;
          id: string;
          items_24h: number;
          kind: string;
          last_error: string;
          last_fetched_at: string;
          name: string;
          ok_30d: number;
          reliability: string;
          slug: string;
          status: string;
          status_reason: string;
          total_30d: number;
        }[];
      };
      create_topic_for_item: {
        Args: { p_id: string; p_now: string; p_slug: string; p_title: string };
        Returns: string;
      };
      critical_actor: { Args: Record<PropertyKey, never>; Returns: string };
      dearmor: { Args: { "": string }; Returns: string };
      dedupe_candidates: {
        Args: {
          p_id: string;
          p_limit: number;
          p_max_hamming: number;
          p_min_cosine: number;
          p_simhash: string;
          p_since: string;
        };
        Returns: {
          cosine: number;
          id: string;
          simhash: string;
          topic_id: string;
        }[];
      };
      email_escape: { Args: { p: string; p_max: number }; Returns: string };
      export_email_data: { Args: Record<PropertyKey, never>; Returns: Json };
      forced_publish_batch: { Args: { p_batch: number; p_job: string }; Returns: Json };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { "": string }; Returns: string };
      hamming64: { Args: { a: number; b: number }; Returns: number };
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
      featured_assert_role: { Args: never; Returns: undefined };
      featured_has_cover: { Args: { p_article: string }; Returns: boolean };
      featured_pin: {
        Args: {
          p_article: string;
          p_ends_at: string | null;
          p_note?: string;
          p_replace?: string | null;
          p_section: string | null;
          p_slot: string;
        };
        Returns: string;
      };
      featured_reorder: { Args: { p_ids: string[]; p_slot: string }; Returns: number };
      featured_request_images: { Args: { p_ids: string[] }; Returns: number };
      featured_unpin: { Args: { p_id: string }; Returns: boolean };
      home_layout_publish: { Args: { p_id: string }; Returns: number };
      image_policy_rank: {
        Args: { p: Database["public"]["Enums"]["image_policy"] };
        Returns: number;
      };
      index_article: { Args: { p_embedding?: string; p_id: string }; Returns: undefined };
      is_staff: { Args: { uid: string }; Returns: boolean };
      lock_fast_lane_max: { Args: Record<PropertyKey, never>; Returns: number };
      mark_fetch_enqueued: {
        Args: { p_count: number; p_extra?: Json; p_run: string };
        Returns: boolean;
      };
      mark_item_duplicate: { Args: { p_id: string; p_original: string }; Returns: undefined };
      mask_ips: { Args: { p: string }; Returns: string };
      mask_ips_jsonb: { Args: { p: Json }; Returns: Json };
      media_insert_asset: { Args: { p: Json }; Returns: string };
      media_phash_neighbors: {
        Args: { p_exclude: string; p_max: number; p_phash: string };
        Returns: {
          distance: number;
        }[];
      };
      media_reprocess_candidates: {
        Args: { p_after_at?: string; p_after_id?: string; p_limit: number };
        Returns: {
          id: string;
          published_at: string;
        }[];
      };
      notify_once: { Args: { p: Json; p_window_sec: number }; Returns: boolean };
      peek_rate_limit: {
        Args: { p_bucket: string; p_key_hash: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      pgp_armor_headers: { Args: { "": string }; Returns: Record<string, unknown>[] };
      pipeline_decision_context: { Args: { p_article: string }; Returns: Json };
      pipeline_draft_context: { Args: { p_topic: string }; Returns: Json };
      pipeline_item: {
        Args: { p_id: string };
        Returns: {
          duplicate_of: string;
          embedding: number[];
          excerpt: string;
          id: string;
          published_at: string;
          simhash: string;
          source_id: string;
          title: string;
          topic_id: string;
        }[];
      };
      pipeline_media_context: { Args: { p_article: string }; Returns: Json };
      prompt_publish: { Args: { p_approval: string }; Returns: Json };
      prompt_rollback: { Args: { p_agent: string; p_to: number }; Returns: Json };
      public_article_gone: { Args: { p_slug: string }; Returns: string };
      public_most_read: {
        Args: { p_hours?: number; p_limit?: number };
        Returns: {
          article_id: string;
          reads: number;
        }[];
      };
      publish_due_scheduled: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          section_slug: string;
          slug: string;
          topic_id: string;
        }[];
      };
      purge_deleted_accounts: { Args: { p_days?: number }; Returns: number };
      purge_email_data: { Args: { p_email: string }; Returns: undefined };
      purge_pipeline_events: {
        Args: { p_before?: string; p_item_refs?: string[]; p_run_ids?: string[] };
        Returns: number;
      };
      purge_reader_emails: { Args: { p_days?: number }; Returns: number };
      push_active_by_browser: {
        Args: Record<PropertyKey, never>;
        Returns: {
          browser: string;
          n: number;
        }[];
      };
      push_approve: { Args: { p_send: string }; Returns: string };
      push_audience_estimate: { Args: { p_audience: Json; p_kind: string }; Returns: number };
      push_audit: {
        Args: { p_action: string; p_details?: Json; p_object: string };
        Returns: undefined;
      };
      push_can: { Args: { p_action: string; p_section?: string; p_uid: string }; Returns: boolean };
      push_cancel: { Args: { p_reason: string; p_send: string }; Returns: undefined };
      push_claim_due: { Args: { p_delivery: number; p_now: string }; Returns: string };
      push_delivery_result: {
        Args: {
          p_delivery: number;
          p_error?: string;
          p_http?: number;
          p_outcome: string;
          p_retry_at?: string;
        };
        Returns: undefined;
      };
      push_dispatch_due: { Args: { p_now?: string }; Returns: Json };
      push_expire_requests: { Args: { p_now?: string }; Returns: number };
      push_finish_batch: { Args: { p_batch: number; p_send: string }; Returns: boolean };
      push_funnel: {
        Args: { p_browser?: string; p_device?: string; p_from: string; p_to: string };
        Returns: {
          n: number;
          stage: string;
        }[];
      };
      push_funnel_compute: {
        Args: { p_from: string; p_to: string };
        Returns: {
          browser: string;
          device_class: string;
          n: number;
          stage: string;
        }[];
      };
      push_funnel_refresh: { Args: { p_day: string }; Returns: number };
      push_local_day: { Args: { p_ts: string }; Returns: string };
      push_quiet_ends_at: { Args: { p_end: number; p_now: string }; Returns: string };
      push_receipt_hit: {
        Args: {
          p_browser: string;
          p_device: string;
          p_event: string;
          p_now: string;
          p_send: string;
        };
        Returns: boolean;
      };
      push_reject: { Args: { p_reason: string; p_send: string }; Returns: undefined };
      push_request: { Args: { p: Json }; Returns: string };
      push_reserve: {
        Args: { p_now?: string; p_send: string; p_sub: string };
        Returns: {
          delivery_id: number;
          outcome: string;
        }[];
      };
      push_resume_apply: { Args: { p_approval: string }; Returns: undefined };
      push_resume_approve: { Args: { p_approval: string }; Returns: undefined };
      push_resume_request: { Args: { p_reason: string }; Returns: string };
      push_retention: { Args: { p_now?: string }; Returns: Json };
      push_settings_int: { Args: { p_default: number; p_key: string }; Returns: number };
      push_settings_pause: { Args: { p_reason: string }; Returns: undefined };
      push_targets_valid: { Args: { p: string[] }; Returns: boolean };
      push_transition_ok: { Args: { p_from: string; p_to: string }; Returns: boolean };
      push_ttl_hours: { Args: { p_kind: string }; Returns: number };
      queue_ack: { Args: { p_msg_id: number; p_queue: string }; Returns: boolean };
      queue_enqueue: {
        Args: { p_dedupe_key: string; p_delay_sec?: number; p_message: Json; p_queue: string };
        Returns: number;
      };
      queue_fail: {
        Args: { p_delay_sec: number; p_error: string; p_msg_id: number; p_queue: string };
        Returns: undefined;
      };
      queue_move_exhausted: {
        Args: { p_max_reads: number; p_queue: string };
        Returns: {
          error: string;
          message: Json;
        }[];
      };
      queue_pending: {
        Args: { p_queue: string; p_run_id?: string; p_steps?: string[] };
        Returns: number;
      };
      queue_quarantine: {
        Args: { p_error: string; p_msg_id: number; p_queue: string };
        Returns: boolean;
      };
      queue_read: {
        Args: { p_n: number; p_queue: string; p_vt_sec: number };
        Returns: {
          message: Json;
          msg_id: number;
          read_ct: number;
        }[];
      };
      queue_release: { Args: { p_msg_id: number; p_queue: string }; Returns: undefined };
      rec_events_summary: {
        Args: { p_since: string };
        Returns: {
          account: boolean;
          algo_version: string;
          dismiss_reason: string;
          list: string;
          n: number;
          name: string;
          personalization: boolean;
          reason: string;
          source_slug: string;
        }[];
      };
      rec_return_7d: {
        Args: { p_since: string };
        Returns: {
          algo_version: string;
          followed: number;
          returned: number;
        }[];
      };
      rec_weights_activate: { Args: { p_approval: string }; Returns: Json };
      rec_weights_valid: { Args: { p_cap: number; p_weights: Json }; Returns: boolean };
      recompute_topic_centroid: { Args: { p_now: string; p_topic: string }; Returns: undefined };
      record_source_fetch: {
        Args: {
          p_error?: string;
          p_items_new?: number;
          p_latency_ms?: number;
          p_outcome: string;
          p_source: string;
        };
        Returns: undefined;
      };
      record_source_fetch_once: {
        Args: {
          p_error?: string;
          p_items_new?: number;
          p_latency_ms?: number;
          p_outcome: string;
          p_run: string;
          p_source: string;
        };
        Returns: boolean;
      };
      refresh_source_stats_daily: { Args: { p_day?: string }; Returns: number };
      require_source_critical_approval: {
        Args: { p_field: string; p_id: string; p_value: string };
        Returns: string;
      };
      require_source_manage: { Args: Record<PropertyKey, never>; Returns: undefined };
      rules_loosens: {
        Args: { cur: Json; cur_fr: boolean; tgt: Json; tgt_fr: boolean };
        Returns: boolean;
      };
      rules_rollback: { Args: Record<PropertyKey, never>; Returns: Json };
      save_item_fingerprint: {
        Args: { p_embedding: string; p_id: string; p_simhash: string };
        Returns: undefined;
      };
      save_pipeline_draft: {
        Args: { p: Json };
        Returns: {
          article_id: string;
          version: number;
        }[];
      };
      schedule_agenda_cron: { Args: Record<PropertyKey, never>; Returns: string };
      schedule_pipeline_cron: { Args: Record<PropertyKey, never>; Returns: string };
      schedule_push_cron: { Args: Record<PropertyKey, never>; Returns: string };
      scrub_field_origins: { Args: { p: Json; p_person?: string }; Returns: Json };
      search_did_you_mean: { Args: { p_q: string }; Returns: string };
      search_hybrid: {
        Args: {
          p_embedding?: string;
          p_filters?: Json;
          p_k?: number;
          p_limit?: number;
          p_q: string;
        };
        Returns: {
          fts_rank: number;
          id: string;
          kind: string;
          matched: number;
          score: number;
          topic_id: string;
          vec_rank: number;
        }[];
      };
      search_suggest: {
        Args: { p_limit?: number; p_prefix: string };
        Returns: {
          suggestion: string;
        }[];
      };
      search_topic_is_public: { Args: { p_id: string }; Returns: boolean };
      security_retention_days: { Args: Record<PropertyKey, never>; Returns: number };
      security_session_hours: { Args: Record<PropertyKey, never>; Returns: number };
      sensitive_tag_match: { Args: { p_tag: string; p_term: string }; Returns: boolean };
      show_limit: { Args: Record<PropertyKey, never>; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      source_admin_bulk: {
        Args: {
          p_action: string;
          p_batch_id?: string;
          p_ctx?: Json;
          p_ids: string[];
          p_ip_hash?: string;
          p_value: Json;
        };
        Returns: Json;
      };
      source_admin_create: { Args: { p: Json; p_ctx?: Json; p_ip_hash?: string }; Returns: string };
      source_admin_status: {
        Args: {
          p_action: string;
          p_ctx?: Json;
          p_id: string;
          p_ip_hash?: string;
          p_reason?: string;
          p_version: number;
        };
        Returns: number;
      };
      source_admin_update: {
        Args: { p_ctx?: Json; p_id: string; p_ip_hash?: string; p_patch: Json; p_version: number };
        Returns: number;
      };
      source_discovery_link: {
        Args: { p_accepted?: string[]; p_id: string; p_source: string };
        Returns: boolean;
      };
      source_logo_auto_set: {
        Args: { p_id: string; p_origin: string; p_path: string };
        Returns: string;
      };
      source_discovery_save: { Args: { p: Json; p_ctx?: Json }; Returns: string };
      source_operational_columns: { Args: Record<PropertyKey, never>; Returns: string[] };
      source_reliability_rank: {
        Args: { p: Database["public"]["Enums"]["source_reliability"] };
        Returns: number;
      };
      staff_invites_sweep: { Args: Record<PropertyKey, never>; Returns: number };
      start_fast_run: {
        Args: { p_window: string };
        Returns: {
          created: boolean;
          run_id: string;
          stats: Json;
        }[];
      };
      start_ingest_run: {
        Args: { p_window: string };
        Returns: {
          created: boolean;
          run_id: string;
          stats: Json;
        }[];
      };
      start_manual_run: {
        Args: { p_source: string };
        Returns: {
          created: boolean;
          run_id: string;
          stats: Json;
        }[];
      };
      studio_accept_suggestion: {
        Args: { p_article: string; p_base: number; p_suggestion: string };
        Returns: Json;
      };
      studio_ai_marks: { Args: { p_body: Json }; Returns: string[] };
      studio_apply_patch: {
        Args: { a: Database["public"]["Tables"]["articles"]["Row"]; p_patch: Json; uid: string };
        Returns: {
          agent_id: string | null;
          ai_fallback: boolean;
          ai_summary: string[] | null;
          ai_summary_reviewed_by: string | null;
          assignee_id: string | null;
          author_id: string | null;
          body: NonNullable<Json>;
          confidence: Database["public"]["Enums"]["confidence_level"];
          confidence_score: number;
          dek: string;
          due_at: string | null;
          embedding: string | null;
          field_origins: NonNullable<Json>;
          gone_reason: string | null;
          id: string;
          kind: Database["public"]["Enums"]["content_kind"];
          neighborhoods: string[];
          publish_destinations: string[];
          publish_mode: Database["public"]["Enums"]["publish_mode"] | null;
          published_at: string | null;
          review_reason: string | null;
          rules_version: number | null;
          scheduled_for: string | null;
          section_slug: string;
          seo_description: string | null;
          seo_title: string | null;
          slug: string;
          sponsored: boolean;
          status: Database["public"]["Enums"]["article_status"];
          tags: string[];
          title: string;
          topic_id: string | null;
          tsv: unknown;
          updated_at: string;
          urgent: boolean;
        };
        SetofOptions: {
          from: "*";
          to: "articles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      studio_audit: {
        Args: { p_action: string; p_actor: string; p_details?: Json; p_object_ref: string };
        Returns: number;
      };
      studio_notifications_for: {
        Args: {
          p_limit?: number;
          p_cursor?: string | null;
          p_only_unread?: boolean;
          p_kind?: string | null;
          p_history?: boolean;
        };
        Returns: {
          id: string;
          kind: string;
          severity: string;
          title: string;
          body: string;
          href: string;
          object_ref: string | null;
          created_at: string;
          read_at: string | null;
        }[];
      };
      studio_unread_count: { Args: Record<PropertyKey, never>; Returns: number };
      studio_notifications_mark_read: { Args: { p_ids: string[] }; Returns: number };
      studio_notifications_mark_all_read: { Args: Record<PropertyKey, never>; Returns: number };
      studio_notifications_sweep: { Args: { p_now?: string }; Returns: number };
      studio_urgent_push_due: {
        Args: { p_now?: string };
        Returns: { id: string; title: string; body: string; href: string; subs: Json }[];
      };
      studio_urgent_push_done: { Args: { p_ids: string[] }; Returns: undefined };
      studio_notify: {
        Args: {
          p_kind: string;
          p_severity: string;
          p_title: string;
          p_body: string;
          p_href: string;
          p_object_ref: string;
          p_roles: string[];
          p_dedupe: string;
          p_user_ids?: string[];
          p_exclude_user_ids?: string[];
          p_ttl?: string;
        };
        Returns: string;
      };
      studio_audit_actions: { Args: Record<PropertyKey, never>; Returns: string[] };
      studio_can_edit: {
        Args: {
          a: Database["public"]["Tables"]["articles"]["Row"];
          new_section: string;
          uid: string;
        };
        Returns: boolean;
      };
      studio_doc_text: { Args: { p_body: Json }; Returns: string };
      studio_fallback_pending: { Args: { p_id: string }; Returns: boolean };
      studio_people: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          name: string;
          roles: Database["public"]["Enums"]["app_role"][];
        }[];
      };
      studio_publish: {
        Args: { p_at?: string; p_base?: number; p_destinations: string[]; p_id: string };
        Returns: Json;
      };
      studio_publish_blockers: { Args: { p_id: string }; Returns: string[] };
      studio_publish_correction: {
        Args: {
          p_base: number;
          p_correction: string;
          p_note: string;
          p_notify?: boolean;
          p_patch: Json;
        };
        Returns: Json;
      };
      studio_publish_update: {
        Args: { p_base: number; p_id: string; p_note: string; p_patch: Json };
        Returns: Json;
      };
      studio_queue_reader_email: { Args: { p_kind: string; p_ref: string }; Returns: string };
      studio_replace_image: { Args: { p_article: string; p_media: string }; Returns: Json };
      studio_reported_articles: { Args: { p_ids: string[] }; Returns: string[] };
      studio_request_reprocess: { Args: { p_article: string }; Returns: number };
      studio_save_draft: { Args: { p_base: number; p_id: string; p_patch: Json }; Returns: Json };
      studio_set_image_text: {
        Args: {
          p_alt: string;
          p_article: string;
          p_caption: string;
          p_decorative?: boolean;
          p_media: string;
        };
        Returns: Json;
      };
      studio_set_sources: { Args: { p_id: string; p_sources: Json }; Returns: Json };
      studio_snapshot: {
        Args: { a: Database["public"]["Tables"]["articles"]["Row"] };
        Returns: Json;
      };
      studio_words: { Args: { p: string }; Returns: string[] };
      tag_words: { Args: { p: string }; Returns: string[] };
      take_studio_revalidations: {
        Args: Record<PropertyKey, never>;
        Returns: {
          tags: string[];
        }[];
      };
      taxonomy_merge_tags: { Args: { p_from: string; p_into: string }; Returns: number };
      taxonomy_tags: {
        Args: Record<PropertyKey, never>;
        Returns: {
          articles: number;
          items: number;
          tag: string;
        }[];
      };
      topic_candidates: {
        Args: { p_id: string; p_limit: number; p_since: string };
        Returns: {
          centroid: number[];
          topic_id: string;
          updated_at: string;
        }[];
      };
      two_person_error: { Args: { msg: string }; Returns: undefined };
      unaccent: { Args: { "": string }; Returns: string };
      guide_report_venue: {
        Args: { p_contact?: string; p_reason: string; p_venue: string };
        Returns: Json;
      };
      guide_resolve_report: {
        Args: { p_decision: string; p_note?: string; p_report: string };
        Returns: Json;
      };
      can_manage_guide: { Args: { uid: string }; Returns: boolean };
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
      media_rights_status:
        "authorized" | "licensed" | "unknown" | "pending" | "expired" | "blocked";
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
      media_rights_status: ["authorized", "licensed", "unknown", "pending", "expired", "blocked"],
      publish_mode: ["human", "auto"],
      republish_policy: ["link_only", "summary_2_sentences"],
      source_kind: ["rss", "sitemap", "api", "page", "newsletter", "social", "events"],
      source_reliability: ["primary", "verified", "standard", "low"],
      source_status: ["active", "paused", "degraded", "blocked"],
      topic_state: ["em_apuracao", "confirmado", "corrigido", "encerrado"],
    },
  },
} as const;
