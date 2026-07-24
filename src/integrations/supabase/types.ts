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
      assets: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          purchase_price: number
          purchase_txn_id: string | null
          scrap_txn_id: string | null
          scrap_value: number | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          purchase_price: number
          purchase_txn_id?: string | null
          scrap_txn_id?: string | null
          scrap_value?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          purchase_price?: number
          purchase_txn_id?: string | null
          scrap_txn_id?: string | null
          scrap_value?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_purchase_txn_id_fkey"
            columns: ["purchase_txn_id"]
            isOneToOne: false
            referencedRelation: "fund_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_scrap_txn_id_fkey"
            columns: ["scrap_txn_id"]
            isOneToOne: false
            referencedRelation: "fund_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payment_requests: {
        Row: {
          amount: number
          created_at: string
          customer_user_id: string
          id: string
          loan_id: string
          note: string | null
          payment_date: string | null
          payment_method: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          customer_user_id: string
          id?: string
          loan_id: string
          note?: string | null
          payment_date?: string | null
          payment_method?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          customer_user_id?: string
          id?: string
          loan_id?: string
          note?: string | null
          payment_date?: string | null
          payment_method?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_requests_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "islamic_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_requests_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "islamic_loans_public"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          member_id: string
          month_year: string | null
          payment_method: string | null
          status: string | null
          transaction_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          member_id: string
          month_year?: string | null
          payment_method?: string | null
          status?: string | null
          transaction_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          member_id?: string
          month_year?: string | null
          payment_method?: string | null
          status?: string | null
          transaction_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_transactions: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          reason: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          reason?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          reason?: string | null
          type?: string
        }
        Relationships: []
      }
      islamic_loan_member_shares: {
        Row: {
          created_at: string
          deposit_snapshot: number
          id: string
          is_member_deleted: boolean
          loan_id: string
          member_id: string | null
          member_name: string
          share_percentage: number
        }
        Insert: {
          created_at?: string
          deposit_snapshot?: number
          id?: string
          is_member_deleted?: boolean
          loan_id: string
          member_id?: string | null
          member_name: string
          share_percentage?: number
        }
        Update: {
          created_at?: string
          deposit_snapshot?: number
          id?: string
          is_member_deleted?: boolean
          loan_id?: string
          member_id?: string | null
          member_name?: string
          share_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "islamic_loan_member_shares_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "islamic_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loan_member_shares_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "islamic_loans_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loan_member_shares_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loan_member_shares_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      islamic_loan_payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          id: string
          loan_id: string
          payment_date: string | null
          payment_method: string | null
          payment_type: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          loan_id: string
          payment_date?: string | null
          payment_method?: string | null
          payment_type?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          loan_id?: string
          payment_date?: string | null
          payment_method?: string | null
          payment_type?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "islamic_loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "islamic_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "islamic_loans_public"
            referencedColumns: ["id"]
          },
        ]
      }
      islamic_loans: {
        Row: {
          admin_profit_pct: number
          advance_amount: number
          borrower_name: string | null
          borrower_phone: string | null
          closed_at: string | null
          code: string
          comments: string | null
          created_at: string | null
          customer_user_id: string | null
          discount_credit_from_loan: string | null
          discount_credit_used: boolean | null
          discount_pct: number | null
          excluded_member_ids: string[]
          exclusion_reasons: Json
          fund_profit_pct: number | null
          id: string
          issue_date: string | null
          media_person_id: string | null
          media_person_profit_pct: number | null
          monthly_installment: number | null
          months_paid_early: number | null
          payment_methods: Json
          product_name: string | null
          profit_percentage: number | null
          purchase_price: number
          relationship: string | null
          relative_name: string | null
          relative_phone: string | null
          remaining_amount: number | null
          secondary_media_person_id: string | null
          sell_price: number
          status: string | null
          tenure_months: number
        }
        Insert: {
          admin_profit_pct?: number
          advance_amount?: number
          borrower_name?: string | null
          borrower_phone?: string | null
          closed_at?: string | null
          code: string
          comments?: string | null
          created_at?: string | null
          customer_user_id?: string | null
          discount_credit_from_loan?: string | null
          discount_credit_used?: boolean | null
          discount_pct?: number | null
          excluded_member_ids?: string[]
          exclusion_reasons?: Json
          fund_profit_pct?: number | null
          id?: string
          issue_date?: string | null
          media_person_id?: string | null
          media_person_profit_pct?: number | null
          monthly_installment?: number | null
          months_paid_early?: number | null
          payment_methods?: Json
          product_name?: string | null
          profit_percentage?: number | null
          purchase_price: number
          relationship?: string | null
          relative_name?: string | null
          relative_phone?: string | null
          remaining_amount?: number | null
          secondary_media_person_id?: string | null
          sell_price: number
          status?: string | null
          tenure_months: number
        }
        Update: {
          admin_profit_pct?: number
          advance_amount?: number
          borrower_name?: string | null
          borrower_phone?: string | null
          closed_at?: string | null
          code?: string
          comments?: string | null
          created_at?: string | null
          customer_user_id?: string | null
          discount_credit_from_loan?: string | null
          discount_credit_used?: boolean | null
          discount_pct?: number | null
          excluded_member_ids?: string[]
          exclusion_reasons?: Json
          fund_profit_pct?: number | null
          id?: string
          issue_date?: string | null
          media_person_id?: string | null
          media_person_profit_pct?: number | null
          monthly_installment?: number | null
          months_paid_early?: number | null
          payment_methods?: Json
          product_name?: string | null
          profit_percentage?: number | null
          purchase_price?: number
          relationship?: string | null
          relative_name?: string | null
          relative_phone?: string | null
          remaining_amount?: number | null
          secondary_media_person_id?: string | null
          sell_price?: number
          status?: string | null
          tenure_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "islamic_loans_discount_credit_from_loan_fkey"
            columns: ["discount_credit_from_loan"]
            isOneToOne: false
            referencedRelation: "islamic_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loans_discount_credit_from_loan_fkey"
            columns: ["discount_credit_from_loan"]
            isOneToOne: false
            referencedRelation: "islamic_loans_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loans_media_person_id_fkey"
            columns: ["media_person_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loans_media_person_id_fkey"
            columns: ["media_person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loans_secondary_media_person_id_fkey"
            columns: ["secondary_media_person_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loans_secondary_media_person_id_fkey"
            columns: ["secondary_media_person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      islamic_tenure_options: {
        Row: {
          created_at: string
          id: string
          months: number
          profit_pct: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          months: number
          profit_pct: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          months?: number
          profit_pct?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      member_loan_repayments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          id: string
          loan_id: string
          payment_method: string | null
          status: string
          transaction_number: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          loan_id: string
          payment_method?: string | null
          status?: string
          transaction_number?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          loan_id?: string
          payment_method?: string | null
          status?: string
          transaction_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "member_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      member_loans: {
        Row: {
          approved_amount: number | null
          approved_at: string | null
          created_at: string | null
          defaulted: boolean
          due_date: string | null
          id: string
          member_id: string
          reason: string | null
          repaid_amount: number | null
          requested_amount: number
          status: string | null
        }
        Insert: {
          approved_amount?: number | null
          approved_at?: string | null
          created_at?: string | null
          defaulted?: boolean
          due_date?: string | null
          id?: string
          member_id: string
          reason?: string | null
          repaid_amount?: number | null
          requested_amount: number
          status?: string | null
        }
        Update: {
          approved_amount?: number | null
          approved_at?: string | null
          created_at?: string | null
          defaulted?: boolean
          due_date?: string | null
          id?: string
          member_id?: string
          reason?: string | null
          repaid_amount?: number | null
          requested_amount?: number
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          tag: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          tag?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          tag?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_method_defaults: {
        Row: {
          audience: string
          created_at: string
          id: string
          label: string
          note: string | null
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          audience?: string
          created_at?: string
          id?: string
          label: string
          note?: string | null
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          audience?: string
          created_at?: string
          id?: string
          label?: string
          note?: string | null
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      percentage_defaults: {
        Row: {
          admin_pct: number
          fund_pct: number
          id: string
          manager_pct: number
          media_person_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_pct?: number
          fund_pct?: number
          id?: string
          manager_pct?: number
          media_person_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_pct?: number
          fund_pct?: number
          id?: string
          manager_pct?: number
          media_person_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      phone_book: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          phone_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          phone_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          phone_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          deleted_name: string | null
          full_name: string | null
          id: string
          is_customer: boolean
          is_deleted: boolean
          nid_card: string | null
          phone: string | null
          total_deposited: number | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_name?: string | null
          full_name?: string | null
          id: string
          is_customer?: boolean
          is_deleted?: boolean
          nid_card?: string | null
          phone?: string | null
          total_deposited?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_name?: string | null
          full_name?: string | null
          id?: string
          is_customer?: boolean
          is_deleted?: boolean
          nid_card?: string | null
          phone?: string | null
          total_deposited?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profit_distributions: {
        Row: {
          amount: number
          created_at: string | null
          distribution_type: string | null
          id: string
          member_id: string | null
          share_percentage: number | null
          source_id: string
          source_type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          distribution_type?: string | null
          id?: string
          member_id?: string | null
          share_percentage?: number | null
          source_id: string
          source_type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          distribution_type?: string | null
          id?: string
          member_id?: string | null
          share_percentage?: number | null
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_distributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_distributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_member_shares: {
        Row: {
          created_at: string
          deposit_snapshot: number
          id: string
          is_member_deleted: boolean
          member_id: string | null
          member_name: string
          project_id: string
          share_percentage: number
        }
        Insert: {
          created_at?: string
          deposit_snapshot?: number
          id?: string
          is_member_deleted?: boolean
          member_id?: string | null
          member_name: string
          project_id: string
          share_percentage?: number
        }
        Update: {
          created_at?: string
          deposit_snapshot?: number
          id?: string
          is_member_deleted?: boolean
          member_id?: string | null
          member_name?: string
          project_id?: string
          share_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_member_shares_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_member_shares_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_member_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_transactions: {
        Row: {
          amount: number
          comments: string | null
          created_at: string | null
          created_by: string | null
          id: string
          project_id: string
          reason: string | null
          type: string
        }
        Insert: {
          amount: number
          comments?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id: string
          reason?: string | null
          type: string
        }
        Update: {
          amount?: number
          comments?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id?: string
          reason?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          admin_profit_pct: number
          budget_amount: number
          budget_returned: number
          closed_at: string | null
          code: string
          comments: string | null
          created_at: string | null
          excluded_member_ids: string[]
          exclusion_reasons: Json
          extra_funds_approved: number
          fund_profit_pct: number | null
          id: string
          issue_date: string | null
          manager_id: string | null
          manager_profit_pct: number | null
          name: string
          secondary_manager_id: string | null
          status: string | null
        }
        Insert: {
          admin_profit_pct?: number
          budget_amount?: number
          budget_returned?: number
          closed_at?: string | null
          code: string
          comments?: string | null
          created_at?: string | null
          excluded_member_ids?: string[]
          exclusion_reasons?: Json
          extra_funds_approved?: number
          fund_profit_pct?: number | null
          id?: string
          issue_date?: string | null
          manager_id?: string | null
          manager_profit_pct?: number | null
          name: string
          secondary_manager_id?: string | null
          status?: string | null
        }
        Update: {
          admin_profit_pct?: number
          budget_amount?: number
          budget_returned?: number
          closed_at?: string | null
          code?: string
          comments?: string | null
          created_at?: string | null
          excluded_member_ids?: string[]
          exclusion_reasons?: Json
          extra_funds_approved?: number
          fund_profit_pct?: number | null
          id?: string
          issue_date?: string | null
          manager_id?: string | null
          manager_profit_pct?: number | null
          name?: string
          secondary_manager_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_secondary_manager_id_fkey"
            columns: ["secondary_manager_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_secondary_manager_id_fkey"
            columns: ["secondary_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tutorials: {
        Row: {
          audiences: string[]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          title: string
          updated_at: string
          youtube_url: string
        }
        Insert: {
          audiences?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          title: string
          updated_at?: string
          youtube_url: string
        }
        Update: {
          audiences?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          youtube_url?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      welfare_deductions: {
        Row: {
          amount_per_member: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          member_count: number | null
          period_end: string
          status: string
          total_amount: number | null
        }
        Insert: {
          amount_per_member?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          member_count?: number | null
          period_end: string
          status?: string
          total_amount?: number | null
        }
        Update: {
          amount_per_member?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          member_count?: number | null
          period_end?: string
          status?: string
          total_amount?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      islamic_loans_public: {
        Row: {
          admin_profit_pct: number | null
          borrower_name: string | null
          closed_at: string | null
          code: string | null
          comments: string | null
          created_at: string | null
          customer_user_id: string | null
          discount_credit_from_loan: string | null
          discount_credit_used: boolean | null
          discount_pct: number | null
          fund_profit_pct: number | null
          id: string | null
          media_person_id: string | null
          media_person_profit_pct: number | null
          monthly_installment: number | null
          months_paid_early: number | null
          product_name: string | null
          profit_percentage: number | null
          purchase_price: number | null
          remaining_amount: number | null
          sell_price: number | null
          status: string | null
          tenure_months: number | null
        }
        Insert: {
          admin_profit_pct?: number | null
          borrower_name?: string | null
          closed_at?: string | null
          code?: string | null
          comments?: string | null
          created_at?: string | null
          customer_user_id?: string | null
          discount_credit_from_loan?: string | null
          discount_credit_used?: boolean | null
          discount_pct?: number | null
          fund_profit_pct?: number | null
          id?: string | null
          media_person_id?: string | null
          media_person_profit_pct?: number | null
          monthly_installment?: number | null
          months_paid_early?: number | null
          product_name?: string | null
          profit_percentage?: number | null
          purchase_price?: number | null
          remaining_amount?: number | null
          sell_price?: number | null
          status?: string | null
          tenure_months?: number | null
        }
        Update: {
          admin_profit_pct?: number | null
          borrower_name?: string | null
          closed_at?: string | null
          code?: string | null
          comments?: string | null
          created_at?: string | null
          customer_user_id?: string | null
          discount_credit_from_loan?: string | null
          discount_credit_used?: boolean | null
          discount_pct?: number | null
          fund_profit_pct?: number | null
          id?: string | null
          media_person_id?: string | null
          media_person_profit_pct?: number | null
          monthly_installment?: number | null
          months_paid_early?: number | null
          product_name?: string | null
          profit_percentage?: number | null
          purchase_price?: number | null
          remaining_amount?: number | null
          sell_price?: number | null
          status?: string | null
          tenure_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "islamic_loans_discount_credit_from_loan_fkey"
            columns: ["discount_credit_from_loan"]
            isOneToOne: false
            referencedRelation: "islamic_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loans_discount_credit_from_loan_fkey"
            columns: ["discount_credit_from_loan"]
            isOneToOne: false
            referencedRelation: "islamic_loans_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loans_media_person_id_fkey"
            columns: ["media_person_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "islamic_loans_media_person_id_fkey"
            columns: ["media_person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_directory: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          deleted_name: string | null
          full_name: string | null
          id: string | null
          is_customer: boolean | null
          is_deleted: boolean | null
          total_deposited: number | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_name?: string | null
          full_name?: string | null
          id?: string | null
          is_customer?: boolean | null
          is_deleted?: boolean | null
          total_deposited?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_name?: string | null
          full_name?: string | null
          id?: string | null
          is_customer?: boolean | null
          is_deleted?: boolean | null
          total_deposited?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_welfare_deduction: { Args: { _id: string }; Returns: undefined }
      ensure_current_welfare_cycle: { Args: never; Returns: undefined }
      get_internal_secret: { Args: { _name: string }; Returns: string }
      get_member_deposit_months: {
        Args: never
        Returns: {
          created_at: string
          member_id: string
          month_year: string
          status: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notify_admins: {
        Args: { _message: string; _tag?: string; _title: string; _url?: string }
        Returns: undefined
      }
      record_islamic_loan_payment:
        | {
            Args: {
              _amount: number
              _loan_id: string
              _payment_method?: string
              _payment_type?: string
              _transaction_id?: string
            }
            Returns: string
          }
        | {
            Args: {
              _amount: number
              _loan_id: string
              _payment_date?: string
              _payment_method?: string
              _payment_type?: string
              _transaction_id?: string
            }
            Returns: string
          }
      reject_welfare_deduction: { Args: { _id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "member"
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
      app_role: ["admin", "member"],
    },
  },
} as const
