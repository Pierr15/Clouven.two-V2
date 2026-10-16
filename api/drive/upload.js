import driveUploadHandler from "../../server/api-handlers/drive/upload.js";

// Raw file uploads must bypass Vercel's JSON body parser.
export const config = { api: { bodyParser: false } };

export default driveUploadHandler;
