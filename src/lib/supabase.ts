import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: 'ADMIN' | 'EDITOR';
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: 'ADMIN' | 'EDITOR';
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: 'ADMIN' | 'EDITOR';
          created_at?: string;
        };
      };
      media: {
        Row: {
          id: string;
          name: string;
          public_key: string;
          domains: string[];
          status: 'ACTIVE' | 'PAUSED';
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          public_key: string;
          domains?: string[];
          status?: 'ACTIVE' | 'PAUSED';
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          public_key?: string;
          domains?: string[];
          status?: 'ACTIVE' | 'PAUSED';
          created_by?: string | null;
          created_at?: string;
        };
      };
      slots: {
        Row: {
          id: string;
          media_id: string;
          slug: string;
          width: number | null;
          height: number | null;
          status: 'ACTIVE' | 'PAUSED';
          created_at: string;
        };
        Insert: {
          id?: string;
          media_id: string;
          slug: string;
          width?: number | null;
          height?: number | null;
          status?: 'ACTIVE' | 'PAUSED';
          created_at?: string;
        };
        Update: {
          id?: string;
          media_id?: string;
          slug?: string;
          width?: number | null;
          height?: number | null;
          status?: 'ACTIVE' | 'PAUSED';
          created_at?: string;
        };
      };
      creatives: {
        Row: {
          id: string;
          type: 'IMAGE' | 'GIF' | 'VIDEO' | 'HTML';
          src: string | null;
          src2: string | null;
          html: string | null;
          click_url: string | null;
          width: number | null;
          height: number | null;
          duration_ms: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: 'IMAGE' | 'GIF' | 'VIDEO' | 'HTML';
          src?: string | null;
          src2?: string | null;
          html?: string | null;
          click_url?: string | null;
          width?: number | null;
          height?: number | null;
          duration_ms?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: 'IMAGE' | 'GIF' | 'VIDEO' | 'HTML';
          src?: string | null;
          src2?: string | null;
          html?: string | null;
          click_url?: string | null;
          width?: number | null;
          height?: number | null;
          duration_ms?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
      };
      assignments: {
        Row: {
          id: string;
          slot_id: string;
          creative_id: string | null;
          is_active: boolean;
          weight: number;
          start_at: string | null;
          end_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slot_id: string;
          creative_id?: string | null;
          is_active?: boolean;
          weight?: number;
          start_at?: string | null;
          end_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slot_id?: string;
          creative_id?: string | null;
          is_active?: boolean;
          weight?: number;
          start_at?: string | null;
          end_at?: string | null;
          updated_at?: string;
        };
      };
      metrics: {
        Row: {
          id: number;
          media_id: string | null;
          slot_id: string | null;
          creative_id: string | null;
          type: 'IMPRESSION' | 'CLICK';
          user_agent: string | null;
          ip: string | null;
          referrer: string | null;
          created_at: string;
        };
      };
    };
  };
};
