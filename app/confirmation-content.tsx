'use client';
import type {ComponentProps} from 'react';
import {AlertDialogContent} from '@/components/ui/alert-dialog';

export default function ConfirmationContent(props:ComponentProps<typeof AlertDialogContent>){
 return <AlertDialogContent {...props} onKeyDownCapture={e=>{
  props.onKeyDownCapture?.(e);
  if(e.defaultPrevented||e.key!==' '||e.ctrlKey||e.metaKey||e.altKey)return;
  if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]'))return;
  e.preventDefault();e.stopPropagation();
  if(e.repeat)return;
  const action=e.currentTarget.querySelector<HTMLButtonElement>('[data-slot="alert-dialog-action"]');
  if(action&&!action.disabled)action.click();
 }}/>;
}
