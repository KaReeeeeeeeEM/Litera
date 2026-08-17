import { strToU8, zipSync } from "fflate/browser";
import type {
  DeviceBook,
  ExportArtifact,
} from "@/components/device/device-types";

export type ExportFormat =
  | "project"
  | "litera-web"
  | "scorm"
  | "webpub"
  | "epub"
  | "pnld";

export const exportFormats: Array<{
  id: ExportFormat;
  label: string;
  description: string;
}> = [
  {
    id: "project",
    label: "Project Archive",
    description:
      "Source book and Litera project data for backup, transfer, and future editing.",
  },
  {
    id: "litera-web",
    label: "Litera Web",
    description:
      "Litera web bundle with HTML pages, reader dock, media, translations, and manifests.",
  },
  {
    id: "scorm",
    label: "SCORM Export",
    description:
      "SCORM 1.2 package for learning-management systems and offline delivery.",
  },
  {
    id: "webpub",
    label: "WebPub Export",
    description: "Readium Web Publication package for standards-based readers.",
  },
  {
    id: "epub",
    label: "EPUB Export",
    description: "EPUB 3 package for e-readers and accessibility tools.",
  },
  {
    id: "pnld",
    label: "PNLD Export",
    description:
      "Brazilian PNLD HTML5 digital-work package with OPF and NCX metadata.",
  },
];

type PackageFiles = Record<string, Uint8Array>;

