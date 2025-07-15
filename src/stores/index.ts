import type { algorimejo } from "@/lib/algorimejo";

export type RootState = ReturnType<typeof algorimejo.store.getState>;
export type AppDispatch = typeof algorimejo.store.dispatch;
