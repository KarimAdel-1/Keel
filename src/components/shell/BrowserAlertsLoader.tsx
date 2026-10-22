"use client";

import dynamic from "next/dynamic";

/** The notifications switch reads the browser's permission, so it's drawn in the browser only. */
export const BrowserAlertsLoader = dynamic(() => import("./BrowserAlerts").then((m) => m.BrowserAlerts), { ssr: false });