async function fetchRuntimeAsset(name: string) {
  if (typeof window === "undefined") {
    const { readFile } = await import("node:fs/promises");
    return new Uint8Array(
      await readFile(new URL(`../../../public/adt-runtime/${name}`, import.meta.url)),
    );
  }
  const response = await fetch(`/adt-runtime/${name}`);
  if (!response.ok)
    throw new Error(`Litera reader runtime asset is unavailable: ${name}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function packageBook(
  book: DeviceBook,
  format: ExportFormat = "litera-web",
): Promise<ExportArtifact> {
  const title = book.metadata?.title || book.name.replace(/\.[^.]+$/, "");
  const label = safe(title);
  const files = await createAdtCompatibleFiles(book, title);
  let packaged = files;
  let name = `${label}-litera-web.zip`;
  let mimeType = "application/zip";

  if (format === "project") {
    packaged = {
      ...files,
      "project.json": strToU8(
        JSON.stringify(serializableProject(book), null, 2),
      ),
    };
    if (book.sourceBytes?.byteLength)
      packaged[`${label}.${sourceExtension(book)}`] = new Uint8Array(
        book.sourceBytes,
      );
    name = `${label}-project.zip`;
  } else if (format === "scorm") {
    name = `${label}-scorm.zip`;
  } else if (format === "webpub") {
    packaged = createWebpubFiles(files, book, title);
    name = `${label}.webpub`;
    mimeType = "application/webpub+zip";
  } else if (format === "epub") {
    packaged = createEpubFiles(files, book, title);
    name = `${label}.epub`;
    mimeType = "application/epub+zip";
  } else if (format === "pnld") {
    packaged = createPnldFiles(files, book, title);
    name = `${label}-pnld.zip`;
  }

  const bytes = zipSync(packaged, { level: 6 });
  return {
    generatedAt: new Date().toISOString(),
    name,
    mimeType,
    blob: new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }),
    pages: book.storyboardPages?.length ?? 0,
    languages: outputLanguages(book),
    format,
  };
}

async function createAdtCompatibleFiles(book: DeviceBook, title: string) {
  const files: PackageFiles = {};
  const pages = [...(book.storyboardPages ?? [])].sort(
    (a, b) => a.pageNumber - b.pageNumber,
  );
  const pageList = pages.map((page, index) => ({
    section_id: sectionId(page.pageNumber),
    href: index === 0 ? "index.html" : `${sectionId(page.pageNumber)}.html`,
    page_number: page.pageNumber,
  }));
  const languages = outputLanguages(book);

  for (const [index, page] of pages.entries()) {
    const href = pageList[index]!.href;
    files[href] = strToU8(
      packagePage(page.html, {
        title,
        sectionId: pageList[index]!.section_id,
        pageIndex: index + 1,
        language: book.metadata?.languageCode ?? "en",
      }),
    );
  }
  files["content/pages.json"] = json(pageList);
  files["content/toc.json"] = json(
    (book.tableOfContents ?? []).map((entry) => ({
      section_id: sectionId(entry.pageNumber),
      href:
        pageList.find((page) => page.page_number === entry.pageNumber)?.href ??
        `${sectionId(entry.pageNumber)}.html`,
      title: entry.title,
      chapter_id: `toc-${entry.pageNumber}`,
      level: entry.level,
    })),
  );
  files["assets/config.json"] = json({
    title,
    languages: {
      available: languages.map(safeLocale),
      default: safeLocale(book.metadata?.languageCode ?? languages[0] ?? "en"),
    },
    features: {
      glossary: Boolean(book.glossary?.length),
      readAloud: Boolean(book.speechEntries?.length),
      signLanguage: Boolean(book.signVideos?.length),
      easyRead: false,
      showNavigationControls: true,
      showTutorial: true,
      showAutoHideButton: true,
      activities: pages.some((page) => page.html.includes("data-activity-item")),
    },
    defaultSettings: {
      dockLayout: { position: "bottom", width: "full", align: "center" },
      theme: "system",
      iconSize: "md",
      reduceMotion: false,
    },
  });
  const [runtime, runtimeCss, fontsCss] = await Promise.all([
    fetchRuntimeAsset("base.bundle.local.js"),
    fetchRuntimeAsset("tailwind_output.css"),
    fetchRuntimeAsset("fonts.css"),
  ]);
  files["assets/base.bundle.local.js"] = runtime;
  files["content/tailwind_output.css"] = runtimeCss;
  files["assets/fonts.css"] = fontsCss;
  files["assets/scorm.js"] = strToU8(scormJs());
  files["imsmanifest.xml"] = strToU8(imsManifest(title, pageList));
  files["validation.json"] = json(book.validationReport ?? null);

  for (const language of languages) {
    const locale = safeLocale(language);
    const catalog = book.languageCatalogs?.[language];
    const sourceEntries = book.sourceTextCatalog ?? [];
    files[`content/i18n/${locale}/texts.json`] = json(
      Object.fromEntries(
        (catalog?.entries ?? sourceEntries).map((entry) => [
          entry.id,
          entry.text,
        ]),
      ),
    );
    const audioMap: Record<string, string> = {};
    for (const entry of (book.speechEntries ?? []).filter(
      (item) => item.language === language,
    )) {
      const extension = entry.audio.type.includes("wav") ? "wav" : "mp3";
      const filename = `${safe(entry.textId)}.${extension}`;
      files[`content/i18n/${locale}/audio/${filename}`] =
        new Uint8Array(await entry.audio.arrayBuffer());
      audioMap[entry.textId] = filename;
    }
    files[`content/i18n/${locale}/audios.json`] = json(audioMap);
    files[`content/i18n/${locale}/timecode/timecode_output.json`] = json({});
    files[`content/i18n/${locale}/glossary.json`] = json(book.glossary ?? []);

    const videoMap: Record<string, string> = {};
    for (const video of book.signVideos ?? []) {
      const filename = safe(video.name);
      files[`content/i18n/${locale}/video/${filename}`] = new Uint8Array(
        await video.file.arrayBuffer(),
      );
      videoMap[video.target || video.id] = filename;
    }
    files[`content/i18n/${locale}/videos.json`] = json(videoMap);
  }
  for (const page of book.extractedPages ?? [])
    for (const asset of page.assets ?? [])
      files[`images/${safe(asset.id)}.png`] = new Uint8Array(
        asset.bytes ?? (await asset.blob.arrayBuffer()),
      );
  return files;
}

function packagePage(
  html: string,
  options: {
    title: string;
    sectionId: string;
    pageIndex: number;
    language: string;
  },
) {
  let output = html.replace(
    /<html(?:\s[^>]*)?>/i,
    `<html lang="${escapeHtml(options.language)}">`,
  );
  const metadata = `<meta name="title-id" content="${options.sectionId}"><meta name="page-section-id" content="${options.pageIndex}"><link rel="stylesheet" href="./content/tailwind_output.css"><link rel="stylesheet" href="./assets/fonts.css">`;
  output = output.replace(/<\/head>/i, `${metadata}</head>`);
  const dock = `<div class="relative z-50" id="interface-container"></div><div class="relative z-50" id="nav-container"></div><script src="./assets/scorm.js"></script><script src="./assets/base.bundle.local.js"></script>`;
  output = output.replace(/<\/body>/i, `${dock}</body>`);
  return output;
}

function createWebpubFiles(
  files: PackageFiles,
  book: DeviceBook,
  title: string,
) {
  const readingOrder = readingOrderEntries(book);
  return {
    ...files,
    "manifest.json": json({
      "@context": "https://readium.org/webpub-manifest/context.jsonld",
      metadata: { title, language: book.metadata?.languageCode ?? "en" },
      readingOrder,
    }),
  };
}

function createEpubFiles(files: PackageFiles, book: DeviceBook, title: string) {
  const pages = readingOrderEntries(book);
  const output: PackageFiles = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
  };
  for (const [path, bytes] of Object.entries(files))
    output[`EPUB/${path.replace(/\.html$/, ".xhtml")}`] = bytes;
  output["EPUB/package.opf"] = strToU8(
    epubOpf(title, book.metadata?.languageCode ?? "en", pages),
  );
  output["EPUB/nav.xhtml"] = strToU8(navigationDocument(title, pages));
  return output;
}

function createPnldFiles(files: PackageFiles, book: DeviceBook, title: string) {
  const pages = readingOrderEntries(book);
  const output: PackageFiles = {
    "content.opf": strToU8(
      epubOpf(title, book.metadata?.languageCode ?? "pt-BR", pages),
    ),
    "toc.ncx": strToU8(ncxDocument(title, pages)),
    "index.html": strToU8(
      navigationDocument(title, pages).replaceAll(".xhtml", ".html"),
    ),
  };
  for (const [path, bytes] of Object.entries(files))
    output[
      path === "index.html"
        ? "content/pg001_sec001.html"
        : path.startsWith("pg")
          ? `content/${path}`
          : path
    ] = bytes;
  return output;
}

function readingOrderEntries(book: DeviceBook) {
  return [...(book.storyboardPages ?? [])]
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page, index) => ({
      href: index === 0 ? "index.html" : `${sectionId(page.pageNumber)}.html`,
      title: page.title || `Page ${page.pageNumber}`,
    }));
}
function sectionId(pageNumber: number) {
  return `pg${String(pageNumber).padStart(3, "0")}_sec001`;
}
function outputLanguages(book: DeviceBook) {
  return [
    ...new Set(
      [
        book.metadata?.languageCode,
        ...Object.keys(book.languageCatalogs ?? {}),
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
}
function json(value: unknown) {
  return strToU8(JSON.stringify(value, null, 2));
}
function sourceExtension(book: DeviceBook) {
  return book.sourceFormat === "epub"
    ? "epub"
    : book.sourceFormat === "webpub"
      ? "webpub"
      : "pdf";
}
function serializableProject(book: DeviceBook) {
  const {
    file: _file,
    sourceBytes: _sourceBytes,
    exportArtifact: _exportArtifact,
    extractedPages,
    speechEntries,
    signVideos,
    ...project
  } = book;
  return {
    schema: "litera-project@1",
    ...project,
    extractedPages: extractedPages?.map(
      ({ thumbnail: _thumbnail, assets, ...page }) => ({
        ...page,
        assets: assets?.map(({ blob: _blob, ...asset }) => asset),
      }),
    ),
    speechEntries: speechEntries?.map(({ audio: _audio, ...entry }) => entry),
    signVideos: signVideos?.map(({ file: _video, ...video }) => video),
  };
}
function safeLocale(value: string) {
  return value.replaceAll("_", "-");
}
function safe(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_.-]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "book"
  );
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function readerCss() {
  return `.reader-dock{position:fixed;z-index:9999;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:7px;border:1px solid #d7d9dc;border-radius:16px;background:rgba(255,255,255,.96);box-shadow:0 12px 36px rgba(0,0,0,.18);backdrop-filter:blur(14px)}.reader-dock button{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:10px;background:transparent;color:#25272a;font:600 18px/1 system-ui;cursor:pointer}.reader-dock button:hover,.reader-dock button:focus-visible{background:#eceef1;outline:2px solid #2563eb;outline-offset:1px}.reader-panel{position:fixed;z-index:10000;right:16px;bottom:84px;width:min(380px,calc(100vw - 32px));max-height:65vh;overflow:auto;padding:18px;border:1px solid #d7d9dc;border-radius:16px;background:#fff;color:#25272a;box-shadow:0 16px 48px rgba(0,0,0,.24);font:16px/1.45 system-ui}.reader-panel header{display:flex;align-items:center;justify-content:space-between;gap:12px}.reader-panel button{border:0;background:transparent;font-size:22px;cursor:pointer}.reader-panel dt{margin-top:12px;font-weight:700}.reader-panel dd{margin:3px 0 0}.reader-panel video{display:block;width:100%;max-height:48vh;margin-top:12px;background:#111}@media(max-width:560px){.reader-dock{max-width:calc(100vw - 16px);overflow-x:auto}.reader-dock button{width:40px;height:40px;flex:0 0 auto}}@media print{.reader-dock,.reader-panel{display:none}}body{padding-bottom:76px}`;
}
function readerJs() {
  return `(()=>{const dock=document.getElementById('litera-reader-dock');if(!dock)return;const page=Number(document.querySelector('meta[name="page-section-id"]')?.content||1);const section=document.querySelector('meta[name="title-id"]')?.content||'';let lang=document.documentElement.lang||'en';const get=p=>fetch(p).then(r=>{if(!r.ok)throw Error();return r.json()});const pages=()=>get('./content/pages.json');const close=()=>document.querySelector('.reader-panel')?.remove();const panel=(title,body)=>{close();const n=document.createElement('aside');n.className='reader-panel';n.setAttribute('role','dialog');n.setAttribute('aria-label',title);n.innerHTML='<header><strong></strong><button aria-label="Close">×</button></header><div></div>';n.querySelector('strong').textContent=title;n.querySelector('div').append(body);n.querySelector('button').onclick=close;document.body.append(n)};dock.addEventListener('click',async e=>{const b=e.target.closest('[data-reader-action]');if(!b)return;const a=b.dataset.readerAction;try{if(a==='read'){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(document.querySelector('main')?.innerText||document.body.innerText));return}if(a==='settings'){document.documentElement.classList.toggle('reader-large-text');document.body.style.fontSize=document.documentElement.classList.contains('reader-large-text')?'125%':'';return}if(a==='language'){const next=prompt('Language code',lang);if(!next)return;const t=await get('./content/i18n/'+next+'/texts.json');document.querySelectorAll('[data-id]').forEach(n=>{if(t[n.dataset.id]!=null)n.textContent=t[n.dataset.id]});lang=next;document.documentElement.lang=next;return}if(a==='glossary'){const terms=await get('./content/i18n/'+lang+'/glossary.json');const dl=document.createElement('dl');terms.forEach(x=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=x.term;dd.textContent=x.definition;dl.append(dt,dd)});panel('Glossary',dl);return}if(a==='sign'){const videos=await get('./content/i18n/'+lang+'/videos.json');const file=videos[section]||videos[String(page)]||Object.values(videos)[0];if(!file)throw Error();const video=document.createElement('video');video.controls=true;video.autoplay=true;video.src='./content/i18n/'+lang+'/video/'+file;panel('Sign language',video);return}const list=await pages();if(a==='contents'){location.href=list[0]?.href||'index.html';return}const target=list[page+(a==='next'?0:-2)];if(target)location.href=target.href}catch{const message=document.createElement('p');message.textContent='This tool has no content available for the current page or language.';panel('Unavailable',message)}})})();`;
}
function scormJs() {
  return `(()=>{try{const api=window.parent.API;if(api){api.LMSInitialize('');api.LMSSetValue('cmi.core.lesson_status','incomplete');window.addEventListener('beforeunload',()=>api.LMSCommit(''))}}catch{}})();`;
}
function imsManifest(title: string, pages: Array<{ href: string }>) {
  return `<?xml version="1.0" encoding="UTF-8"?><manifest identifier="litera-book" version="1.2" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"><organizations default="org"><organization identifier="org"><title>${escapeHtml(title)}</title><item identifier="item" identifierref="resource"><title>${escapeHtml(title)}</title></item></organization></organizations><resources><resource identifier="resource" type="webcontent" adlcp:scormtype="sco" href="${pages[0]?.href ?? "index.html"}" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">${pages.map((page) => `<file href="${page.href}"/>`).join("")}</resource></resources></manifest>`;
}
function epubOpf(
  title: string,
  language: string,
  pages: Array<{ href: string }>,
) {
  return `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${escapeHtml(title)}</dc:title><dc:language>${escapeHtml(language)}</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${pages.map((page, index) => `<item id="p${index + 1}" href="${page.href.replace(/\.html$/, ".xhtml")}" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine>${pages.map((_, index) => `<itemref idref="p${index + 1}"/>`).join("")}</spine></package>`;
}
function navigationDocument(
  title: string,
  pages: Array<{ href: string; title: string }>,
) {
  return `<!doctype html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeHtml(title)}</title></head><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><h1>${escapeHtml(title)}</h1><ol>${pages.map((page) => `<li><a href="${page.href.replace(/\.html$/, ".xhtml")}">${escapeHtml(page.title)}</a></li>`).join("")}</ol></nav></body></html>`;
}
function ncxDocument(
  title: string,
  pages: Array<{ href: string; title: string }>,
) {
  return `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><docTitle><text>${escapeHtml(title)}</text></docTitle><navMap>${pages.map((page, index) => `<navPoint id="nav-${index + 1}" playOrder="${index + 1}"><navLabel><text>${escapeHtml(page.title)}</text></navLabel><content src="content/${page.href}"/></navPoint>`).join("")}</navMap></ncx>`;
}
