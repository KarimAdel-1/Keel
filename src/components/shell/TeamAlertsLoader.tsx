"use client";

import dynamic from "next/dynamic";

/** Team alerts run only in the browser: they read its notification permission, and play sound. */
export const TeamAlertsLoader = dynamic(() => import("./TeamAlerts").then((m) => m.TeamAlerts), { ssr: false });
