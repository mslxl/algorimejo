import { algorimejo } from "@/lib/algorimejo"
import { EmbeddedTerminalButton, EmbeddedTerminalPanel } from "./terminal"

algorimejo.providePanel("terminal", EmbeddedTerminalPanel, "bottom", EmbeddedTerminalButton)
