export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string;
          admin_id: string;
          created_at: string;
          details: Json | null;
          entity_id: string | null;
          entity_type: string;
          id: string;
        };
        Insert: {
          action: string;
          admin_id: string;
          created_at?: string;
          details?: Json | null;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
        };
        Update: {
          action?: string;
          admin_id?: string;
          created_at?: string;
          details?: Json | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'admin_audit_log_admin_id_fkey';
            columns: ['admin_id'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'admin_audit_log_admin_id_fkey';
            columns: ['admin_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      availability_blocks: {
        Row: {
          created_at: string;
          end_time: string;
          id: string;
          listing_id: string;
          reason: string | null;
          start_time: string;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          id?: string;
          listing_id: string;
          reason?: string | null;
          start_time: string;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          id?: string;
          listing_id?: string;
          reason?: string | null;
          start_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'availability_blocks_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listing_ratings';
            referencedColumns: ['listing_id'];
          },
          {
            foreignKeyName: 'availability_blocks_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      bookings: {
        Row: {
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: Database['public']['Enums']['cancelled_by'] | null;
          checked_in_at: string | null;
          completed_at: string | null;
          created_at: string;
          currency: string;
          end_time: string;
          hold_expires_at: string | null;
          host_id: string;
          host_payout: number;
          id: string;
          listing_id: string;
          reference: string;
          refund_amount: number | null;
          seeker_id: string;
          service_fee: number;
          start_time: string;
          status: Database['public']['Enums']['booking_status'];
          subtotal: number;
          tax: number;
          time_range: unknown;
          total: number;
          updated_at: string;
        };
        Insert: {
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: Database['public']['Enums']['cancelled_by'] | null;
          checked_in_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          end_time: string;
          hold_expires_at?: string | null;
          host_id: string;
          host_payout: number;
          id?: string;
          listing_id: string;
          reference: string;
          refund_amount?: number | null;
          seeker_id: string;
          service_fee?: number;
          start_time: string;
          status?: Database['public']['Enums']['booking_status'];
          subtotal: number;
          tax?: number;
          time_range?: unknown;
          total: number;
          updated_at?: string;
        };
        Update: {
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: Database['public']['Enums']['cancelled_by'] | null;
          checked_in_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          end_time?: string;
          hold_expires_at?: string | null;
          host_id?: string;
          host_payout?: number;
          id?: string;
          listing_id?: string;
          reference?: string;
          refund_amount?: number | null;
          seeker_id?: string;
          service_fee?: number;
          start_time?: string;
          status?: Database['public']['Enums']['booking_status'];
          subtotal?: number;
          tax?: number;
          time_range?: unknown;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listing_ratings';
            referencedColumns: ['listing_id'];
          },
          {
            foreignKeyName: 'bookings_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_seeker_id_fkey';
            columns: ['seeker_id'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_seeker_id_fkey';
            columns: ['seeker_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      disputes: {
        Row: {
          booking_id: string;
          created_at: string;
          id: string;
          raised_by: string;
          reason: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database['public']['Enums']['dispute_status'];
          updated_at: string;
        };
        Insert: {
          booking_id: string;
          created_at?: string;
          id?: string;
          raised_by: string;
          reason: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database['public']['Enums']['dispute_status'];
          updated_at?: string;
        };
        Update: {
          booking_id?: string;
          created_at?: string;
          id?: string;
          raised_by?: string;
          reason?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database['public']['Enums']['dispute_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'disputes_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_raised_by_fkey';
            columns: ['raised_by'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_raised_by_fkey';
            columns: ['raised_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          file_path: string;
          id: string;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          type: Database['public']['Enums']['document_type'];
          updated_at: string;
          user_id: string;
          verified_status: Database['public']['Enums']['verification_status'];
        };
        Insert: {
          created_at?: string;
          file_path: string;
          id?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          type: Database['public']['Enums']['document_type'];
          updated_at?: string;
          user_id: string;
          verified_status?: Database['public']['Enums']['verification_status'];
        };
        Update: {
          created_at?: string;
          file_path?: string;
          id?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          type?: Database['public']['Enums']['document_type'];
          updated_at?: string;
          user_id?: string;
          verified_status?: Database['public']['Enums']['verification_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'documents_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_agreements: {
        Row: {
          agreement_hash: string;
          agreement_version: string;
          host_id: string;
          id: string;
          ip_address: unknown;
          listing_id: string;
          signed_at: string;
          signed_name: string;
          user_agent: string | null;
        };
        Insert: {
          agreement_hash: string;
          agreement_version: string;
          host_id: string;
          id?: string;
          ip_address?: unknown;
          listing_id: string;
          signed_at?: string;
          signed_name: string;
          user_agent?: string | null;
        };
        Update: {
          agreement_hash?: string;
          agreement_version?: string;
          host_id?: string;
          id?: string;
          ip_address?: unknown;
          listing_id?: string;
          signed_at?: string;
          signed_name?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_agreements_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listing_agreements_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listing_agreements_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listing_ratings';
            referencedColumns: ['listing_id'];
          },
          {
            foreignKeyName: 'listing_agreements_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listing_photos: {
        Row: {
          alt_text: string | null;
          created_at: string;
          id: string;
          listing_id: string;
          position: number;
          storage_path: string;
        };
        Insert: {
          alt_text?: string | null;
          created_at?: string;
          id?: string;
          listing_id: string;
          position?: number;
          storage_path: string;
        };
        Update: {
          alt_text?: string | null;
          created_at?: string;
          id?: string;
          listing_id?: string;
          position?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listing_photos_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listing_ratings';
            referencedColumns: ['listing_id'];
          },
          {
            foreignKeyName: 'listing_photos_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      listings: {
        Row: {
          address_line: string;
          agreement_signed_at: string | null;
          approved_at: string | null;
          approved_by: string | null;
          available_from: string | null;
          available_until: string | null;
          capacity: number;
          city: string;
          created_at: string;
          currency: string;
          description: string | null;
          host_id: string;
          id: string;
          lat: number | null;
          lng: number | null;
          locality: string | null;
          location: unknown;
          paused_at: string | null;
          pincode: string | null;
          price_per_day: number | null;
          price_per_hour: number;
          rejection_reason: string | null;
          rules: string | null;
          spot_type: Database['public']['Enums']['spot_type'];
          state: string | null;
          status: Database['public']['Enums']['listing_status'];
          submitted_at: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          address_line: string;
          agreement_signed_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          available_from?: string | null;
          available_until?: string | null;
          capacity?: number;
          city: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          host_id: string;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          locality?: string | null;
          location: unknown;
          paused_at?: string | null;
          pincode?: string | null;
          price_per_day?: number | null;
          price_per_hour: number;
          rejection_reason?: string | null;
          rules?: string | null;
          spot_type: Database['public']['Enums']['spot_type'];
          state?: string | null;
          status?: Database['public']['Enums']['listing_status'];
          submitted_at?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          address_line?: string;
          agreement_signed_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          available_from?: string | null;
          available_until?: string | null;
          capacity?: number;
          city?: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          host_id?: string;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          locality?: string | null;
          location?: unknown;
          paused_at?: string | null;
          pincode?: string | null;
          price_per_day?: number | null;
          price_per_hour?: number;
          rejection_reason?: string | null;
          rules?: string | null;
          spot_type?: Database['public']['Enums']['spot_type'];
          state?: string | null;
          status?: Database['public']['Enums']['listing_status'];
          submitted_at?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'listings_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_log: {
        Row: {
          booking_id: string | null;
          channel: Database['public']['Enums']['notification_channel'];
          created_at: string;
          destination: string;
          error: string | null;
          id: string;
          provider_message_id: string | null;
          sent_at: string | null;
          status: Database['public']['Enums']['notification_status'];
          template: string;
          user_id: string | null;
        };
        Insert: {
          booking_id?: string | null;
          channel: Database['public']['Enums']['notification_channel'];
          created_at?: string;
          destination: string;
          error?: string | null;
          id?: string;
          provider_message_id?: string | null;
          sent_at?: string | null;
          status?: Database['public']['Enums']['notification_status'];
          template: string;
          user_id?: string | null;
        };
        Update: {
          booking_id?: string | null;
          channel?: Database['public']['Enums']['notification_channel'];
          created_at?: string;
          destination?: string;
          error?: string | null;
          id?: string;
          provider_message_id?: string | null;
          sent_at?: string | null;
          status?: Database['public']['Enums']['notification_status'];
          template?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_log_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          booking_id: string;
          captured_at: string | null;
          created_at: string;
          currency: string;
          failed_at: string | null;
          failure_reason: string | null;
          id: string;
          method: string | null;
          provider: string;
          provider_order_id: string | null;
          provider_payload: Json | null;
          provider_payment_id: string | null;
          provider_refund_id: string | null;
          provider_signature: string | null;
          refunded_amount: number;
          status: Database['public']['Enums']['payment_status'];
          updated_at: string;
        };
        Insert: {
          amount: number;
          booking_id: string;
          captured_at?: string | null;
          created_at?: string;
          currency?: string;
          failed_at?: string | null;
          failure_reason?: string | null;
          id?: string;
          method?: string | null;
          provider?: string;
          provider_order_id?: string | null;
          provider_payload?: Json | null;
          provider_payment_id?: string | null;
          provider_refund_id?: string | null;
          provider_signature?: string | null;
          refunded_amount?: number;
          status?: Database['public']['Enums']['payment_status'];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          booking_id?: string;
          captured_at?: string | null;
          created_at?: string;
          currency?: string;
          failed_at?: string | null;
          failure_reason?: string | null;
          id?: string;
          method?: string | null;
          provider?: string;
          provider_order_id?: string | null;
          provider_payload?: Json | null;
          provider_payment_id?: string | null;
          provider_refund_id?: string | null;
          provider_signature?: string | null;
          refunded_amount?: number;
          status?: Database['public']['Enums']['payment_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: true;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
        ];
      };
      payout_bookings: {
        Row: {
          amount: number;
          booking_id: string;
          payout_id: string;
        };
        Insert: {
          amount: number;
          booking_id: string;
          payout_id: string;
        };
        Update: {
          amount?: number;
          booking_id?: string;
          payout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payout_bookings_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: true;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payout_bookings_payout_id_fkey';
            columns: ['payout_id'];
            isOneToOne: false;
            referencedRelation: 'payouts';
            referencedColumns: ['id'];
          },
        ];
      };
      payouts: {
        Row: {
          amount: number;
          created_at: string;
          currency: string;
          failure_reason: string | null;
          host_id: string;
          id: string;
          initiated_by: string | null;
          period_end: string;
          period_start: string;
          processed_at: string | null;
          provider: string;
          provider_payload: Json | null;
          provider_payout_id: string | null;
          status: Database['public']['Enums']['payout_status'];
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          currency?: string;
          failure_reason?: string | null;
          host_id: string;
          id?: string;
          initiated_by?: string | null;
          period_end: string;
          period_start: string;
          processed_at?: string | null;
          provider?: string;
          provider_payload?: Json | null;
          provider_payout_id?: string | null;
          status?: Database['public']['Enums']['payout_status'];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          currency?: string;
          failure_reason?: string | null;
          host_id?: string;
          id?: string;
          initiated_by?: string | null;
          period_end?: string;
          period_start?: string;
          processed_at?: string | null;
          provider?: string;
          provider_payload?: Json | null;
          provider_payout_id?: string | null;
          status?: Database['public']['Enums']['payout_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payouts_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payouts_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payouts_initiated_by_fkey';
            columns: ['initiated_by'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payouts_initiated_by_fkey';
            columns: ['initiated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      reviews: {
        Row: {
          booking_id: string;
          comment: string | null;
          created_at: string;
          created_by: string;
          hidden_at: string | null;
          hidden_by: string | null;
          id: string;
          listing_id: string;
          rating: number;
          updated_at: string;
        };
        Insert: {
          booking_id: string;
          comment?: string | null;
          created_at?: string;
          created_by: string;
          hidden_at?: string | null;
          hidden_by?: string | null;
          id?: string;
          listing_id: string;
          rating: number;
          updated_at?: string;
        };
        Update: {
          booking_id?: string;
          comment?: string | null;
          created_at?: string;
          created_by?: string;
          hidden_at?: string | null;
          hidden_by?: string | null;
          id?: string;
          listing_id?: string;
          rating?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reviews_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_hidden_by_fkey';
            columns: ['hidden_by'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_hidden_by_fkey';
            columns: ['hidden_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listing_ratings';
            referencedColumns: ['listing_id'];
          },
          {
            foreignKeyName: 'reviews_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'listings';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          kyc_status: Database['public']['Enums']['kyc_status'];
          name: string | null;
          phone: string;
          role: Database['public']['Enums']['user_role'];
          suspended_at: string | null;
          suspended_reason: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id: string;
          kyc_status?: Database['public']['Enums']['kyc_status'];
          name?: string | null;
          phone: string;
          role?: Database['public']['Enums']['user_role'];
          suspended_at?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          kyc_status?: Database['public']['Enums']['kyc_status'];
          name?: string | null;
          phone?: string;
          role?: Database['public']['Enums']['user_role'];
          suspended_at?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      host_profiles: {
        Row: {
          host_since: string | null;
          id: string | null;
          name: string | null;
        };
        Insert: {
          host_since?: string | null;
          id?: string | null;
          name?: string | null;
        };
        Update: {
          host_since?: string | null;
          id?: string | null;
          name?: string | null;
        };
        Relationships: [];
      };
      listing_ratings: {
        Row: {
          average_rating: number | null;
          host_id: string | null;
          listing_id: string | null;
          review_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'listings_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'host_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listings_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      complete_elapsed_bookings: { Args: never; Returns: number };
      current_role_value: {
        Args: never;
        Returns: Database['public']['Enums']['user_role'];
      };
      expire_unpaid_bookings: { Args: never; Returns: number };
      generate_booking_reference: { Args: never; Returns: string };
      host_onboarding_complete: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      host_payout_due: {
        Args: { p_host_id: string };
        Returns: {
          booking_count: number;
          is_due: boolean;
          oldest_completed_at: string;
          total_amount: number;
        }[];
      };
      is_admin: { Args: never; Returns: boolean };
      is_suspended: { Args: never; Returns: boolean };
      listing_available_slots: {
        Args: { p_end_time: string; p_listing_id: string; p_start_time: string };
        Returns: number;
      };
      promote_to_host: { Args: never; Returns: undefined };
      repack_listing_photo_positions: {
        Args: { p_listing_id: string };
        Returns: undefined;
      };
      search_nearby_listings: {
        Args: {
          p_end_time?: string;
          p_lat: number;
          p_limit?: number;
          p_lng: number;
          p_max_price?: number;
          p_min_price?: number;
          p_offset?: number;
          p_radius_meters?: number;
          p_spot_types?: Database['public']['Enums']['spot_type'][];
          p_start_time?: string;
        };
        Returns: {
          address_line: string;
          available_slots: number;
          average_rating: number;
          capacity: number;
          city: string;
          distance_meters: number;
          host_id: string;
          id: string;
          lat: number;
          lng: number;
          locality: string;
          price_per_day: number;
          price_per_hour: number;
          primary_photo_path: string;
          review_count: number;
          spot_type: Database['public']['Enums']['spot_type'];
          title: string;
        }[];
      };
      unpaid_host_earnings: {
        Args: {
          p_host_id: string;
          p_period_end: string;
          p_period_start: string;
        };
        Returns: {
          amount: number;
          booking_id: string;
          completed_at: string;
          reference: string;
        }[];
      };
      upsert_listing: {
        Args: {
          p_address_line: string;
          p_available_from?: string;
          p_available_until?: string;
          p_capacity?: number;
          p_city: string;
          p_description?: string;
          p_id?: string;
          p_lat: number;
          p_lng: number;
          p_locality?: string;
          p_pincode?: string;
          p_price_per_day?: number;
          p_price_per_hour: number;
          p_rules?: string;
          p_spot_type: Database['public']['Enums']['spot_type'];
          p_state?: string;
          p_title: string;
        };
        Returns: string;
      };
    };
    Enums: {
      booking_status:
        'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'payment_failed';
      cancelled_by: 'seeker' | 'host' | 'admin' | 'system';
      dispute_status: 'open' | 'resolved_refund' | 'resolved_no_action';
      document_type: 'identity_proof' | 'address_proof' | 'bank_details';
      kyc_status: 'not_started' | 'pending' | 'verified' | 'rejected';
      listing_status: 'draft' | 'pending' | 'live' | 'paused' | 'rejected';
      notification_channel: 'sms' | 'whatsapp' | 'email';
      notification_status: 'queued' | 'sent' | 'failed';
      payment_status:
        'created' | 'authorized' | 'captured' | 'failed' | 'refunded' | 'partially_refunded';
      payout_status: 'pending' | 'processing' | 'paid' | 'failed';
      spot_type: 'open' | 'covered' | 'basement' | 'stilt' | 'garage' | 'driveway';
      user_role: 'seeker' | 'host' | 'admin';
      verification_status: 'pending' | 'verified' | 'rejected';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_status: ['pending_payment', 'confirmed', 'completed', 'cancelled', 'payment_failed'],
      cancelled_by: ['seeker', 'host', 'admin', 'system'],
      dispute_status: ['open', 'resolved_refund', 'resolved_no_action'],
      document_type: ['identity_proof', 'address_proof', 'bank_details'],
      kyc_status: ['not_started', 'pending', 'verified', 'rejected'],
      listing_status: ['draft', 'pending', 'live', 'paused', 'rejected'],
      notification_channel: ['sms', 'whatsapp', 'email'],
      notification_status: ['queued', 'sent', 'failed'],
      payment_status: [
        'created',
        'authorized',
        'captured',
        'failed',
        'refunded',
        'partially_refunded',
      ],
      payout_status: ['pending', 'processing', 'paid', 'failed'],
      spot_type: ['open', 'covered', 'basement', 'stilt', 'garage', 'driveway'],
      user_role: ['seeker', 'host', 'admin'],
      verification_status: ['pending', 'verified', 'rejected'],
    },
  },
} as const;
