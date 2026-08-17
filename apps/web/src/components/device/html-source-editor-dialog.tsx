"use client";

import type { OnMount } from "@monaco-editor/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { IconType } from "react-icons";
import {
  SiCursor,
  SiSublimetext,
  SiWebstorm,
  SiWindsurf,
  SiZedindustries,
} from "react-icons/si";
import { VscVscode } from "react-icons/vsc";
import {
  Braces,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/feedback";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

type EditorAvailability = { id: string; label: string; available: boolean };
type MonacoInstance = Parameters<OnMount>[0];

const editorIcons: Record<string, IconType> = {
  cursor: SiCursor,
  sublime: SiSublimetext,
  vscode: VscVscode,
  webstorm: SiWebstorm,
  windsurf: SiWindsurf,
  zed: SiZedindustries,
};

export function HtmlSourceEditorDialog({
  html,
  onOpenChange,
  onSave,
  open,
  pageNumber,
}: {
  html: string;
  onOpenChange: (open: boolean) => void;
  onSave: (html: string) => Promise<void>;
  open: boolean;
  pageNumber: number;
}) {
  const desktop = useSyncExternalStore(
    () => () => undefined,
    () => "__TAURI_INTERNALS__" in window,
    () => false,
  );
  const [draft, setDraft] = useState(html);
  const [saving, setSaving] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [externalEditors, setExternalEditors] = useState<EditorAvailability[]>(
    [],
  );
  const [selectedEditor, setSelectedEditor] = useState("");
  const [externalPath, setExternalPath] = useState("");
  const editorRef = useRef<MonacoInstance | null>(null);

  useEffect(() => {
    if (!desktop) return;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<EditorAvailability[]>("detect_code_editors"))
      .then((editors) => {
        setExternalEditors(editors);
        setSelectedEditor(editors.find((editor) => editor.available)?.id ?? "");
      })
      .catch(() => setExternalEditors([]));
  }, [desktop]);

  const mountEditor: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addAction({
      id: "litera.save-html",
      label: "Save Litera HTML",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => void save(editor.getValue()),
    });
    editor.addAction({
      id: "litera.format-html",
      label: "Format Document",
      keybindings: [
        monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      ],
      run: () => formatDocument(),
    });
    window.setTimeout(
      () => void editor.getAction("editor.action.formatDocument")?.run(),
      0,
    );
    editor.focus();
  };

  async function formatDocument() {
    setFormatting(true);
    try {
      await editorRef.current?.getAction("editor.action.formatDocument")?.run();
      editorRef.current?.focus();
    } finally {
      setFormatting(false);
    }
  }

  async function save(value = draft) {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  }

  async function openExternally() {
    if (!selectedEditor) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("open_html_in_editor", {
        editorId: selectedEditor,
        html: draft,
        pageNumber,
      });
      setExternalPath(path);
      toast.success("The page was opened in your code editor.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function reloadExternalChanges() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const updated = await invoke<string>("read_external_html", {
        path: externalPath,
      });
      setDraft(updated);
      toast.success("External HTML changes were reloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  const selected = externalEditors.find(
    (editor) => editor.id === selectedEditor,
  );
  const SelectedIcon = selected ? editorIcons[selected.id] : undefined;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="grid h-[min(92vh,62rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-[min(96vw,96rem)]">
        <DialogHeader>
          <DialogTitle>Edit page {pageNumber} HTML</DialogTitle>
          <DialogDescription>
            VS Code-style HTML editing with suggestions, folding, multi-cursor
            support, find and replace, and keyboard shortcuts. Saving creates a
            restorable revision.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/35 p-2">
          <Button
            onClick={() => void formatDocument()}
            size="sm"
            variant="outline"
          >
            {formatting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Braces />
            )}
            Format <kbd className="ml-1 text-[10px] opacity-65">⇧⌥F</kbd>
          </Button>
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
            <Select
              disabled={!desktop || !externalEditors.length}
              onValueChange={setSelectedEditor}
              value={selectedEditor}
            >
              <SelectTrigger aria-label="External code editor" className="w-56">
                <SelectValue
                  placeholder={
                    desktop ? "No editors detected" : "Desktop app required"
                  }
                >
                  {SelectedIcon ? <SelectedIcon /> : null}
                  {selected?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {externalEditors.map((editor) => {
                  const EditorIcon = editorIcons[editor.id];
                  return (
                    <SelectItem
                      disabled={!editor.available}
                      key={editor.id}
                      value={editor.id}
                    >
                      {EditorIcon ? <EditorIcon /> : null}
                      <span>
                        {editor.label}
                        {editor.available ? "" : " · Not installed"}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              disabled={!selectedEditor}
              onClick={() => void openExternally()}
              size="sm"
              variant="outline"
            >
              <ExternalLink />
              Open in editor
            </Button>
            {externalPath ? (
              <Button
                onClick={() => void reloadExternalChanges()}
                size="sm"
                variant="secondary"
              >
                <RotateCcw />
                Reload external changes
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid min-h-0 overflow-hidden rounded-lg border lg:grid-cols-2">
          <div className="min-h-72 border-b lg:border-b-0 lg:border-r">
            <MonacoEditor
              beforeMount={(monaco) => {
                monaco.languages.html.htmlDefaults.setOptions({
                  format: {
                    tabSize: 2,
                    insertSpaces: true,
                    wrapLineLength: 120,
                    unformatted: "",
                    contentUnformatted: "pre,code,textarea",
                  },
                  suggest: { html5: true },
                });
              }}
              language="html"
              onChange={(value) => setDraft(value ?? "")}
              onMount={mountEditor}
              options={{
                automaticLayout: true,
                bracketPairColorization: { enabled: true },
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontLigatures: true,
                fontSize: 13,
                formatOnPaste: true,
                formatOnType: true,
                minimap: { enabled: true },
                mouseWheelZoom: true,
                multiCursorModifier: "alt",
                padding: { top: 12, bottom: 12 },
                quickSuggestions: true,
                smoothScrolling: true,
                tabSize: 2,
                wordWrap: "on",
              }}
              path={`litera-page-${pageNumber}.html`}
              theme="vs-dark"
              value={draft}
            />
          </div>
          <iframe
            className="min-h-72 size-full bg-white"
            sandbox="allow-forms"
            srcDoc={draft}
            title={`HTML preview for page ${pageNumber}`}
          />
        </div>
        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            Save: ⌘/Ctrl+S · Find: ⌘/Ctrl+F · Replace: ⌥⌘F/Ctrl+H · Command
            palette: F1
          </span>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={saving || draft === html}
            onClick={() => void save()}
          >
            {saving ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            Save HTML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
