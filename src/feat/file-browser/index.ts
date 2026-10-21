import { algorimejo } from "@/lib/algorimejo"
import { FileBrowser, FileBrowserButton } from "./file-browser"

algorimejo.providePanel("file-browser", FileBrowser, "left", FileBrowserButton)
