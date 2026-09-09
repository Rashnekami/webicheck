import { supabase } from "@/integrations/supabase/client";
import type { SignalCampaign, SignalCampaignCase } from "@/lib/signal-audit";

// Tipos gerados serão atualizados após a próxima regeneração do schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function listSignalCampaigns(): Promise<SignalCampaign[]> {
  const { data, error } = await db
    .from("signal_campaigns")
    .select("id, city, name, status, started_at, baseline_locked_at, closed_at")
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SignalCampaign[];
}

export async function listSignalCampaignCases(campaignId?: string): Promise<SignalCampaignCase[]> {
  let query = db
    .from("signal_campaign_cases")
    .select("campaign_id, signal_case_id, city, board, port, baseline_signal_1310, baseline_signal_1490, baseline_difference_db, baseline_issue_kind, baseline_severity, first_seen_at");
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SignalCampaignCase[];
}

export async function lockSignalCampaign(campaignId: string) {
  const { data, error } = await db
    .from("signal_campaigns")
    .update({ status: "active", baseline_locked_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "building")
    .select("id, city, name, status, started_at, baseline_locked_at, closed_at")
    .single();
  if (error) throw error;
  return data as SignalCampaign;
}
