import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/stores";

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
