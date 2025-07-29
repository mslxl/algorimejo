import * as log from "@tauri-apps/plugin-log";
import { algorimejo } from "@/lib/algorimejo";
import { FileBrowser } from "./file-browser";
import { FileBrowerButton } from "./file-browser-button";

algorimejo.providePanel("file-browser", FileBrowser, "left", FileBrowerButton);
