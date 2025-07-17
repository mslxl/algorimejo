import { useSelector } from "react-redux";
import type { RootState } from "@/stores";

export const useAppSelector = useSelector.withTypes<RootState>();
