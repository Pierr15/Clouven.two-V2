import { adminSupabase } from "./supabaseAdmin.js";
import { createDriveAccessService } from "./clouvenDriveService.js";

const service = createDriveAccessService(adminSupabase);
export const resolveDriveItemAccess = service.resolveDriveItemAccess;
export const listVisibleDriveItems = service.listVisibleDriveItems;
export const getVisibleDriveOverview = service.getVisibleDriveOverview;
