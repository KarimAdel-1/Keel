import path from "node:path";
import { setting } from "./settings";

/** Keel's install folder: where it runs from. */
export const appRoot = () => process.cwd();

/** What ships with Keel: the industry templates. */
export const appDataDir = (...parts: string[]) => path.join(appRoot(), "data", ...parts);

/** What a deployment writes: the database, uploads and test runs. */
export const userDataDir = (...parts: string[]) => path.join(setting("KEEL_DATA_DIR") ?? appDataDir(), ...parts);
