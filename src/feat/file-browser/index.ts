import { algorimejo } from "@/lib/algorimejo";
import { FileBrowerButton, FileBrowser } from "./file-browser";

algorimejo.providePanel("file-browser", FileBrowser, "left", FileBrowerButton);
