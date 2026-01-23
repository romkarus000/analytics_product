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
  mapping_status: "mapped" | "unmapped";
  original_filename: string;
  created_at: string;
  file_path: string;
  used_in_dashboard: boolean;
};
