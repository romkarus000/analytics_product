export type Project = {
  id: number;
  name: string;
  timezone: string;
  created_at?: string;
  currency?: string;
};

export type UploadRecord = {
  id: number;
  project_id: number;
  type: "transactions" | "marketing_spend";
  status: "uploaded" | "validated" | "imported" | "failed";
  original_filename: string;
  created_at: string;
  file_path: string;
  include_in_dashboard?: boolean;
  used_in_dashboard?: boolean;
  is_used_in_dashboard?: boolean;
  enabled?: boolean;
  active?: boolean;
};
