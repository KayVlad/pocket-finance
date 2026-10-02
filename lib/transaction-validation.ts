import {groups,type Transaction} from './finance';
import {HttpError} from './server';
export function validateTransaction(input:Record<string,unknown>):Omit<Transaction,'id'|'sample'>{
 if(!input||typeof input!=='object')throw new HttpError(400,'Invalid transaction.');
 const {date,kind,category,description,amount,note}=input;
 if(typeof date!=='string'||!/^(19|[2-9]\d)\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new HttpError(400,'Enter a valid date.');
 if(typeof kind!=='string'||!Object.hasOwn(groups,kind)||typeof category!=='string'||!category.trim()||category.length>60)throw new HttpError(400,'Select a group and category.');
 if(description!==undefined&&(typeof description!=='string'||description.trim().length>120))throw new HttpError(400,'Descriptions can be up to 120 characters.');
 if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<=0||amount>9999999999)throw new HttpError(400,'Enter a positive amount.');
 if(typeof note!=='string'||note.length>1000)throw new HttpError(400,'Notes can be up to 1,000 characters.');
 for(const flag of ['refunded','fromEmergency'])if(input[flag]!==undefined&&typeof input[flag]!=='boolean')throw new HttpError(400,'Invalid transaction checkbox.');
 const refunded=input.refunded===true,fromEmergency=input.fromEmergency===true;
 if((refunded||fromEmergency)&&!['essential','personal','investment'].includes(kind))throw new HttpError(400,'These checkboxes apply to spending only.');
 return {date,kind:kind as Transaction['kind'],category,description:typeof description==='string'&&description.trim()?description.trim():'Transaction',amount,note:note.trim(),refunded,fromEmergency};
}
