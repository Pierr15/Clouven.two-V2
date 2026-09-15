import { adminSupabase, verifyPermission } from "../_lib/supabaseAdmin.js";
import { getDriveAccessToken, destinationFolder } from "../_lib/drive.js";
import { registeredResource, validateClassFile } from "../_lib/driveResource.js";
import { rejectFields } from "../_lib/profiles.js";

export default async function handler(req,res) {
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  try {
    await verifyPermission(req,"manage_files");
    const input=req.body||{};
    rejectFields(input,["resourceId","action","name","subject","kind"]);
    if(!["edit","trash"].includes(input.action))return res.status(400).json({error:"Aksi file tidak valid."});
    if(input.action==="edit" && (typeof input.name!=="string" || !input.name.trim() || input.name.length>200 || typeof input.subject!=="string" || !input.subject.trim() || input.subject.length>80 || !["materi","tugas"].includes(input.kind)))return res.status(400).json({error:"Nama, mata pelajaran, atau kategori file tidak valid."});
    const resource=await registeredResource(input.resourceId),token=await getDriveAccessToken();
    const meta=await validateClassFile(token,resource.drive_file_id,{allowTrashed:input.action==="trash"});
    const params=new URLSearchParams({fields:"id,name,trashed"});
    let patch;
    if(input.action==="trash")patch={trashed:true};
    else {
      patch={name:input.name.trim()};
      const folder=await destinationFolder(token,input.kind,input.subject.trim());
      if(!(meta.parents||[]).includes(folder)){
        params.set("addParents",folder);
        if(meta.parents?.length)params.set("removeParents",meta.parents.join(","));
      }
    }
    if(!(input.action==="trash" && meta.trashed)) {
      const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(resource.drive_file_id)}?${params}`,{
        method:"PATCH",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(patch)
      });
      if(!response.ok)throw Object.assign(new Error("Perubahan file di Google Drive belum berhasil. Coba lagi."),{status:502});
    }
    const result=input.action==="trash"
      ? await adminSupabase.from("resources").delete().eq("id",resource.id)
      : await adminSupabase.from("resources").update({name:input.name.trim(),subject:input.subject.trim(),kind:input.kind}).eq("id",resource.id);
    if(result.error)throw Object.assign(new Error("File di Drive sudah diperbarui, tetapi daftar kelas belum tersimpan. Coba simpan lagi untuk menyelesaikan."),{status:503});
    return res.status(200).json({ok:true});
  }catch(error){return res.status(error.status||500).json({error:error.status?error.message:"File belum dapat diperbarui. Silakan coba lagi."});}
}
