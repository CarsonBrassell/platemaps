import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * False in the server render and while this subtree hydrates, true from the
 * render straight after. Anything the server cannot know (whose account this is)
 * has to wait for it, or the client's first frame disagrees with the HTML it is
 * hydrating and React throws the subtree away. A component that mounts later, on
 * a client navigation, gets true on its first render.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
