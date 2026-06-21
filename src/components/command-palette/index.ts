/** Public surface of the command-palette module. Internal
 *  helpers (the fuzzy filter, the snippet renderer, the
 *  items catalogue, the mount-point) are intentionally
 *  *not* re-exported here — they are used by the
 *  implementation and by the test files only. The rest
 *  of the app should import from here. */
export { CommandPalette } from "./command-palette";
export {
  CommandPaletteProvider,
  useCommandPalette,
} from "./use-command-palette";
