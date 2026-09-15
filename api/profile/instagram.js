import {adminSupabase, verifyPermission} from "../_lib/supabaseAdmin.js";
import {rejectFields} from "../_lib/profiles.js";
import {instagramUsername} from "../../assets/js/instagram.js";
export default async function handler(req,res) {
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  try {
    const actor=await verifyPermission(req,"edit_instagram"), input=req.body||{};
    rejectFields(input,["instagram"]);
    let instagram;
    try { if(!("instagram" in input))throw new Error("Isi akun Instagram atau kosongkan untuk menghapus."); instagram=instagramUsername(input.instagram); }
    catch(error){return res.status(400).json({error:error.message});}
    const {data,error}=await adminSupabase.from("members").update({instagram,updated_at:new Date().toISOString(),updated_by:actor.uid}).eq("id",actor.uid).select("id");
    if(error)throw error;
    if(!data?.length)return res.status(404).json({error:"Akun anggota tidak ditemukan."});
    return res.status(200).json({ok:true,instagram});
  }catch(error){return res.status(error.status||500).json({error:error.status?error.message:"Instagram belum dapat disimpan. Coba lagi."});}
}
