"use client";
import type { ReactNode } from "react";
import { ProductDemo } from "../site/ProductDemo";

/** The frame for the website's example conversations: blue to teal, or glass on a dark band (globals.css). */
export function Backdrop({children,className=""}:{children?:ReactNode;className?:string}) {
 return <div className={`product-demo demo-conversation-stage relative overflow-hidden rounded-2xl ${className}`}>{children}</div>;
}
export function HeroVisual(){return <ProductDemo kind="hero"/>;}
export function DraftVisual(){return <ProductDemo kind="draft"/>;}
export function TestRunVisual(){return <ProductDemo kind="testRun" fill caption={false}/>;}
export function SourceVisual(){return <ProductDemo kind="source" fill caption={false}/>;}
export function LayoutMenuVisual(){return <ProductDemo kind="layout"/>;}
