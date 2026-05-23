import { useEffect, useState } from "react";

import logger from "../../../../lib/logger";

// `undefined` = IPC pending; `null` = resolved with no/failed username
// (renderer shows the fallback row); a string = OS username. The three-state
// signal lets the readiness gate distinguish "still waiting" from "resolved
// without a name".
export type CurrentUserState = string | null | undefined;

export const useCurrentUser = (): CurrentUserState => {
  const [currentUser, setCurrentUser] = useState<CurrentUserState>(undefined);

  useEffect(() => {
    let cancelled = false;
    const fetchUser = async () => {
      try {
        const name = await window.electron?.getCurrentUser?.();
        if (cancelled) return;
        setCurrentUser(typeof name === "string" && name.length > 0 ? name : null);
      } catch (err: unknown) {
        if (cancelled) return;
        logger.warn("useCurrentUser: getCurrentUser failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        setCurrentUser(null);
      }
    };
    fetchUser();
    return () => {
      cancelled = true;
    };
  }, []);

  return currentUser;
};

export default useCurrentUser;
