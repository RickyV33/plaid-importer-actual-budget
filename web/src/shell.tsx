// What every page can reach in the shell: who's signed in, and a way to
// re-read the banners after an action that might change them (a sync).

import { createContext, useContext } from "react";
import type { Me } from "./api";

export type Shell = { me: Me | null; refreshBanners: () => void };

export const ShellContext = createContext<Shell>({ me: null, refreshBanners: () => {} });
export const useShell = () => useContext(ShellContext);
