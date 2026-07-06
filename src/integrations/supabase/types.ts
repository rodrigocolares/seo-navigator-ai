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
      export_logs: {
        Row: {
          created_at: string
          error_message: string | null
          file_name: string
          format: string
          id: string
          report_type: string
          scan_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_name: string
          format: string
          id?: string
          report_type: string
          scan_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_name?: string
          format?: string
          id?: string
          report_type?: string
          scan_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_logs_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          plan: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          plan?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          plan?: string
        }
        Relationships: []
      }
      scan_issues: {
        Row: {
          category: string
          created_at: string
          description: string | null
          effort: string | null
          id: string
          impact: string | null
          page_id: string | null
          recommendation: string | null
          scan_id: string
          severity: Database["public"]["Enums"]["severity"]
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          effort?: string | null
          id?: string
          impact?: string | null
          page_id?: string | null
          recommendation?: string | null
          scan_id: string
          severity?: Database["public"]["Enums"]["severity"]
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          effort?: string | null
          id?: string
          impact?: string | null
          page_id?: string | null
          recommendation?: string | null
          scan_id?: string
          severity?: Database["public"]["Enums"]["severity"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_issues_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "scan_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_issues_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_job_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          job_id: string | null
          level: string
          message: string
          scan_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          job_id?: string | null
          level?: string
          message: string
          scan_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          job_id?: string | null
          level?: string
          message?: string
          scan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_job_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_job_logs_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          failed_at: string | null
          id: string
          job_type: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          priority: number
          run_after: string
          scan_id: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_type: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          run_after?: string
          scan_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_type?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          run_after?: string
          scan_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_jobs_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_pages: {
        Row: {
          canonical: string | null
          content_type: string | null
          created_at: string
          data: Json
          h1_count: number | null
          h2_count: number | null
          has_og: boolean | null
          has_schema: boolean | null
          id: string
          images_missing_alt: number | null
          images_total: number | null
          is_https: boolean | null
          lang: string | null
          links_external: number | null
          links_internal: number | null
          meta_description: string | null
          response_ms: number | null
          robots_meta: string | null
          scan_id: string
          size_bytes: number | null
          status_code: number | null
          title: string | null
          url: string
          viewport: string | null
          word_count: number | null
        }
        Insert: {
          canonical?: string | null
          content_type?: string | null
          created_at?: string
          data?: Json
          h1_count?: number | null
          h2_count?: number | null
          has_og?: boolean | null
          has_schema?: boolean | null
          id?: string
          images_missing_alt?: number | null
          images_total?: number | null
          is_https?: boolean | null
          lang?: string | null
          links_external?: number | null
          links_internal?: number | null
          meta_description?: string | null
          response_ms?: number | null
          robots_meta?: string | null
          scan_id: string
          size_bytes?: number | null
          status_code?: number | null
          title?: string | null
          url: string
          viewport?: string | null
          word_count?: number | null
        }
        Update: {
          canonical?: string | null
          content_type?: string | null
          created_at?: string
          data?: Json
          h1_count?: number | null
          h2_count?: number | null
          has_og?: boolean | null
          has_schema?: boolean | null
          id?: string
          images_missing_alt?: number | null
          images_total?: number | null
          is_https?: boolean | null
          lang?: string | null
          links_external?: number | null
          links_internal?: number | null
          meta_description?: string | null
          response_ms?: number | null
          robots_meta?: string | null
          scan_id?: string
          size_bytes?: number | null
          status_code?: number | null
          title?: string | null
          url?: string
          viewport?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_pages_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          ai_error: string | null
          ai_report: Json | null
          cancelled_at: string | null
          completed_at: string | null
          crawler_mode: string
          created_at: string
          current_url: string | null
          error_message: string | null
          estimated_remaining_seconds: number | null
          failed_at: string | null
          finished_at: string | null
          host: string
          id: string
          max_pages: number
          pages_crawled: number
          pages_discovered: number
          pages_failed: number
          pages_processed: number
          progress: number
          retry_count: number
          scores: Json
          started_at: string
          status: Database["public"]["Enums"]["scan_status"]
          url: string
          user_id: string
        }
        Insert: {
          ai_error?: string | null
          ai_report?: Json | null
          cancelled_at?: string | null
          completed_at?: string | null
          crawler_mode?: string
          created_at?: string
          current_url?: string | null
          error_message?: string | null
          estimated_remaining_seconds?: number | null
          failed_at?: string | null
          finished_at?: string | null
          host: string
          id?: string
          max_pages?: number
          pages_crawled?: number
          pages_discovered?: number
          pages_failed?: number
          pages_processed?: number
          progress?: number
          retry_count?: number
          scores?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["scan_status"]
          url: string
          user_id: string
        }
        Update: {
          ai_error?: string | null
          ai_report?: Json | null
          cancelled_at?: string | null
          completed_at?: string | null
          crawler_mode?: string
          created_at?: string
          current_url?: string | null
          error_message?: string | null
          estimated_remaining_seconds?: number | null
          failed_at?: string | null
          finished_at?: string | null
          host?: string
          id?: string
          max_pages?: number
          pages_crawled?: number
          pages_discovered?: number
          pages_failed?: number
          pages_processed?: number
          progress?: number
          retry_count?: number
          scores?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["scan_status"]
          url?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_scan_jobs: {
        Args: { _limit: number; _worker: string }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          failed_at: string | null
          id: string
          job_type: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          priority: number
          run_after: string
          scan_id: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "scan_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      scan_status: "queued" | "crawling" | "analyzing" | "completed" | "failed"
      severity: "low" | "medium" | "high"
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
      scan_status: ["queued", "crawling", "analyzing", "completed", "failed"],
      severity: ["low", "medium", "high"],
    },
  },
} as const
