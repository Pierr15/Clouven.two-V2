import {adminSupabase,verifyPermission} from "../_lib/supabaseAdmin.js";
export default async function handler(req,res) {
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  try {
    const actor=await verifyPermission(req,"reset_password"), {uid,password}=req.body||{};
    if(!uid||uid===actor.uid||typeof password!=="string"||password.length<6||password.length>128)return res.status(400).json({error:"Pilih akun lain dan password sepanjang 6–128 karakter."});
    const {data:target,error}=await adminSupabase.from("members").select("id").eq("id",uid).maybeSingle();
    if(error)throw error;
    if(!target)return res.status(404).json({error:"Akun tidak ditemukan."});
    const {error:updateError}=await adminSupabase.auth.admin.updateUserById(uid,{password});
    if(updateError)throw updateError;
    return res.status(200).json({ok:true});
  }catch(error){return res.status(error.status||500).json({error:error.status?error.message:"Password belum dapat direset. Coba lagi."});}
}
