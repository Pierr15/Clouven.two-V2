import {adminSupabase, verifyPermission} from "../_lib/supabaseAdmin.js";
import {profilePatch, rejectFields} from "../_lib/profiles.js";
export default async function handler(req,res) {
  if (req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  try {
    const actor=await verifyPermission(req,"edit_self"), input=req.body||{};
    rejectFields(input,["name","number","classRole","quote","photo"]);
    const patch=profilePatch(input);
    const {error}=await adminSupabase.from("members").update({...patch,updated_at:new Date().toISOString(),updated_by:actor.uid}).eq("id",actor.uid);
    if(error)throw error;
    return res.status(200).json({ok:true});
  } catch(error) {return res.status(error.status||500).json({error:error.status?error.message:"Profil belum dapat disimpan. Coba lagi."});}
}
