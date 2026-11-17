import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50', {
 variants:{variant:{default:'bg-brand-600 text-white hover:bg-brand-900',outline:'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',destructive:'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100'},size:{default:'h-10',sm:'h-8',lg:'h-12'}},
 defaultVariants:{variant:'default',size:'default'}
});
export function Button({className,variant,size,asChild=false,...props}:React.ComponentProps<'button'>&VariantProps<typeof buttonVariants>&{asChild?:boolean}){
 const Comp=asChild?Slot:'button';
 return <Comp data-slot="button" className={cn(buttonVariants({variant,size,className}))} {...props}/>;
}
