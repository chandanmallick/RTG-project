import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const SKILL_DIR = "C:/Users/50041/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations";
const workspaceDir = "D:/Application/RTG";
const buildDir = path.join(workspaceDir, ".codex-slide-build");
const outputDir = path.join(workspaceDir, "deliverables");
const finalPath = path.join(outputDir, "COMPASS_Integrated_Operations_Overview_v2.pptx");
const pythonExecutable = "C:/Users/50041/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";

const { resolvePresentationFont, finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href,
);
await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const font = resolvePresentationFont();
const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const slide = deck.slides.add();
slide.background.fill = "#F8FBFF";

function box(x, y, w, h, fill, line = fill, radius = 12) {
  return slide.shapes.add({
    geometry: "roundRect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { fill: line, width: 1.5 },
    cornerRadius: radius,
  });
}

function text(x, y, w, h, value, size, color, bold = false, align = "left") {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text = value;
  shape.text.style = {
    typeface: font,
    fontSize: size,
    color,
    bold,
    alignment: align,
    verticalAlignment: "middle",
    autoFit: "shrinkText",
    marginLeft: 4,
    marginRight: 4,
    marginTop: 2,
    marginBottom: 2,
  };
  return shape;
}

// Header
slide.shapes.add({ geometry: "rect", position: { left: 0, top: 0, width: 1280, height: 12 }, fill: "#082C69", line: { fill: "#082C69", width: 0 } });
text(42, 24, 930, 48, "COMPASS: Integrated Platform for Operations Management", 31, "#082C69", true);
text(1010, 26, 225, 34, "GRID-INDIA", 17, "#138A43", true, "right");
text(1010, 56, 225, 22, "Operational digital ecosystem", 10.5, "#567087", false, "right");

box(42, 82, 1196, 76, "#EAF3FF", "#B9D2EF");
slide.shapes.add({ geometry: "rect", position: { left: 432, top: 92, width: 2, height: 56 }, fill: "#B9D2EF", line: { fill: "#B9D2EF", width: 0 } });
slide.shapes.add({ geometry: "rect", position: { left: 835, top: 92, width: 2, height: 56 }, fill: "#B9D2EF", line: { fill: "#B9D2EF", width: 0 } });
text(60, 88, 350, 24, "PURPOSE", 12, "#0B5FA5", true);
text(60, 112, 350, 38, "• Common operational workspace\n• Faster coordination and decisions", 11.5, "#17324D");
text(452, 88, 360, 24, "INPUTS", 12, "#147D64", true);
text(452, 112, 360, 38, "• RTG, schedule, generation and frequency data\n• Rosters, requests and controlled documents", 11.5, "#17324D");
text(855, 88, 360, 24, "OUTCOMES", 12, "#6A4BC3", true);
text(855, 112, 360, 38, "• Validated information and real-time visibility\n• Traceable workflows and ready reports", 11.5, "#17324D");

// Connector bars behind modules
const connectorColor = "#A9BDD2";
slide.shapes.add({ geometry: "rect", position: { left: 382, top: 390, width: 516, height: 3 }, fill: connectorColor, line: { fill: connectorColor, width: 0 } });
slide.shapes.add({ geometry: "rect", position: { left: 638, top: 214, width: 3, height: 353 }, fill: connectorColor, line: { fill: connectorColor, width: 0 } });
for (const y of [218, 330, 442, 554]) {
  slide.shapes.add({ geometry: "rect", position: { left: 360, top: y + 37, width: 278, height: 3 }, fill: connectorColor, line: { fill: connectorColor, width: 0 } });
}
for (const y of [246, 386, 526]) {
  slide.shapes.add({ geometry: "rect", position: { left: 641, top: y + 37, width: 278, height: 3 }, fill: connectorColor, line: { fill: connectorColor, width: 0 } });
}

// Central hub
box(500, 300, 280, 184, "#082C69", "#082C69", 18);
text(526, 322, 228, 42, "COMPASS", 30, "#FFFFFF", true, "center");
text(526, 366, 228, 30, "Common operational platform", 15, "#AEE5C1", true, "center");
text(530, 405, 220, 55, "Shared data • role-based workflows\nreal-time visibility • governed outputs", 13, "#E6F0FC", false, "center");

const modules = [
  { x: 42, y: 180, w: 340, h: 90, color: "#0B5FA5", title: "Integrated Crew Management", body: "Duty roster, leave and training\nApprovals, replacement and coverage" },
  { x: 42, y: 292, w: 340, h: 90, color: "#147D64", title: "Health Card & RTG Availability", body: "Generation and schedule snapshots\nTelemetry availability and integrity" },
  { x: 42, y: 404, w: 340, h: 90, color: "#6A4BC3", title: "Data Validation", body: "Quality and completeness checks\nExceptions and correction workflow" },
  { x: 42, y: 516, w: 340, h: 90, color: "#C35B16", title: "Report Generation", body: "Standard and custom reports\nExport-ready charts and summaries" },
  { x: 898, y: 208, w: 340, h: 90, color: "#0B5FA5", title: "Frequency Event Analysis", body: "Deviation trends and event timeline\nAlerts and disturbance review" },
  { x: 898, y: 348, w: 340, h: 90, color: "#147D64", title: "Operational Dashboards", body: "PSP and national plots\nSchedule, generation and deviation views" },
  { x: 898, y: 488, w: 340, h: 90, color: "#6A4BC3", title: "Document Repository", body: "Meeting records and controlled files\nSearch, retrieval and version tracking" },
];

for (const m of modules) {
  box(m.x, m.y, m.w, m.h, "#FFFFFF", "#CFDDEA");
  slide.shapes.add({ geometry: "roundRect", position: { left: m.x + 12, top: m.y + 14, width: 8, height: 62 }, fill: m.color, line: { fill: m.color, width: 0 }, cornerRadius: 4 });
  text(m.x + 30, m.y + 9, m.w - 44, 31, m.title, 15.2, "#102A43", true);
  text(m.x + 30, m.y + 40, m.w - 44, 42, m.body, 11.4, "#52677A");
}

text(42, 650, 1196, 28,
  "Outcome: one operational view for faster coordination, consistent decisions and traceable reporting",
  15.5, "#FFFFFF", true, "center").fill = "#079447";
slide.shapes.add({ geometry: "rect", position: { left: 42, top: 648, width: 1196, height: 32 }, fill: "#079447", line: { fill: "#079447", width: 0 } });
// Re-add footer text above the green bar.
text(54, 650, 1172, 27,
  "Outcome: one operational view for faster coordination, consistent decisions and traceable reporting",
  15.5, "#FFFFFF", true, "center");

slide.speakerNotes.textFrame.setText("Content based on the user-provided COMPASS module reference image. No external factual claims added.");

const preview = await deck.export({ slide, format: "png", scale: 1 });
await fs.writeFile(path.join(buildDir, "compass-overview-preview.png"), new Uint8Array(await preview.arrayBuffer()));

const candidatePath = path.join(buildDir, "compass-overview-candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);

await finalizePresentation({
  explicitTotalSlideCount: 1,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "COMPASS_Integrated_Operations_Overview_v2.validation.json"),
});

console.log(finalPath);
