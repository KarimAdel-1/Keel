"use client";
import type { ReactNode } from "react";
import { ProductDemo } from "../site/ProductDemo";

/** A quiet frame for the industry-specific customer conversations. */
export function Backdrop({tone="warm",children,className=""}:{tone?:"warm"|"cool"|"dark";children?:ReactNode;className?:string}) {
 return <div className={`product-demo demo-conversation-stage relative overflow-hidden rounded-2xl border border-line ${className}`} style={{background:tone==="dark"?"#263345":"linear-gradient(145deg,#edf1f4,#f7f5f1)"}}>{children}</div>;
}
export function HeroVisual(){return <ProductDemo kind="hero"/>;}
export function DraftVisual(){return <ProductDemo kind="draft"/>;}
export function TestRunVisual(){return <ProductDemo kind="testRun"/>;}
export function SourceVisual(){return <ProductDemo kind="source"/>;}
export function LayoutMenuVisual(){return <ProductDemo kind="layout"/>;}
