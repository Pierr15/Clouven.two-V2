import {adminSupabase,verifyPermission} from "../_lib/supabaseAdmin.js";
export default async function handler(req,res) {
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  try {
    const actor=await verifyPermission(req,"delete_user"), {uid,confirmation}=req.body||{};
    if(!uid||uid===actor.uid) return res.status(400).json({error:"Akun yang sedang digunakan tidak dapat dihapus di sini."});
    const {data:target,error}=await adminSupabase.from("members").select("id,username,role").eq("id",uid).maybeSingle();
    if(error)throw error;
    if(!target)return res.status(404).json({error:"Akun tidak ditemukan."});
    if(confirmation!==target.username)return res.status(400).json({error:"Ketik username akun dengan tepat untuk menghapus."});
    if(target.role==="developer"){
      const {data:developers,error:listError}=await adminSupabase.from("members").select("id").eq("role","developer");
      if(listError)throw listError;
      if(developers.length<=1)return res.status(409).json({error:"Developer terakhir harus dipertahankan."});
    }
    const {error:deleteError}=await adminSupabase.auth.admin.deleteUser(uid);
    if(deleteError)throw deleteError;
    return res.status(200).json({ok:true});
  }catch(error){return res.status(error.status||500).json({error:error.status?error.message:"Akun belum dapat dihapus. Pastikan masih ada Developer lain, lalu coba lagi."});}
}
