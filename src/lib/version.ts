import packageJson from "../../package.json";

/** App version — always derived from `package.json` so UI and npm stay in sync. */
export const APP_VERSION = packageJson.version;
