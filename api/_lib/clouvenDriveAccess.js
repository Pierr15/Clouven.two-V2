import { adminSupabase } from "./supabaseAdmin.js";
import { createDriveAccessService } from "./clouvenDriveService.js";
import { getDriveStorageQuota } from "./drive.js";

const service = createDriveAccessService(adminSupabase, { getQuota: getDriveStorageQuota });
export const resolveDriveItemAccess = service.resolveDriveItemAccess;
export const listVisibleDriveItems = service.listVisibleDriveItems;
export const listTrashedDriveItems = service.listTrashedDriveItems;
export const getVisibleDriveOverview = service.getVisibleDriveOverview;
