import { algorimejo } from "@/lib/algorimejo";
import { FileBrowser } from "./file-browser";
import { FileBrowerButton } from "./file-browser-button";

console.log("register file-browser feature");
algorimejo.providePanel("file-browser", FileBrowser, "left", FileBrowerButton);
