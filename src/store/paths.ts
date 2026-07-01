export const WORKFLOW_DATA_TOKEN = "{alfred_workflow_data}";
export const WORKFLOW_CACHE_TOKEN = "{alfred_workflow_cache}";

export interface StorePathTemplate {
  historyFile: string;
  archiveDir: string;
  cacheDir: string;
}

export const DEFAULT_STORE_PATHS: StorePathTemplate = {
  historyFile: `${WORKFLOW_DATA_TOKEN}/chat.json`,
  archiveDir: `${WORKFLOW_DATA_TOKEN}/archive`,
  cacheDir: WORKFLOW_CACHE_TOKEN,
};
