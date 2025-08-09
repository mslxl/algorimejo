import type { AppDispatch } from "@/stores"
import { useDispatch } from "react-redux"

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
