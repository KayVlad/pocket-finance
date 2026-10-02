import {boundary,db,HttpError,requireAccount} from '@/lib/server';
import {receiptBucket,type StoredReceipt} from '@/lib/receipts-server';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return boundary(async()=>{
 const account=await requireAccount(request),{id}=await params;
 const receipt=await db().prepare('SELECT object_key AS objectKey,name,type FROM receipts WHERE id=? AND account_id=?').bind(id,account.id).first<StoredReceipt>();
 if(!receipt)throw new HttpError(404,'Receipt not found.');
 const object=await receiptBucket().get(receipt.objectKey);if(!object)throw new HttpError(404,'Receipt not found.');
 const name=receipt.name.replace(/[^\x20-\x7e]|["\\]/g,'_');
 return new Response(object.body,{headers:{'Content-Type':receipt.type,'Content-Length':String(object.size),'Content-Disposition':`attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(receipt.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
});}
